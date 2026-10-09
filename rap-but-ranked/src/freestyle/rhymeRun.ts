import { rankForScore } from '../domain/rank'
import type { CategoryScore, FreestyleDifficulty, FreestylePrompt, FreestyleResult, Rank, TranscriptWord } from '../domain/types'
import { rhymeWords } from '../coach/phonetics'
import { sound } from '../coach/lexicon'
import { stem } from '../lyrics/text'
import { rng } from './prompts'

/**
 * RHYME RUN — the bouncing-ball mechanic.
 *
 * Every bar is a row:  1 · 2 · 3 · TARGET
 * The ball lands on each beat. Beats 1–3 are yours to build a line; the
 * target word has to land with the ball on beat 4. Consecutive rows come from
 * one rhyme family (ground / sound / found / round), so the run rhymes.
 *
 * Everything here is pure: the ball's position is a function of the beat
 * clock, never of a CSS duration, so it can't drift from the music.
 */

// ── rhyme families ────────────────────────────────────────────────────
/** One-syllable perfect rhymes, everyday words. */
const SIMPLE = [
  ['night', 'light', 'fight', 'right', 'bright', 'tight'],
  ['day', 'play', 'way', 'stay', 'say', 'pay'],
  ['go', 'show', 'flow', 'slow', 'know', 'glow'],
  ['back', 'track', 'stack', 'black', 'pack', 'crack'],
  ['ground', 'sound', 'found', 'round', 'crowned', 'pound'],
  ['cold', 'gold', 'told', 'hold', 'old', 'sold'],
  ['ring', 'sing', 'king', 'thing', 'bring', 'swing'],
  ['rain', 'pain', 'chain', 'train', 'brain', 'lane'],
  ['time', 'rhyme', 'climb', 'crime', 'dime', 'prime'],
  ['free', 'me', 'tree', 'key', 'knee', 'three'],
  ['street', 'beat', 'heat', 'feet', 'seat', 'sweet'],
  ['car', 'star', 'far', 'bar', 'guitar', 'jar'],
]
/** Two-syllable perfect rhymes. */
const DOUBLE = [
  ['hurry', 'worry', 'curry', 'flurry'],
  ['money', 'honey', 'funny', 'sunny'],
  ['better', 'letter', 'sweater', 'wetter'],
  ['crazy', 'lazy', 'hazy', 'daisy'],
  ['pocket', 'rocket', 'socket', 'locket'],
  ['table', 'able', 'cable', 'label'],
  ['mountain', 'fountain', 'counting', 'amounting'],
  ['taller', 'caller', 'smaller', 'hauler'],
]
/** Longer multis — harder to build towards. */
const MULTI = [
  ['station', 'nation', 'vacation', 'creation'],
  ['motion', 'ocean', 'potion', 'emotion'],
  ['fire', 'higher', 'desire', 'entire'],
  ['glory', 'story', 'gory', 'inventory'],
  ['illusion', 'confusion', 'conclusion', 'intrusion'],
  ['memory', 'enemy', 'remedy', 'melody'],
]
/** Slant families: the same vowel, endings that only nearly match. */
const SLANT = [
  ['home', 'stone', 'phone', 'own'],
  ['time', 'line', 'mind', 'sign'],
  ['flats', 'stacks', 'facts', 'cats'],
  ['cold', 'road', 'soul', 'gold'],
  ['feeling', 'ceiling', 'healing', 'dealing'],
  ['broken', 'hoping', 'open', 'token'],
]

export const RHYME_FAMILIES = { simple: SIMPLE, double: DOUBLE, multi: MULTI, slant: SLANT }

const POOLS: Record<FreestyleDifficulty, string[][]> = {
  easy: SIMPLE,
  medium: [...SIMPLE, ...DOUBLE],
  hard: [...DOUBLE, ...MULTI],
  chaos: [...MULTI, ...SLANT, ...DOUBLE],
}

