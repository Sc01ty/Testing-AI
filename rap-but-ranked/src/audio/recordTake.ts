import { computePeaks } from './analysis/peaks'
import { audio } from './AudioEngine'
import { beatPlayer, type PlayableBeat } from './BeatPlayer'
import { ClickTrack, type ClickGrid } from './metronome'
import { estimateLatency, mic } from './mic'
import { scheduleMix, type VocalClip } from './mix'
import { trackPlayer } from './trackPlayer'
import { settingsStore } from '../settings/settings'
import workletUrl from './recorder.worklet.js?url'

/**
 * Record two bars over the beat:
 *
 *   [ count-in bar: · 3 2 1 ] [ bar A ][ bar B ] (tail)
 *    beat + clicks + your last     beat + mic capture
 *    take (so the flow carries on)
 *
 * Everything is scheduled on the AudioContext clock. The mic is captured
 * by an AudioWorklet with frame timestamps, and the round-trip latency
 * (speaker out + mic in, plus the user's fine-tune) is subtracted, so
 * sample 0 of the take sits at a known beat position.
 */
export interface RecordPlan {
  beat: PlayableBeat
  sectionStart: number
  sectionEnd: number
  secondsPerBeat: number
  beatsPerBar: number
  /** Downbeat the metronome locks to (beat-file seconds). */
  gridOrigin: number
  /** Your previous take(s), heard during the count-in and cut at the bar line. */
  leadIn?: VocalClip[]
}

export type RecordPhase = 'preparing' | 'countin' | 'recording' | 'finishing'

export interface RecordCallbacks {
  onPhase?: (p: RecordPhase) => void
  /** 3, 2, 1 during the count-in; null otherwise. */
  onCount?: (n: number | null) => void
  /** Live vocal waveform so far (0..1 per column) + how far through the take we are (0..1). */
  onLive?: (peaks: number[], progress: number) => void
}

export interface RecordedTake {
  samples: Float32Array
  sampleRate: number
  /** Beat-file second of sample 0 (latency-compensated). */
  beatTimeSec: number
  latencySec: number
  inputPeak: number
  peaks: number[]
  durationSec: number
  sectionStart: number
  sectionEnd: number
}

export class RecordError extends Error {}

/** Allow coming in a beat early (pickups) and a little spill after bar 2. */
const PICKUP_BEATS = 1
const TAIL_SEC = 0.45
const LIVE_COLUMNS = 220

const workletReady = new WeakMap<BaseAudioContext, Promise<void>>()
export function loadWorklet(ctx: AudioContext) {
  let p = workletReady.get(ctx)
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl)
    workletReady.set(ctx, p)
  }
  return p
}

/**
 * Mic capture with sample-accurate timestamps: every chunk carries the
 * context frame it was captured at, so any window of context time can be
 * cut out exactly afterwards.
 */
export class Capture {
  readonly chunks: { frame: number; data: Float32Array }[] = []
  private node: AudioWorkletNode
  private sink: GainNode

  constructor(
    private ctx: AudioContext,
    private source: MediaStreamAudioSourceNode,
  ) {
    this.node = new AudioWorkletNode(ctx, 'rbr-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    source.connect(this.node)
    this.node.connect(this.sink).connect(ctx.destination)
    this.node.port.onmessage = (e: MessageEvent<{ frame: number; data: Float32Array }>) => this.chunks.push(e.data)
  }

  async stop() {
    this.node.port.postMessage('stop')
    await new Promise((r) => setTimeout(r, 80))
    this.node.port.onmessage = null
    this.source.disconnect(this.node)
    this.node.disconnect()
    this.sink.disconnect()
  }

  /** Samples between two context times (silence where nothing was captured). */
  window(start: number, end: number) {
    const sr = this.ctx.sampleRate
    const f0 = Math.round(start * sr)
    const f1 = Math.round(end * sr)
    const samples = new Float32Array(Math.max(0, f1 - f0))
    for (const c of this.chunks) {
      const s = c.frame - f0
      for (let i = 0; i < c.data.length; i++) {
        const j = s + i
        if (j >= 0 && j < samples.length) samples[j] = c.data[i]
      }
    }
    return samples
  }
}

export function peakOf(samples: Float32Array) {
  let p = 0
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i] < 0 ? -samples[i] : samples[i]
    if (a > p) p = a
  }
  return p
}

export function countClick(ctx: AudioContext, out: AudioNode, when: number, accent: boolean) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.value = accent ? 1760 : 1320
  g.gain.value = 0.0001
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.14, when + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  o.connect(g).connect(out)
  o.start(when)
  o.stop(when + 0.06)
  return o
}

export class TakeRecorder {
  private stopRequested = false
  private cancelled = false
  private running = false

  /** Finish now and keep what was recorded. */
  stop() {
    this.stopRequested = true
  }

  /** Abort and discard. */
  cancel() {
    this.cancelled = true
    this.stopRequested = true
  }

  get isRunning() {
    return this.running
  }

  async record(plan: RecordPlan, cb: RecordCallbacks = {}): Promise<RecordedTake | null> {
    if (this.running) throw new RecordError('Already recording.')
    this.running = true
    try {
      return await this.run(plan, cb)
    } finally {
      this.running = false
      audio.setMusicDucked(false)
    }
  }

