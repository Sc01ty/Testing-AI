/**
 * Turns separately recorded 2-bar takes into one continuous vocal.
 *
 * Every take is recorded a beat early (pickups) and runs a little past its
 * last bar (tails), so neighbouring takes overlap. Played naively, both
 * takes sound in that overlap — doubled room noise, doubled beat bleed.
 * Here each seam is cut at the quietest moment inside the overlap and
 * joined with a short crossfade, so:
 *
 *   - every take stays at its recorded beat position (your timing is kept,
 *     nothing is shifted or snapped);
 *   - no silence is ever inserted — the only quiet is the quiet you left;
 *   - the start of the song and the end are trimmed to the voice
 *     (leading silence, count-in bleed), keeping a natural breath / tail;
 *   - takes are levelled to a common loudness so seams don't jump.
 */
export interface TakeInput {
  id: string
  samples: Float32Array
  sampleRate: number
  /** Timeline second of sample 0. */
  startTime: number
  /** The bars this take is for (timeline seconds) — decides who is next to whom. */
  sectionStart: number
  sectionEnd: number
}

export interface TakeRegion {
  id: string
  /** Timeline seconds of the take to play. */
  start: number
  end: number
  fadeIn: number
  fadeOut: number
  gain: number
}

const FRAME = 0.01
const SEAM_FADE = 0.02
const EDGE_FADE_IN = 0.03
const EDGE_FADE_OUT = 0.15
const LEAD_KEEP = 0.12 // keep this much before the first word (breath in)
const TAIL_KEEP = 0.35 // and this much after the last (release, breath out)
/** Target loudness of the voiced parts (RMS), roughly −16 dBFS. */
const TARGET_RMS = 0.16

export interface Envelope {
  rms: Float32Array
  /** Level we call "voice" for this take. */
  threshold: number
  voicedRms: number
  peak: number
}

export function envelope(samples: Float32Array, sampleRate: number): Envelope {
  const hop = Math.max(1, Math.round(sampleRate * FRAME))
  const n = Math.floor(samples.length / hop)
  const rms = new Float32Array(n)
  let peak = 0
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const v = samples[i]
      s += v * v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    rms[f] = Math.sqrt(s / hop)
  }
  const sorted = Array.from(rms).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.98)] ?? 0
  // (a take that never pauses has no noise floor to measure: cap at half the loud level)
  const threshold = Math.max(Math.min(floor * 3, loud * 0.5), loud * 0.1, 0.002)
  let sum = 0
  let count = 0
  for (const v of rms)
    if (v > threshold) {
      sum += v * v
      count++
    }
  return { rms, threshold, voicedRms: count ? Math.sqrt(sum / count) : 0, peak }
}

/** First / last frame of sustained voice (≥ minFrames in a row), or null. */
function voicedSpan(env: Envelope, minFrames = 8): [number, number] | null {
  let first = -1
  let run = 0
  for (let f = 0; f < env.rms.length; f++) {
    run = env.rms[f] > env.threshold ? run + 1 : 0
    if (run >= minFrames) {
      first = f - run + 1
      break
    }
  }
  if (first < 0) return null
  let last = -1
  run = 0
  for (let f = env.rms.length - 1; f >= 0; f--) {
    run = env.rms[f] > env.threshold ? run + 1 : 0
    if (run >= Math.min(minFrames, 4)) {
      last = f + run - 1
      break
    }
  }
  return [first, Math.max(first, last)]
}

/** Gain that brings a take's voiced level to the common target, without clipping it. */
export function levelGain(env: Envelope) {
  if (env.peak < 0.0005 || env.voicedRms <= 0) return 1
  const g = Math.min(8, Math.max(0.5, TARGET_RMS / env.voicedRms))
  return Math.min(g, 0.98 / env.peak)
}

export function arrangeTakes(takes: TakeInput[]): TakeRegion[] {
  const items = [...takes]
    .sort((a, b) => a.sectionStart - b.sectionStart)
    .map((t) => {
      const env = envelope(t.samples, t.sampleRate)
      const duration = t.samples.length / t.sampleRate
      return {
        t,
        env,
        gain: levelGain(env),
        region: { id: t.id, start: t.startTime, end: t.startTime + duration, fadeIn: 0.012, fadeOut: 0.012, gain: 1 } as TakeRegion,
      }
    })

  // level: every take to the same voiced loudness (a take recorded further
  // from the mic comes up to match the rest; peaks are never pushed past 0 dBFS)
  for (const i of items) i.region.gain = i.gain

  const adjacent = (a: TakeInput, b: TakeInput) => Math.abs(a.sectionEnd - b.sectionStart) < 0.02
  const level = (it: (typeof items)[number], time: number) => {
    const f = Math.floor((time - it.t.startTime) / FRAME)
    return f >= 0 && f < it.env.rms.length ? it.env.rms[f] * it.region.gain : 0
  }

  for (let k = 0; k < items.length; k++) {
    const cur = items[k]
    const prev = items[k - 1]
    const next = items[k + 1]
    const span = voicedSpan(cur.env)

    // start: seam with the previous take, or trimmed to the first word
    if (!prev || !adjacent(prev.t, cur.t)) {
      if (span) cur.region.start = Math.max(cur.region.start, cur.t.startTime + span[0] * FRAME - LEAD_KEEP)
      cur.region.fadeIn = EDGE_FADE_IN
    }
    // end: trimmed after the last word if nothing follows
    if (!next || !adjacent(cur.t, next.t)) {
      if (span) cur.region.end = Math.min(cur.region.end, cur.t.startTime + (span[1] + 1) * FRAME + TAIL_KEEP)
      cur.region.fadeOut = EDGE_FADE_OUT
      continue
    }

    // seam: where both takes are quietest inside their overlap
    const ovStart = Math.max(next.region.start, cur.region.start)
    const ovEnd = Math.min(cur.region.end, next.t.startTime + next.t.samples.length / next.t.sampleRate)
    const bar = next.t.sectionStart
    if (ovEnd - ovStart < SEAM_FADE * 2) {
      cur.region.fadeOut = next.region.fadeIn = 0.012
      continue
    }
    const ref = TARGET_RMS
    let best = bar
    let bestCost = Infinity
    for (let time = ovStart + SEAM_FADE; time <= ovEnd - SEAM_FADE; time += FRAME) {
      // 50ms neighbourhood, so a single quiet frame mid-word isn't chosen
      let cost = 0
      for (let d = -0.02; d <= 0.02 + 1e-9; d += FRAME) cost += level(cur, time + d) + level(next, time + d)
      cost += ref * 0.25 * Math.abs(time - bar) // tie-break toward the bar line
      if (cost < bestCost) {
        bestCost = cost
        best = time
      }
    }
    cur.region.end = best + SEAM_FADE / 2
    cur.region.fadeOut = SEAM_FADE
    next.region.start = best - SEAM_FADE / 2
    next.region.fadeIn = SEAM_FADE
  }
  return items.map((i) => i.region)
}
