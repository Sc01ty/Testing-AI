/**
 * BPM → beat/bar grid. Deliberately simple: a constant tempo from the intro
 * offset, in 4/4 unless told otherwise. Play mode uses this to know where
 * "bars 5–6" start and end in the beat.
 */
export interface GridInput {
  bpm: number
  introOffset: number
  durationSec: number
  beatsPerBar?: number
}

export interface BeatGrid {
  secondsPerBeat: number
  secondsPerBar: number
  beatsPerBar: number
  /** Whole bars that fit between the offset and the end. */
  barCount: number
}

export function gridFor({ bpm, introOffset, durationSec, beatsPerBar = 4 }: GridInput): BeatGrid {
  const secondsPerBeat = 60 / bpm
  const secondsPerBar = secondsPerBeat * beatsPerBar
  const usable = Math.max(0, durationSec - introOffset)
  // tolerate float error so a beat that's exactly N bars long counts N
  const barCount = Math.floor(usable / secondsPerBar + 1e-6)
  return { secondsPerBeat, secondsPerBar, beatsPerBar, barCount }
}

/** Start time (seconds into the file) of bar `index` (0-based). */
export function barStart(grid: BeatGrid, introOffset: number, index: number) {
  return introOffset + index * grid.secondsPerBar
}

/** Every bar start in the file, including partial bars before the offset (negative indices) when asked. */
export function barTimes(input: GridInput, { includeIntro = false } = {}): { index: number; time: number }[] {
  const g = gridFor(input)
  const out: { index: number; time: number }[] = []
  if (includeIntro) {
    for (let i = -1; input.introOffset + i * g.secondsPerBar >= -1e-6; i--) out.unshift({ index: i, time: input.introOffset + i * g.secondsPerBar })
  }
  for (let i = 0; i <= g.barCount; i++) {
    const time = input.introOffset + i * g.secondsPerBar
    if (time > input.durationSec + 1e-6) break
    out.push({ index: i, time })
  }
  return out
}

/** Beat (quarter-note) times inside the usable region. */
export function beatTimes(input: GridInput): number[] {
  const g = gridFor(input)
  const out: number[] = []
  for (let t = input.introOffset; t <= input.durationSec + 1e-6; t += g.secondsPerBeat) out.push(t)
  return out
}

export const BPM_MIN = 40
export const BPM_MAX = 240

export function clampBpm(v: number) {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, v))
}

/** Most beats are made at an integer tempo; keep one decimal otherwise. */
export function tidyBpm(v: number) {
  const r = Math.round(v)
  return Math.abs(v - r) < 0.15 ? r : Math.round(v * 10) / 10
}
