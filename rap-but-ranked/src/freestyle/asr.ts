import { useSyncExternalStore } from 'react'
import type { TranscriptWord } from '../domain/types'

/**
 * Speech recognition for freestyles — Whisper base running on this device
 * (WebAssembly, in a worker). ~77 MB, downloaded the first time and cached
 * by the browser. Nothing is sent anywhere; no API key.
 */
export const ASR_SIZE_MB = 77
export const ASR_MODEL_NAME = 'Whisper base'
const MODEL_ID = 'onnx-community/whisper-base_timestamped'
/** Whisper's window is 30s; ~28s pieces proved the most reliable (20s pieces and its own chunking dropped words). */
const SEGMENT_SEC = 28

export type AsrStatus = 'unknown' | 'not-downloaded' | 'cached' | 'downloading' | 'ready' | 'working' | 'error'
export interface AsrState {
  status: AsrStatus
  /** 0..1 while downloading / transcribing. */
  progress: number
  detail: string
  error: string | null
}

type Listener = () => void

class Transcriber {
  private state: AsrState = { status: 'unknown', progress: 0, detail: '', error: null }
  private listeners = new Set<Listener>()
  private worker: Worker | null = null
  private loading: Promise<boolean> | null = null
  private pending = new Map<number, { resolve: (w: { text: string; words: TranscriptWord[] }) => void; reject: (e: Error) => void }>()
  private nextId = 1

  getState = () => this.state
  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Is the model already in the browser cache? (cheap; no download) */
  async detect() {
    if (this.state.status !== 'unknown' && this.state.status !== 'not-downloaded') return
    let cached = false
    try {
      const cache = await caches.open('transformers-cache')
      cached = (await cache.keys()).some((r) => r.url.includes(MODEL_ID) && r.url.includes('decoder_model_merged'))
    } catch {
      /* no Cache API */
    }
    if (this.state.status === 'unknown' || this.state.status === 'not-downloaded') this.set({ status: cached ? 'cached' : 'not-downloaded' })
  }

  load(): Promise<boolean> {
    if (this.state.status === 'ready' || this.state.status === 'working') return Promise.resolve(true)
    if (this.loading) return this.loading
    this.set({ status: 'downloading', progress: 0, detail: 'Starting…', error: null })
    this.loading = new Promise<boolean>((resolve) => {
      const w = this.ensureWorker()
      const onMsg = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'progress') {
          const p = m.total ? m.loaded / m.total : 0
          this.set({ progress: p, detail: `${Math.round(m.loaded / 1e6)} / ${Math.round(m.total / 1e6)} MB` })
        } else if (m.type === 'ready') {
          w.removeEventListener('message', onMsg)
          this.set({ status: 'ready', progress: 1, detail: 'Ready' })
          resolve(true)
        } else if (m.type === 'error' && m.id === undefined) {
          w.removeEventListener('message', onMsg)
          this.set({ status: 'error', error: m.message, detail: '' })
          this.loading = null
          resolve(false)
        }
      }
      w.addEventListener('message', onMsg)
      w.postMessage({ type: 'load' })
    })
    return this.loading
  }

  /**
   * Transcribe a take. `startTime` is the timeline second of sample 0; the
   * words come back in timeline seconds. Long takes are cut into ~28s
   * pieces at quiet moments, so no word is split and progress is real.
   */
  async transcribe(samples: Float32Array, sampleRate: number, startTime: number): Promise<{ text: string; words: TranscriptWord[] }> {
    if (!(await this.load())) throw new Error(this.state.error ?? 'Speech recognition could not load.')
    const audio16 = await resample(samples, sampleRate, 16000)
    const cuts = cutPoints(audio16, 16000, SEGMENT_SEC)
    const words: TranscriptWord[] = []
    const texts: string[] = []
    this.set({ status: 'working', progress: 0, detail: 'Listening back…' })
    try {
      for (let i = 0; i < cuts.length - 1; i++) {
        const piece = audio16.slice(cuts[i], cuts[i + 1])
        const off = startTime + cuts[i] / 16000
        const dur = piece.length / 16000
        const tidy = (ws: TranscriptWord[]) => cleanWords(ws.filter((w) => w.text && w.start >= 0 && w.start <= dur + 0.5))
        const first = (await this.request(piece, 'word')).words
        let clean = tidy(first)
        // Whisper sometimes stops early, or gets stuck looping a phrase. If far fewer words
        // came back than there was voice, or a loop had to be cut out, ask again with line
        // timestamps and keep whichever reading is cleaner.
        const voiced = voicedSeconds(piece, 16000)
        const looped = first.length - clean.length > 6
        if (looped || (voiced >= 3 && clean.length < voiced * 0.8)) {
          const second = (await this.request(piece, 'line')).words
          const retry = tidy(second)
          const retryLooped = second.length - retry.length > 6
          if ((looped && !retryLooped) || (!retryLooped && retry.length > clean.length)) clean = retry
        }
        texts.push(clean.map((w) => w.text).join(' '))
        for (const w of clean) words.push({ text: w.text, start: w.start + off, end: w.end + off })
        this.set({ progress: (i + 1) / (cuts.length - 1) })
      }
    } finally {
      this.set({ status: 'ready', detail: 'Ready' })
    }
    return { text: texts.join(' ').replace(/\s+/g, ' ').trim(), words }
  }

  private request(audio: Float32Array, mode: 'word' | 'line') {
    const id = this.nextId++
    const w = this.ensureWorker()
    const copy = audio.slice()
    return new Promise<{ text: string; words: TranscriptWord[] }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      w.postMessage({ type: 'transcribe', id, audio: copy, mode }, [copy.buffer])
    })
  }

  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' })
      this.worker.addEventListener('message', (e: MessageEvent) => {
        const m = e.data
        if ((m.type === 'result' || m.type === 'error') && m.id !== undefined) {
          const p = this.pending.get(m.id)
          this.pending.delete(m.id)
          if (m.type === 'result') p?.resolve({ text: m.text, words: m.words })
          else p?.reject(new Error(m.message))
        }
      })
    }
    return this.worker
  }

  private set(patch: Partial<AsrState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }
}

