import { rankForScore } from '../domain/rank'
import type { CategoryScore, FreestylePrompt, FreestyleResult, TranscriptWord } from '../domain/types'
import { STOPWORDS, rhymeStrength, stem, words as splitWords } from '../lyrics/text'
import { themesOfWord } from '../lyrics/themes'
import { analysePerformance } from '../scoring/performance'

/**
 * Freestyle scoring. Two kinds of evidence, kept apart:
 *
 *   transcript (on-device speech recognition) → PROMPTS, RHYME, VARIETY
 *   audio (the recording itself)              → CONTINUITY, FLOW / TIMING
 *
 * Without a transcript only the audio categories are scored — we never
 * guess at words we didn't hear. Voice quality / charisma isn't scored.
 */
export interface FreestyleInput {
  prompts: FreestylePrompt[]
  bars: number
  secondsPerBar: number
  secondsPerBeat: number
  /** Timeline words (timeline 0 = bar 1), or null if there's no transcript. */
  words: TranscriptWord[] | null
  samples: Float32Array
  sampleRate: number
  /** Timeline second of sample 0. */
  startTime: number
}

const WEIGHTS: Record<string, number> = { prompts: 0.25, continuity: 0.2, rhyme: 0.2, variety: 0.1, flow: 0.25 }
const FILLERS = new Set(['yeah', 'yo', 'uh', 'um', 'like', 'aye', 'ayy', 'huh', 'ah', 'oh', 'come', 'on'])
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const q = (w: string) => `“${w}”`
const clean = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

/** Which bar (0-based) a timeline second falls in. */
const barOf = (t: number, spBar: number) => Math.floor(t / spBar + 1e-6)

// ── PROMPTS ──────────────────────────────────────────────────────────
export function promptHits(prompts: FreestylePrompt[], words: TranscriptWord[], bars: number, spBar: number) {
  return prompts.map((p, i) => {
    const endBar = Math.min(bars, prompts[i + 1]?.bar ?? bars)
    // a bar of grace: you hear the word, then work it in
    const from = p.bar * spBar - 0.25
    const to = (endBar + 1) * spBar
    const target = splitWords(p.word).filter((w) => !STOPWORDS.has(w))
    const stems = new Set(target.map(stem))
    const themes = new Set(target.flatMap(themesOfWord))
    const said = words.filter((w) => w.start >= from && w.start < to).map((w) => clean(w.text)).filter(Boolean)
    const evidence = said.filter((w) => stems.has(stem(w)) || themesOfWord(w).some((t) => themes.has(t)))
    return { word: p.word, bar: p.bar, hit: evidence.length > 0, evidence: [...new Set(evidence)].slice(0, 3) }
  })
}

function scorePrompts(hits: ReturnType<typeof promptHits>): CategoryScore {
  const n = hits.length
  const got = hits.filter((h) => h.hit)
  const reasons = [`Worked in ${got.length} of ${n} prompt${n === 1 ? '' : 's'}`]
  if (got.length) reasons.push(`Used: ${got.slice(0, 3).map((h) => `${q(h.word)} (${h.evidence.map(q).join(', ')})`).join(' · ')}`)
  const missed = hits.filter((h) => !h.hit)
  if (missed.length) reasons.push(`Missed: ${missed.slice(0, 4).map((h) => q(h.word)).join(', ')}`)
  return { category: 'prompts', label: 'Prompts', score: Math.round(n ? 12 + 88 * (got.length / n) : 0), basis: 'transcript', reasons }
}

// ── RHYME ────────────────────────────────────────────────────────────
/** Words grouped into bars (a bar ≈ a line of a freestyle). */
export function barsOfWords(words: TranscriptWord[], bars: number, spBar: number) {
  const out: string[][] = Array.from({ length: bars }, () => [])
  for (const w of words) {
    const b = barOf(w.start, spBar)
    const c = clean(w.text)
    if (c && b >= 0 && b < bars) out[b].push(c)
  }
  return out
}

