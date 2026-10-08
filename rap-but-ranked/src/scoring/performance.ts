import type { CategoryScore } from '../domain/types'

/**
 * What we can honestly measure from a recording:
 *   - did you rap through the two bars (vocal activity coverage)
 *   - do your syllable onsets land on the beat grid (16th notes)
 *   - long dead gaps
 * Not measured: tone, voice quality, charisma — no number from a mic
 * signal can judge those fairly.
 */
export interface PerformanceInput {
  samples: Float32Array
  sampleRate: number
  /** Beat-file second of sample 0. */
  beatTimeSec: number
  sectionStart: number
  sectionEnd: number
  secondsPerBeat: number
  /** Estimated syllables in the written bars (to sanity-check onset counts). */
  lyricSyllables: number
}

export interface PerformanceAnalysis {
  peak: number
  coverage: number
  onsets: number[]
  /** Mean distance from the nearest 16th, as a fraction of half a 16th (0 = dead on, 0.5 ≈ random). */
  meanDeviation: number | null
  longestGapSec: number
  tooQuiet: boolean
  clipping: boolean
}

const FRAME = 0.01

export function analysePerformance(p: PerformanceInput): PerformanceAnalysis {
  const hop = Math.max(1, Math.round(p.sampleRate * FRAME))
  const frames = Math.floor(p.samples.length / hop)
  const rms = new Float32Array(frames)
  let peak = 0
  for (let f = 0; f < frames; f++) {
    let s = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const v = p.samples[i]
      s += v * v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    rms[f] = Math.sqrt(s / hop)
  }
  const timeOf = (f: number) => p.beatTimeSec + f * FRAME
  const inSection = (t: number) => t >= p.sectionStart - 0.05 && t <= p.sectionEnd
  const sectionFrames: number[] = []
  for (let f = 0; f < frames; f++) if (inSection(timeOf(f))) sectionFrames.push(f)

  const sorted = sectionFrames.map((f) => rms[f]).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.98)] ?? 0
  const threshold = Math.max(floor * 2.5, loud * 0.12, 0.003)
  const tooQuiet = peak < 0.01 || loud < 0.006

  let active = 0
  let gap = 0
  let longestGap = 0
  for (const f of sectionFrames) {
    if (rms[f] > threshold) {
      active++
      gap = 0
    } else {
      gap++
      longestGap = Math.max(longestGap, gap)
    }
  }
  const coverage = sectionFrames.length ? active / sectionFrames.length : 0

  // onsets: sharp rises in level above the threshold, at least 70ms apart
  const onsets: number[] = []
  let last = -100
  for (let f = 2; f < frames; f++) {
    const rise = Math.log((rms[f] + 1e-5) / (rms[f - 2] + 1e-5))
    if (rms[f] > threshold && rise > 0.55 && f - last >= 7) {
      const t = timeOf(f - 1)
      if (inSection(t)) onsets.push(t)
      last = f
    }
  }

  let meanDeviation: number | null = null
  if (onsets.length >= 3) {
    const sixteenth = p.secondsPerBeat / 4
    const devs = onsets.map((t) => {
      const ph = (t - p.sectionStart) / sixteenth
      return Math.abs(ph - Math.round(ph)) // 0..0.5
    })
    meanDeviation = devs.reduce((a, b) => a + b, 0) / devs.length
  }

  return { peak, coverage, onsets, meanDeviation, longestGapSec: longestGap * FRAME, tooQuiet, clipping: peak > 0.985 }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function scoreFlow(a: PerformanceAnalysis, p: Pick<PerformanceInput, 'secondsPerBeat' | 'lyricSyllables'>): CategoryScore {
  const reasons: string[] = []
  if (a.tooQuiet || a.coverage < 0.04) {
    return {
      category: 'flow',
      label: 'Flow / timing',
      score: 4,
      basis: 'audio',
      reasons: ["We could barely hear you on the recording — check the mic is picking you up (see the level meter)."],
    }
  }
  // timing: random onsets average 0.25 (a quarter of a 16th away); tight rapping sits well under that
  const timing = a.meanDeviation === null ? 0.4 : clamp01((0.25 - a.meanDeviation) / 0.15)
  const coverage = clamp01(a.coverage / 0.55)
  const bar = p.secondsPerBeat * 4
  const pause = a.longestGapSec <= bar * 0.5 ? 1 : clamp01(1 - (a.longestGapSec - bar * 0.5) / bar)

  if (a.meanDeviation === null) reasons.push('Too few clear syllables to judge timing')
  else if (timing > 0.7) reasons.push('Syllables land tight on the beat grid')
  else if (timing > 0.35) reasons.push('Timing drifts off the beat in places')
  else reasons.push('Most syllables land between the beats — lock in with the kick and snare')
  reasons.push(`Rapped through ${Math.round(a.coverage * 100)}% of the two bars`)
  if (pause < 0.8) reasons.push(`Longest gap ${a.longestGapSec.toFixed(1)}s — the bar goes empty`)
  if (p.lyricSyllables > 0 && a.onsets.length < p.lyricSyllables * 0.25) reasons.push(`Heard ~${a.onsets.length} syllables for ${p.lyricSyllables} written — did the whole bar make it in?`)
  if (a.clipping) reasons.push('Mic is clipping — back off a little')

  const score = 100 * (0.5 * timing + 0.3 * coverage + 0.2 * pause)
  return { category: 'flow', label: 'Flow / timing', score: Math.round(Math.max(5, Math.min(100, score))), basis: 'audio', reasons }
}
