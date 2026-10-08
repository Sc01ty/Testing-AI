/**
 * Tempo + downbeat estimate from raw audio. Pure functions (no Web Audio),
 * so they run in a worker and in unit tests.
 *
 * 1. Onset envelope: short-frame energy in a low band (kicks) and a high
 *    band (snares / hats), log-compressed, rising edges only.
 * 2. Tempo: score every candidate BPM by how strongly the envelope repeats
 *    at 1, 2, 4 beats (autocorrelation), with a mild preference for
 *    typical rap tempos. Then refine the winner using repeats many bars
 *    later, which pins the BPM to a fraction of a beat-per-minute.
 * 3. Start: first non-silent moment, nudged to the beat phase where the
 *    onsets line up best — an *approximate* bar 1.
 *
 * Honest limits: assumes a steady tempo; half/double-time is genuinely
 * ambiguous (a 140 trap beat is also a 70 beat), so alternatives are
 * returned and the UI lets the user halve/double or override.
 */

export interface TempoResult {
  bpm: number
  /** 0..1 — how clearly one tempo stood out. */
  confidence: number
  /** Other plausible readings (usually half / double). */
  alternatives: number[]
  /** Seconds to the first sound (leading silence trimmed). */
  soundStart: number
  /** Approximate bar 1 beat 1, in seconds. */
  downbeat: number
}

const HOP = 256

function onePoleCoeff(cutoffHz: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate)
}

/** Onset strength per frame at sampleRate / HOP frames per second. */
export function onsetEnvelope(mono: Float32Array, sampleRate: number) {
  const frames = Math.floor(mono.length / HOP)
  const low = new Float32Array(frames)
  const high = new Float32Array(frames)
  const aLow = onePoleCoeff(150, sampleRate)
  const aHigh = onePoleCoeff(2500, sampleRate)
  let lp = 0
  let lp2 = 0
  let hpBase = 0
  for (let f = 0; f < frames; f++) {
    let eLow = 0
    let eHigh = 0
    const base = f * HOP
    for (let i = 0; i < HOP; i++) {
      const x = mono[base + i]
      lp += aLow * (x - lp)
      lp2 += aLow * (lp - lp2) // 2-pole lowpass
      hpBase += aHigh * (x - hpBase)
      const h = x - hpBase // 1-pole highpass
      eLow += lp2 * lp2
      eHigh += h * h
    }
    low[f] = Math.log1p(1000 * (eLow / HOP))
    high[f] = Math.log1p(1000 * (eHigh / HOP))
  }
  const env = new Float32Array(frames)
  const kick = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    const dl = low[f] - low[f - 1]
    const dh = high[f] - high[f - 1]
    kick[f] = dl > 0 ? dl : 0
    env[f] = kick[f] * 1.4 + (dh > 0 ? dh : 0)
  }
  // remove the slow-moving mean so sustained sections don't bias correlation
  const win = Math.max(1, Math.round((sampleRate / HOP) * 1.0))
  const out = new Float32Array(frames)
  let acc = 0
  for (let f = 0; f < frames; f++) {
    acc += env[f]
    if (f >= win) acc -= env[f - win]
    const mean = acc / Math.min(f + 1, win)
    const v = env[f] - mean
    out[f] = v > 0 ? v : 0
  }
  return { env: centre(out), kick: centre(kick), frameRate: sampleRate / HOP }
}

/** Zero-mean copy, so autocorrelation contrasts "repeats here" against "doesn't". */
function centre(x: Float32Array) {
  let mean = 0
  for (let i = 0; i < x.length; i++) mean += x[i]
  mean /= Math.max(1, x.length)
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[i] - mean
  return out
}

/** Autocorrelation at a fractional lag (linear interpolation), normalised by overlap. */
function acfAt(env: Float32Array, lag: number) {
  const i = Math.floor(lag)
  const frac = lag - i
  const n = env.length - i - 1
  if (n <= 0) return 0
  let s0 = 0
  let s1 = 0
  for (let k = 0; k < n; k++) {
    const e = env[k]
    s0 += e * env[k + i]
    s1 += e * env[k + i + 1]
  }
  return (s0 * (1 - frac) + s1 * frac) / n
}

/** Mild log-scale preference centred on ~90 BPM, wide enough for trap/drill. */
function tempoPrior(bpm: number) {
  const x = Math.log2(bpm / 90)
  return Math.exp(-0.5 * (x / 1.1) ** 2)
}