/** How a difficulty plays. */
export const RHYME_RUN_RULES: Record<FreestyleDifficulty, { label: string; note: string; blockBars: number; rest: boolean; preview: number; revealBeat: number }> = {
  // preview: how many upcoming rows are readable · revealBeat: beat (0-based) of the current bar the next row appears on
  easy: { label: 'Easy', note: 'One-syllable rhymes · whole family shown · a breather every 4 bars', blockBars: 4, rest: true, preview: 4, revealBeat: 0 },
  medium: { label: 'Medium', note: 'Two-syllable rhymes join in · current + next shown', blockBars: 4, rest: false, preview: 1, revealBeat: 0 },
  hard: { label: 'Hard', note: 'Longer multis · the next rhyme appears on beat 3', blockBars: 4, rest: false, preview: 1, revealBeat: 2 },
  chaos: { label: 'Chaos', note: 'Slant families switch every 2 bars · next rhyme only on beat 4', blockBars: 2, rest: false, preview: 1, revealBeat: 3 },
}

/**
 * The target for each bar. Rows of one family run for `blockBars` bars,
 * then a new family starts (never the same one twice in a row). Easy leaves
 * a free bar between families to breathe. Bars without a prompt are rests.
 */
export function planRhymeRun(difficulty: FreestyleDifficulty, bars: number, seed: number): FreestylePrompt[] {
  const rand = rng(seed)
  const rules = RHYME_RUN_RULES[difficulty]
  const pool = POOLS[difficulty]
  const out: FreestylePrompt[] = []
  let last = -1
  let bar = 0
  while (bar < bars) {
    let f = Math.floor(rand() * pool.length)
    if (f === last) f = (f + 1) % pool.length
    last = f
    const family = pool[f]
    // shuffle the family, keep its first word as the family's name
    const words = [...family].sort(() => rand() - 0.5)
    for (let i = 0; i < rules.blockBars && bar < bars; i++, bar++) out.push({ bar, word: words[i % words.length], target: family[0] })
    if (rules.rest && bar < bars) bar++ // a breather
  }
  return out
}

// ── the ball ──────────────────────────────────────────────────────────
export interface BallState {
  /** Bar (0-based, negative during the count-in). */
  bar: number
  /** Beat inside the bar the ball is travelling *from* (0 = beat 1). */
  beat: number
  /** 0 → 1 through the beat; the ball touches down at 0. */
  phase: number
  /** 0..1 height above the row (parabola, 0 on every beat). */
  height: number
}

/** Where the ball is at timeline second `t` (0 = downbeat of bar 1). Pure: same clock, same ball. */
export function ballAt(t: number, secondsPerBeat: number, beatsPerBar: number): BallState {
  const beats = t / secondsPerBeat
  const whole = Math.floor(beats + 1e-9)
  const phase = Math.min(1, Math.max(0, beats - whole))
  const bar = Math.floor(whole / beatsPerBar)
  const beat = whole - bar * beatsPerBar
  return { bar, beat, phase, height: 4 * phase * (1 - phase) }
}

/** Timeline second the target of `bar` should be said: the ball's last landing in that bar. */
export const targetTime = (bar: number, secondsPerBeat: number, beatsPerBar: number) => (bar * beatsPerBar + beatsPerBar - 1) * secondsPerBeat

// ── scoring ───────────────────────────────────────────────────────────
export interface RhymeRunInput {
  prompts: FreestylePrompt[]
  bars: number
  secondsPerBeat: number
  beatsPerBar: number
  words: TranscriptWord[] | null
  samples: Float32Array
  sampleRate: number
  startTime: number
}

export interface Landing {
  word: string
  bar: number
  hit: boolean
  /** Said a different word from the family (rhymes, but not the target). */
  near: string | null
  /** Landing time minus beat 4, in ms (hits only). */
  offsetMs: number | null
  evidence: string[]
}

const clean = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

/** The same word: spelling, stem or sound ("crowned" / "crowned", "rhyme" / "rime"). */
function sameWord(said: string, target: string) {
  if (!said) return false
  if (said === target || stem(said) === stem(target)) return true
  const a = sound(said)
  const b = sound(target)
  return !!a && !!b && a.phones.join(' ') === b.phones.join(' ')
}