function scoreRhymeDensity(lines: string[][]): CategoryScore {
  const spoken = lines.filter((l) => l.length)
  const ends = spoken.map((l) => l[l.length - 1])
  const pairs: string[] = []
  let endRhymes = 0
  for (let i = 1; i < ends.length; i++) {
    for (const j of [i - 1, i - 2]) {
      if (j < 0 || ends[i] === ends[j]) continue
      if (rhymeStrength(ends[i], ends[j]).score >= 0.55) {
        endRhymes++
        if (pairs.length < 3) pairs.push(`${q(ends[j])}/${q(ends[i])}`)
        break
      }
    }
  }
  let internal = 0
  for (const l of spoken) {
    const ws = l.filter((w) => w.length > 2 && !STOPWORDS.has(w))
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++) if (ws[i] !== ws[j] && rhymeStrength(ws[i], ws[j]).score >= 0.7) internal++
  }
  const per4 = spoken.length ? ((endRhymes + internal * 0.5) / spoken.length) * 4 : 0
  const reasons: string[] = []
  if (pairs.length) reasons.push(`Rhymes landed: ${pairs.join(', ')}`)
  reasons.push(`${endRhymes} end rhyme${endRhymes === 1 ? '' : 's'} across ${spoken.length} bar${spoken.length === 1 ? '' : 's'}${internal ? `, ${internal} internal` : ''}`)
  if (!endRhymes) reasons.push("Bar endings didn't rhyme with each other")
  return { category: 'rhyme', label: 'Rhyme', score: Math.round(clamp(18 + per4 * 22)), basis: 'transcript', reasons }
}

// ── VARIETY ──────────────────────────────────────────────────────────
function scoreVariety(words: TranscriptWord[]): CategoryScore {
  const all = words.map((w) => clean(w.text)).filter(Boolean)
  const fillers = all.filter((w) => FILLERS.has(w)).length
  const content = all.filter((w) => !STOPWORDS.has(w) && !FILLERS.has(w) && w.length > 2)
  const counts = new Map<string, number>()
  for (const w of content) counts.set(stem(w), (counts.get(stem(w)) ?? 0) + 1)
  const unique = counts.size / Math.max(1, content.length)
  const repeats = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
  const fillerShare = fillers / Math.max(1, all.length)
  const reasons: string[] = []
  if (repeats.length) reasons.push(`Leaned on ${repeats.slice(0, 3).map(([w, n]) => `${q(w)} ×${n}`).join(', ')}`)
  if (fillerShare > 0.12) reasons.push(`Lots of filler (${Math.round(fillerShare * 100)}% “yeah / uh / like”) — fine for breathing, but it's not bars`)
  if (!reasons.length) reasons.push(`${counts.size} different words, hardly any repeats`)
  const score = clamp(30 + unique * 75 - repeats.length * 5 - Math.max(0, fillerShare - 0.08) * 120)
  return { category: 'variety', label: 'Variety', score: Math.round(score), basis: 'transcript', reasons }
}

// ── CONTINUITY (audio) ───────────────────────────────────────────────
export function voicedBars(samples: Float32Array, sampleRate: number, startTime: number, bars: number, spBar: number) {
  const hop = Math.round(sampleRate * 0.01)
  const n = Math.floor(samples.length / hop)
  const rms = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) s += samples[i] * samples[i]
    rms[f] = Math.sqrt(s / hop)
  }
  const sorted = Array.from(rms).sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.98)] ?? 0
  const thr = Math.max(Math.min(floor * 3, loud * 0.5), loud * 0.1, 0.003)
  const active = new Array<number>(bars).fill(0)
  const total = new Array<number>(bars).fill(0)
  for (let f = 0; f < n; f++) {
    const b = barOf(startTime + f * 0.01, spBar)
    if (b < 0 || b >= bars) continue
    total[b]++
    if (rms[f] > thr) active[b]++
  }
  return { share: active.map((a, i) => (total[i] ? a / total[i] : 0)), tooQuiet: loud < 0.006 }
}

function scoreContinuity(share: number[]): CategoryScore {
  const on = share.map((s) => s >= 0.2)
  const count = on.filter(Boolean).length
  let longest = 0
  let run = 0
  let runEnd = -1
  on.forEach((v, i) => {
    run = v ? 0 : run + 1
    if (run > longest) {
      longest = run
      runEnd = i
    }
  })
  const reasons = [`Kept going for ${count} of ${share.length} bars`]
  if (longest >= 2) reasons.push(`Longest freeze: ${longest} bars (bars ${runEnd - longest + 2}–${runEnd + 1})`)
  else reasons.push('Never froze for more than a bar')
  const score = clamp((count / Math.max(1, share.length)) * 100 - Math.max(0, longest - 1) * 6)
  return { category: 'continuity', label: 'Continuity', score: Math.round(score), basis: 'audio', reasons }
}