export function scoreBpm(env: Float32Array, frameRate: number, bpm: number, multiples: number[]) {
  const beat = (60 / bpm) * frameRate
  let s = 0
  let w = 0
  for (const m of multiples) {
    const lag = beat * m
    if (lag >= env.length - 2) break
    const weight = 1 / Math.pow(m, 0.25)
    s += acfAt(env, lag) * weight
    w += weight
  }
  return w ? s / w : 0
}

export function detectTempo(mono: Float32Array, sampleRate: number): TempoResult {
  const soundStart = findSoundStart(mono, sampleRate)
  const startSample = Math.floor(soundStart * sampleRate)
  // analyse up to 90s after the sound starts — plenty, and keeps it fast
  const end = Math.min(mono.length, startSample + Math.floor(90 * sampleRate))
  const { env, kick, frameRate } = onsetEnvelope(mono.subarray(startSample, end), sampleRate)

  const energy = env.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, env.length)
  if (env.length < frameRate * 3 || energy === 0) {
    return { bpm: 90, confidence: 0, alternatives: [], soundStart, downbeat: soundStart }
  }

  // coarse scan
  const coarse: { bpm: number; raw: number; score: number }[] = []
  for (let bpm = 55; bpm <= 200; bpm += 0.5) {
    const raw = scoreBpm(env, frameRate, bpm, [1, 2, 4, 8, 16])
    coarse.push({ bpm, raw, score: raw * tempoPrior(bpm) })
  }
  const best = coarse.reduce((a, b) => (b.score > a.score ? b : a))

  // refine using long-range repeats (up to 32 beats away)
  const longMultiples = [1, 2, 4, 8, 16, 32]
  let refined = best.bpm
  let refinedScore = -Infinity
  for (let bpm = best.bpm - 1.5; bpm <= best.bpm + 1.5; bpm += 0.02) {
    const s = scoreBpm(env, frameRate, bpm, longMultiples)
    if (s > refinedScore) {
      refinedScore = s
      refined = bpm
    }
  }

  // confidence: how clearly the winner beats its strongest *unrelated* rival
  // (half / double readings are the same answer, so they don't count against it)
  const related = (b: number) => [0.5, 1, 2].some((k) => Math.abs(b / (best.bpm * k) - 1) < 0.04)
  const rival = coarse.filter((c) => !related(c.bpm)).reduce((m, c) => Math.max(m, c.score), 0)
  const confidence = best.score > 0 ? Math.max(0, Math.min(1, (best.score - rival) / best.score / 0.35)) : 0

  const alternatives = [refined / 2, refined * 2].filter((b) => b >= 50 && b <= 220).map((b) => Math.round(b * 10) / 10)
  const downbeat = findDownbeat(kick, frameRate, refined, soundStart)
  return { bpm: refined, confidence, alternatives, soundStart, downbeat }
}

/** First moment the audio rises above -45 dBFS (short RMS window). */
export function findSoundStart(mono: Float32Array, sampleRate: number) {
  const win = Math.max(1, Math.floor(sampleRate * 0.01))
  const threshold = Math.pow(10, -45 / 20)
  for (let i = 0; i + win <= mono.length; i += win) {
    let sum = 0
    for (let k = i; k < i + win; k++) sum += mono[k] * mono[k]
    if (Math.sqrt(sum / win) > threshold) return Math.max(0, i / sampleRate - 0.005)
  }
  return 0
}

/**
 * Pick where bar 1 starts: the beat phase (within one bar of the first
 * sound) where kick onsets line up best. Kicks on beats 1 and 3 make
 * half-bar positions look equally good, so among near-ties we take the
 * earliest — beats usually start on the one.
 */
function findDownbeat(kick: Float32Array, frameRate: number, bpm: number, soundStart: number) {
  const beat = (60 / bpm) * frameRate
  const bar = beat * 4
  const span = Math.min(kick.length, Math.floor(frameRate * 40))
  const peakNear = (t: number) => {
    const i = Math.round(t)
    return Math.max(kick[i - 1] ?? 0, kick[i] ?? 0, kick[i + 1] ?? 0)
  }
  const scores: { phase: number; score: number }[] = []
  for (let phase = 0; phase < bar; phase += 1) {
    let s = 0
    for (let t = phase; t < span; t += bar) s += peakNear(t)
    scores.push({ phase, score: s })
  }
  const max = Math.max(...scores.map((x) => x.score))
  if (max <= 0) return soundStart
  const chosen = scores.find((x) => x.score >= max * 0.85)!
  return soundStart + chosen.phase / frameRate
}
