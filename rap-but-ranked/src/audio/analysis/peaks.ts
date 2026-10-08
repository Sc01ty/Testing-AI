/**
 * Waveform peaks from real audio: the max absolute sample in each of
 * `columns` equal slices, normalised so the loudest column is 1.
 */
export function computePeaks(channels: Float32Array[], columns: number): number[] {
  const length = channels[0]?.length ?? 0
  if (!length || columns <= 0) return []
  const out = new Array<number>(columns).fill(0)
  const step = length / columns
  let max = 0
  for (let c = 0; c < columns; c++) {
    const start = Math.floor(c * step)
    const end = Math.min(length, Math.floor((c + 1) * step))
    let peak = 0
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const v = ch[i] < 0 ? -ch[i] : ch[i]
        if (v > peak) peak = v
      }
    }
    out[c] = peak
    if (peak > max) max = peak
  }
  if (max === 0) return out
  // gentle curve so quiet sections stay visible next to a loud drop
  return out.map((v) => Math.round(Math.pow(v / max, 0.8) * 1000) / 1000)
}

/** Resample a peaks array to a different column count (for narrow rows). */
export function resamplePeaks(peaks: number[], columns: number): number[] {
  if (peaks.length === 0 || columns <= 0) return []
  const out = new Array<number>(columns)
  const step = peaks.length / columns
  for (let c = 0; c < columns; c++) {
    const start = Math.floor(c * step)
    const end = Math.max(start + 1, Math.floor((c + 1) * step))
    let m = 0
    for (let i = start; i < end && i < peaks.length; i++) m = Math.max(m, peaks[i])
    out[c] = m
  }
  return out
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const n = channels[0].length
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i]
  const k = 1 / channels.length
  for (let i = 0; i < n; i++) out[i] *= k
  return out
}