// ── FLOW / TIMING (audio, + pace from the transcript) ─────────────────
function scoreFlowFreestyle(input: FreestyleInput, lines: string[][] | null): CategoryScore {
  const end = input.bars * input.secondsPerBar
  const a = analysePerformance({
    samples: input.samples,
    sampleRate: input.sampleRate,
    beatTimeSec: input.startTime,
    sectionStart: 0,
    sectionEnd: end,
    secondsPerBeat: input.secondsPerBeat,
    lyricSyllables: 0,
  })
  const reasons: string[] = []
  const timing = a.meanDeviation === null ? 0.4 : clamp((0.25 - a.meanDeviation) / 0.15, 0, 1)
  if (a.meanDeviation === null) reasons.push('Too few clear syllables to judge timing')
  else if (timing > 0.66) reasons.push('Syllables land on the beat grid')
  else if (timing > 0.33) reasons.push('Timing drifts on and off the beat')
  else reasons.push('Mostly off the grid — ride the snare more')
  let pace = 0.6
  if (lines) {
    const counts = lines.map((l) => l.length).filter((c) => c > 0)
    if (counts.length >= 3) {
      const mean = counts.reduce((x, y) => x + y, 0) / counts.length
      const sd = Math.sqrt(counts.reduce((x, y) => x + (y - mean) ** 2, 0) / counts.length)
      const cv = sd / Math.max(1, mean)
      pace = clamp(1 - (cv - 0.25) / 0.6, 0, 1)
      reasons.push(cv < 0.35 ? `Steady pace: about ${Math.round(mean)} words a bar` : `Pace jumps around (${Math.min(...counts)}–${Math.max(...counts)} words a bar)`)
    }
  }
  const score = clamp(timing * 70 + pace * 30)
  return { category: 'flow', label: 'Flow / timing', score: Math.round(score), basis: 'audio', reasons }
}

// ── all together ─────────────────────────────────────────────────────
export function scoreFreestyle(input: FreestyleInput): FreestyleResult {
  const spBar = input.secondsPerBar
  const vb = voicedBars(input.samples, input.sampleRate, input.startTime, input.bars, spBar)
  const continuity = scoreContinuity(vb.share)
  const hits = input.words ? promptHits(input.prompts, input.words, input.bars, spBar) : input.prompts.map((p) => ({ word: p.word, bar: p.bar, hit: false, evidence: [] }))
  const lines = input.words ? barsOfWords(input.words, input.bars, spBar) : null
  const categories: CategoryScore[] = []
  if (input.words) categories.push(scorePrompts(hits))
  categories.push(continuity)
  if (input.words && lines) categories.push(scoreRhymeDensity(lines), scoreVariety(input.words))
  categories.push(scoreFlowFreestyle(input, lines))

  if (vb.tooQuiet) for (const c of categories) c.score = Math.min(c.score, 5)
  const wsum = categories.reduce((s, c) => s + (WEIGHTS[c.category] ?? 0), 0)
  const score = Math.round(categories.reduce((s, c) => s + c.score * (WEIGHTS[c.category] ?? 0), 0) / Math.max(1e-6, wsum))

  const feedback: string[] = []
  if (vb.tooQuiet) feedback.push("We could barely hear you — check the mic level before the next one.")
  const sorted = [...categories].sort((a, b) => b.score - a.score)
  if (sorted[0].score >= 60) feedback.push(`${sorted[0].label}: ${sorted[0].reasons[0]}.`)
  const worst = sorted[sorted.length - 1]
  if (worst !== sorted[0] && worst.score < 65) feedback.push(`${worst.label}: ${worst.reasons[worst.reasons.length - 1]}.`)
  if (!input.words) feedback.push("Speech recognition wasn't available, so prompts, rhyme and variety weren't judged — only what the audio shows.")
  return { categories, score, rank: rankForScore(score), feedback: feedback.map((f) => f.replace(/\.\.$/, '.')), prompts: hits, transcribed: !!input.words, scoredAt: Date.now() }
}