  private async run(plan: RecordPlan, cb: RecordCallbacks): Promise<RecordedTake | null> {
    cb.onPhase?.('preparing')
    audio.unlock()
    if (!(await mic.ensure())) throw new RecordError(mic.getState().message ?? 'Microphone unavailable.')
    const ctx = audio.context
    const out = audio.beatOutput
    const source = mic.source
    if (!ctx || !out || !source) throw new RecordError('Audio is not ready — click anywhere and try again.')
    if (ctx.state !== 'running') await ctx.resume()
    const [buffer] = await Promise.all([beatPlayer.loadBuffer(plan.beat), loadWorklet(ctx)])
    if (this.cancelled) return null
    beatPlayer.stop()
    trackPlayer.stop()
    audio.setMusicDucked(true)

    const sr = ctx.sampleRate
    const spb = plan.secondsPerBeat
    const preroll = spb * plan.beatsPerBar
    const sectionDur = plan.sectionEnd - plan.sectionStart
    const lead = spb * PICKUP_BEATS
    const latency = estimateLatency(ctx)

    const capture = new Capture(ctx, source)
    const captured = capture.chunks
    let drawn = 0 // how many captured chunks the live waveform has used

    // schedule beat (from one bar before the section) + count-in clicks,
    // + your previous take through the count-in, cut at the bar line
    const t0 = ctx.currentTime + 0.2
    const sectionAt = t0 + preroll
    const leadIn = (plan.leadIn ?? []).map((c) => {
      const r = c.region ?? { start: c.beatTime, end: c.beatTime + c.buffer.duration, fadeIn: 0.012, fadeOut: 0.012 }
      return { ...c, region: { ...r, end: Math.min(r.end, plan.sectionStart), fadeOut: Math.min(r.end, plan.sectionStart) < r.end ? 0.04 : r.fadeOut } }
    })
    const scheduled = scheduleMix(ctx, out, buffer, leadIn, plan.sectionStart - preroll, plan.sectionEnd + Math.min(0.6, spb), t0)
    const clickOut = audio.clickOutput ?? out
    for (let k = 0; k < plan.beatsPerBar; k++) scheduled.push(countClick(ctx, clickOut, t0 + k * spb, k === 0))
    const metronome = new ClickTrack()
    const s = settingsStore.get()
    if (s.metronomeWhileRecording) {
      const grid: ClickGrid = { origin: plan.gridOrigin, secondsPerBeat: spb, beatsPerBar: plan.beatsPerBar }
      metronome.start({ at: sectionAt, from: plan.sectionStart, to: plan.sectionEnd, grid })
    }

    const winStart = sectionAt - lead + latency
    let winEnd = sectionAt + sectionDur + TAIL_SEC + latency
    const totalCols = LIVE_COLUMNS
    const livePeaks = new Array<number>(totalCols).fill(0)

    cb.onPhase?.('countin')
    let lastCount: number | null = -1
    let phase: RecordPhase = 'countin'

    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = ctx.currentTime
        // count-in display: beats 2–4 of the count-in bar show 3, 2, 1
        let count: number | null = null
        if (now < sectionAt) {
          const beatIdx = Math.floor((now - t0) / spb)
          count = beatIdx >= 1 ? plan.beatsPerBar - beatIdx : null
          if (beatIdx < 0) count = null
        }
        if (count !== lastCount) {
          lastCount = count
          cb.onCount?.(count)
        }
        if (phase === 'countin' && now >= sectionAt - 0.02) {
          phase = 'recording'
          cb.onPhase?.('recording')
        }
        // live waveform from captured chunks inside the window
        if (phase === 'recording') {
          const span = winEnd - winStart
          for (; drawn < captured.length; drawn++) {
            const c = captured[drawn]
            const t = c.frame / sr
            if (t + c.data.length / sr < winStart) continue
            let m = 0
            for (let i = 0; i < c.data.length; i++) {
              const v = Math.abs(c.data[i])
              if (v > m) m = v
            }
            const col = Math.floor(((t - winStart) / span) * totalCols)
            if (col >= 0 && col < totalCols) livePeaks[col] = Math.max(livePeaks[col], m)
          }
          cb.onLive?.(livePeaks.slice(), Math.min(1, Math.max(0, (now - winStart) / span)))
        }
        if (this.stopRequested) {
          winEnd = Math.min(winEnd, now)
          resolve()
          return
        }
        if (now >= winEnd + 0.12) {
          resolve()
          return
        }
        window.setTimeout(tick, 25)
      }
      window.setTimeout(tick, 0)
    })

    cb.onPhase?.('finishing')
    cb.onCount?.(null)
    metronome.stop()
    await capture.stop()
    for (const s of scheduled) {
      try {
        s.stop()
      } catch {
        /* already done */
      }
    }

    if (this.cancelled || winEnd <= winStart + 0.3) return null

    const samples = capture.window(winStart, winEnd)
    const inputPeak = peakOf(samples)

    return {
      samples,
      sampleRate: sr,
      beatTimeSec: plan.sectionStart - lead,
      latencySec: latency,
      inputPeak,
      peaks: computePeaks([samples], 400),
      durationSec: samples.length / sr,
      sectionStart: plan.sectionStart,
      sectionEnd: plan.sectionEnd,
    }
  }
}