/** RMS envelope, 10 ms hops. */
function envelope(samples: Float32Array, sampleRate: number) {
  const hop = Math.round(sampleRate * 0.01)
  const n = Math.floor(samples.length / hop)
  const env = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) s += samples[i] * samples[i]
    env[f] = Math.sqrt(s / hop)
  }
  return env
}

/**
 * Speech recognition word times are rough (±100 ms or so). Where the audio
 * shows a clear onset right around the word's start, use that instead.
 */
function refineOnset(env: Float32Array, startTime: number, t: number) {
  const f0 = Math.max(1, Math.floor((t - 0.15 - startTime) / 0.01))
  const f1 = Math.min(env.length - 1, Math.ceil((t + 0.12 - startTime) / 0.01))
  let best = -1
  let rise = 0
  for (let f = f0; f <= f1; f++) {
    const r = env[f] - env[f - 1]
    if (r > rise) {
      rise = r
      best = f
    }
  }
  const peak = env.reduce((m, v) => (v > m ? v : m), 0)
  return best >= 0 && rise > peak * 0.08 ? startTime + best * 0.01 : t
}

export function rhymeLandings(input: RhymeRunInput): Landing[] {
  const { secondsPerBeat: spb, beatsPerBar: bpb } = input
  const env = envelope(input.samples, input.sampleRate)
  return input.prompts.map((p) => {
    const at = targetTime(p.bar, spb, bpb)
    // from beat 3 to just before the next bar's beat 2: early and late landings still count, with their offset
    const near = (input.words ?? []).filter((w) => w.start >= at - 1.25 * spb && w.start < at + 1.5 * spb)
    const target = p.word.toLowerCase()
    const said = near.map((w) => ({ w, c: clean(w.text) }))
    const hits = said.filter((x) => sameWord(x.c, target)).sort((a, b) => Math.abs(a.w.start - at) - Math.abs(b.w.start - at))
    const excerpt = (w: TranscriptWord) => {
      const all = input.words ?? []
      const i = all.indexOf(w)
      return all
        .slice(Math.max(0, i - 6), i + 1)
        .map((x) => x.text.trim())
        .join(' ')
    }
    if (hits.length) {
      const landed = refineOnset(env, input.startTime, hits[0].w.start)
      return { word: p.word, bar: p.bar, hit: true, near: null, offsetMs: Math.round((landed - at) * 1000), evidence: [excerpt(hits[0].w)] }
    }
    const rhymed = said.find((x) => x.c.length > 1 && rhymeWords(x.c, target).score >= 0.65 && (sound(x.c)?.known ?? false))
    return { word: p.word, bar: p.bar, hit: false, near: rhymed ? rhymed.c : null, offsetMs: null, evidence: rhymed ? [excerpt(rhymed.w)] : [] }
  })
}

/** Average distance from beat 4 → a letter. */
export function timingGrade(meanAbsMs: number): Rank {
  return meanAbsMs <= 60 ? 'S' : meanAbsMs <= 110 ? 'A' : meanAbsMs <= 170 ? 'B' : meanAbsMs <= 250 ? 'C' : 'D'
}

/** Did you rap in beats 1–3 of each target bar (building a line), or just say the word? */
function linesBuilt(input: RhymeRunInput) {
  const env = envelope(input.samples, input.sampleRate)
  const sorted = Array.from(env).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.98)] ?? 0
  const thr = Math.max(Math.min(floor * 3, loud * 0.5), loud * 0.1, 0.003)
  const { secondsPerBeat: spb, beatsPerBar: bpb } = input
  const built = input.prompts.map((p) => {
    const from = p.bar * bpb * spb
    const to = targetTime(p.bar, spb, bpb) - 0.08
    let on = 0
    let all = 0
    for (let t = from; t < to; t += 0.01) {
      const f = Math.floor((t - input.startTime) / 0.01)
      if (f < 0 || f >= env.length) continue
      all++
      if (env[f] > thr) on++
    }
    return all > 0 && on / all >= 0.2
  })
  return { built: built.filter(Boolean).length, total: built.length, tooQuiet: loud < 0.006 }
}

