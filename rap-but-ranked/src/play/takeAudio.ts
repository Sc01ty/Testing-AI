import { decodeWav } from '../audio/wav'
import { getTakeAudio } from '../storage/sessionStore'

/**
 * Recorded takes in memory (fresh recordings) with a fallback to the stored
 * WAV (after a refresh). Scoring needs raw samples; playback needs buffers.
 */
interface Samples {
  samples: Float32Array
  sampleRate: number
}
const samples = new Map<string, Samples>()
const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()

export function rememberTake(id: string, s: Samples) {
  samples.set(id, s)
}

export function forgetTake(id: string) {
  samples.delete(id)
}

export async function takeSamples(id: string): Promise<Samples | null> {
  const hit = samples.get(id)
  if (hit) return hit
  const blob = await getTakeAudio(id)
  if (!blob) return null
  const { channels, sampleRate } = await decodeWav(blob)
  const s = { samples: channels[0], sampleRate }
  samples.set(id, s)
  return s
}

export async function takeBuffer(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
  let map = buffers.get(ctx)
  if (!map) buffers.set(ctx, (map = new Map()))
  const hit = map.get(id)
  if (hit) return hit
  const s = await takeSamples(id)
  if (!s) return null
  const buf = ctx.createBuffer(1, s.samples.length, s.sampleRate)
  buf.copyToChannel(s.samples as Float32Array<ArrayBuffer>, 0)
  map.set(id, buf)
  return buf
}
