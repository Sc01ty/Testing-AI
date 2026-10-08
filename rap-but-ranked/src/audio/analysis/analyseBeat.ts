import { computePeaks, mixToMono } from './peaks'
import { detectTempo, type TempoResult } from './tempo'

/**
 * File → everything the beat setup screen needs:
 *   decode (browser codec) → waveform peaks → tempo + approximate bar 1.
 */
export interface BeatAnalysis {
  durationSec: number
  peaks: number[]
  tempo: TempoResult
}

export type AnalysisStep = 'decode' | 'waveform' | 'tempo'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
const ACCEPTED_EXT = /\.(mp3|wav)$/i
export const PEAK_COLUMNS = 1600
const DECODE_RATE = 44100
const TEMPO_RATE = 22050

export function isSupportedAudio(file: File) {
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.test(file.name)
}

export class AnalysisError extends Error {}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer()
  // An OfflineAudioContext can decode without a user gesture or audio device
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE)
  try {
    return await ctx.decodeAudioData(data)
  } catch {
    throw new AnalysisError("Couldn't read that audio. Is it a real MP3 or WAV file?")
  }
}

/** Halve the sample rate with a 2-tap average (enough for onset detection). */
function downsample(mono: Float32Array, from: number, to: number) {
  const factor = Math.round(from / to)
  if (factor <= 1) return mono
  const out = new Float32Array(Math.floor(mono.length / factor))
  for (let i = 0; i < out.length; i++) {
    let s = 0
    for (let k = 0; k < factor; k++) s += mono[i * factor + k]
    out[i] = s / factor
  }
  return out
}

function tempoInWorker(mono: Float32Array, sampleRate: number): Promise<TempoResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./tempo.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      reject(e)
      return
    }
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: TempoResult; error?: string }>) => {
      worker.terminate()
      if (e.data.ok && e.data.result) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(e)
    }
    worker.postMessage({ mono, sampleRate }, [mono.buffer])
  })
}

export async function analyseBeat(file: Blob, onStep: (step: AnalysisStep) => void = () => {}) {
  onStep('decode')
  const buffer = await decodeAudio(file)
  if (buffer.duration < 2) throw new AnalysisError('That file is under 2 seconds — too short to be a beat.')

  onStep('waveform')
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const peaks = computePeaks(channels, PEAK_COLUMNS)

  onStep('tempo')
  // decoding is always at 44.1k, so this is a fresh half-rate copy the worker can take ownership of
  const factor = Math.max(1, Math.round(buffer.sampleRate / TEMPO_RATE))
  const rate = buffer.sampleRate / factor
  const mono = factor > 1 ? downsample(mixToMono(channels), buffer.sampleRate, TEMPO_RATE) : mixToMono(channels).slice()
  let tempo: TempoResult
  try {
    tempo = await tempoInWorker(mono, rate)
  } catch {
    // workers unavailable (old browser / blocked): do it here, slower but fine
    tempo = detectTempo(downsample(mixToMono(channels), buffer.sampleRate, TEMPO_RATE), rate)
  }

  const analysis: BeatAnalysis = { durationSec: buffer.duration, peaks, tempo }
  return { analysis, buffer }
}

/** "my_beat-final (prod. x).mp3" → "my beat final (prod. x)" */
export function nameFromFile(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
  return (base || 'Untitled beat').slice(0, 60)
}