const WEIGHTS: Record<string, number> = { prompts: 0.55, timing: 0.25, continuity: 0.2 }

export function scoreRhymeRun(input: RhymeRunInput): FreestyleResult {
  const lines = linesBuilt(input)
  const categories: CategoryScore[] = []
  let landings: Landing[] = input.prompts.map((p) => ({ word: p.word, bar: p.bar, hit: false, near: null, offsetMs: null, evidence: [] }))
  let grade: Rank | null = null
  if (input.words) {
    landings = rhymeLandings(input)
    const hits = landings.filter((l) => l.hit)
    const nears = landings.filter((l) => l.near)
    const share = (hits.length + nears.length * 0.4) / Math.max(1, landings.length)
    categories.push({
      category: 'prompts',
      label: 'Rhymes landed',
      score: Math.round(clamp(share * 100)),
      basis: 'transcript',
      reasons: [
        `${hits.length} / ${landings.length} target words heard`,
        ...(nears.length ? [`${nears.length} landed a different rhyme instead (${nears.slice(0, 3).map((l) => `“${l.near}” for “${l.word}”`).join(', ')}) — half credit`] : []),
        'Checked against the transcript after the run; a misheard word can count as a miss.',
      ],
    })
    if (hits.length) {
      const mean = hits.reduce((s, l) => s + Math.abs(l.offsetMs!), 0) / hits.length
      const early = hits.filter((l) => l.offsetMs! < -60).length
      const late = hits.filter((l) => l.offsetMs! > 60).length
      grade = timingGrade(mean)
      categories.push({
        category: 'timing',
        label: 'Landing timing',
        score: Math.round(clamp(100 - (mean - 40) / 2.6)),
        basis: 'audio',
        confidence: 'low',
        reasons: [`Target words landed ${Math.round(mean)} ms from beat 4 on average (grade ${grade})`, early > late ? `Mostly early (${early} early, ${late} late)` : late > early ? `Mostly late (${late} late, ${early} early)` : 'Early and late about evenly', 'Word times come from the transcript, sharpened by the audio onset.'],
      })
    }
  }
  categories.push({
    category: 'continuity',
    label: 'Lines built',
    score: Math.round(clamp((lines.built / Math.max(1, lines.total)) * 100)),
    basis: 'audio',
    reasons: [`You were rapping through beats 1–3 in ${lines.built} of ${lines.total} target bars`, 'Measured from the recording: just saying the target word on 4 doesn’t count as a line.'],
  })
  if (lines.tooQuiet) for (const c of categories) c.score = Math.min(c.score, 5)
  const wsum = categories.reduce((s, c) => s + (WEIGHTS[c.category] ?? 0), 0)
  const score = Math.round(categories.reduce((s, c) => s + c.score * (WEIGHTS[c.category] ?? 0), 0) / Math.max(1e-6, wsum))
  const hits = landings.filter((l) => l.hit).length
  const feedback: string[] = []
  if (lines.tooQuiet) feedback.push('We could barely hear you — check the mic level before the next run.')
  if (input.words) {
    feedback.push(`${hits} / ${landings.length} landed${grade ? ` · timing ${grade}` : ''}.`)
    const missed = landings.find((l) => !l.hit && !l.near)
    if (missed) feedback.push(`Missed “${missed.word}” (bar ${missed.bar + 1}) — see it coming on the row below and aim the line at it.`)
  } else feedback.push("Speech recognition wasn't available, so landings couldn't be checked — only whether you kept rapping through beats 1–3.")
  return {
    categories,
    score,
    rank: rankForScore(score),
    feedback,
    prompts: landings.map((l) => ({ word: l.word, bar: l.bar, hit: l.hit, evidence: l.evidence, offsetMs: l.offsetMs, near: l.near })),
    transcribed: !!input.words,
    landed: input.words ? { hits, total: landings.length, grade } : undefined,
    scoredAt: Date.now(),
  }
}