export const transcriber = new Transcriber()

export function useTranscriber() {
  return useSyncExternalStore(transcriber.subscribe, transcriber.getState, transcriber.getState)
}

/**
 * Whisper sometimes gets stuck repeating a phrase over noise or a dropout
 * ("i saw it i saw it i saw it…"). Keep at most two back-to-back repeats of
 * any 1–12 word phrase; a real rapper repeating a hook more than that is rare,
 * a stuck model is not.
 */
export function cleanWords<T extends { text: string }>(words: T[]): T[] {
  const key = (w: T) => w.text.toLowerCase().replace(/[^a-z0-9']/g, '')
  let out = [...words]
  for (let n = 1; n <= 12; n++) {
    const kept: T[] = []
    let i = 0
    while (i < out.length) {
      let reps = 1
      const same = (a: number, b: number) => {
        for (let k = 0; k < n; k++) if (a + k >= out.length || b + k >= out.length || key(out[a + k]) !== key(out[b + k])) return false
        return true
      }
      while (same(i, i + reps * n)) reps++
      if (reps > 2) {
        kept.push(...out.slice(i, i + 2 * n))
        i += reps * n
      } else {
        kept.push(out[i])
        i++
      }
    }
    out = kept
  }
  return out
}

/** Seconds of audio louder than the take's quiet floor (roughly: how long someone was talking). */
export function voicedSeconds(samples: Float32Array, sr: number) {
  const hop = Math.round(sr * 0.02)
  const rms: number[] = []
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0
    for (let k = i; k < i + hop; k++) s += samples[k] * samples[k]
    rms.push(Math.sqrt(s / hop))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.98)] ?? 0
  const thr = Math.max(Math.min(floor * 3, loud * 0.5), loud * 0.1, 0.003)
  return rms.filter((v) => v > thr).length * 0.02
}

async function resample(samples: Float32Array, from: number, to: number) {
  if (from === to) return samples.slice()
  const frames = Math.ceil((samples.length * to) / from)
  const ctx = new OfflineAudioContext(1, frames, to)
  const buf = ctx.createBuffer(1, samples.length, from)
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  return (await ctx.startRendering()).getChannelData(0)
}

/** Segment boundaries (sample indexes) ~every `seg` seconds, each moved to the quietest 20ms within ±2s. */
export function cutPoints(samples: Float32Array, sr: number, seg: number) {
  const cuts = [0]
  const win = Math.round(sr * 0.02)
  for (let target = seg * sr; target < samples.length - sr * 4; target += seg * sr) {
    let best = target
    let bestE = Infinity
    for (let c = target - 2 * sr; c <= target + 2 * sr; c += win) {
      let e = 0
      for (let i = c; i < c + win && i < samples.length; i++) e += samples[i] * samples[i]
      if (e < bestE) {
        bestE = e
        best = c
      }
    }
    cuts.push(Math.round(best))
    target = best
  }
  cuts.push(samples.length)
  return cuts
}
