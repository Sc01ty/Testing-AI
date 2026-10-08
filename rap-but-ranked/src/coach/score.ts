import { rankForScore } from '../domain/rank'
import type { CategoryScore, Rank } from '../domain/types'
import { scoreOriginality, scorePrompt, scoreStory, type LyricContext } from '../scoring/lyricScore'
import { analysePerformance, scoreFlow, type PerformanceInput } from '../scoring/performance'
import { vowelName } from './phonetics'
import type { AssistanceRecord, BarAnalysis, CoachReport, SkillId } from './types'

/**
 * Round scoring, v2. Writing and performance are scored separately:
 *
 *   WRITING  meaning · rhyme · cadence (as written) · naturalness ·
 *            structure · originality · (+ wordplay, only when attempted)
 *   PERFORMANCE  measured from the recording: timing on the grid,
 *            coverage of the bars, dead gaps. Nothing else is claimed.
 *
 * Design rules:
 *   - every number carries the reasons that produced it;
 *   - more rhymes / more wordplay is NOT automatically better: rhyme has
 *     diminishing returns, and wordplay can only add — a plain connector
 *     bar that moves the story is never marked down for lacking a punchline;
 *   - "possible filler" is coached, and costs a little; it isn't a verdict.
 */
const q = (w: string) => `“${w}”`
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

export const WRITING_WEIGHTS: Record<string, number> = { meaning: 0.24, rhyme: 0.18, cadence: 0.12, naturalness: 0.14, structure: 0.16, originality: 0.16 }
const WORDPLAY_WEIGHT = 0.12
const PERFORMANCE_SHARE = 0.25

export interface ScoreInput {
  ctx: LyricContext
  analysis: BarAnalysis
  /** Take audio, if there is one. */
  performance?: Omit<PerformanceInput, 'lyricSyllables'> | null
  assistance?: AssistanceRecord[]
}

export interface ScoredRound {
  categories: CategoryScore[]
  writingScore: number
  performanceScore: number | null
  score: number
  rank: Rank
  feedback: string[]
  coach: CoachReport
}

// ── writing dimensions ────────────────────────────────────────────────
function meaning(a: BarAnalysis, ctx: LyricContext): CategoryScore {
  const prompt = scorePrompt(ctx)
  const reasons = [...prompt.reasons.slice(0, 2)]
  let s = prompt.score * 0.55 + 30
  if (a.meaning.connectsToSong) s += 8
  else if (ctx.previous.length) reasons.push("Doesn't connect to anything earlier in the song yet")
  const likely = a.filler.filter((f) => f.confidence === 'likely')
  const possible = a.filler.filter((f) => f.confidence === 'possible')
  if (likely.length) {
    s -= 14
    reasons.push(`${q(likely[0].word)} looks like it's there for the rhyme, not the thought`)
  } else if (possible.length) {
    s -= 6
    reasons.push(`Check ${q(possible[0].word)} — does it earn its place, or did the rhyme pick it?`)
  }
  if (a.imagery.score >= 0.6) {
    s += 7
    reasons.push(`Something to picture: ${a.imagery.concrete.slice(0, 3).map(q).join(', ')}`)
  }
  return { category: 'meaning', label: 'Meaning', score: clamp(s), basis: 'lyrics', reasons }
}

function rhyme(a: BarAnalysis): CategoryScore {
  const reasons: string[] = []
  const e = a.rhyme.end
  const [w1, w2] = e.words
  const KIND: Record<string, string> = { multi: 'multisyllabic rhyme', perfect: 'perfect rhyme', slant: 'slant rhyme', assonance: 'vowel rhyme', consonance: 'consonant echo, not a rhyme', identical: 'same sound twice', none: 'no rhyme' }
  reasons.push(`${q(w1)} / ${q(w2)} — ${KIND[e.kind]}${a.rhyme.lineMulti >= 2 && e.kind !== 'multi' ? ` (${a.rhyme.lineMulti} syllables match across the line ends)` : ''}`)
  // end rhyme carries most of it; internal rhymes help with diminishing returns (more ≠ better)
  let s = 30 + e.score * 42 + Math.min(2, Math.max(0, a.rhyme.lineMulti - 1)) * 6
  const internal = a.rhyme.internal.length
  s += internal ? 10 + Math.min(10, Math.log2(1 + internal) * 5) : 0
  if (internal) reasons.push(`Internal: ${a.rhyme.internal.slice(0, 2).map((p) => `${q(p.a)}/${q(p.b)}`).join(', ')}`)
  else reasons.push('No internal rhymes')
  if (a.rhyme.stretched) reasons.push(`${a.rhyme.stretched}: stretched pronunciation — works if you commit to it`)
  if (a.rhyme.continuesPocket) {
    s += 4
    reasons.push(`Keeps the ${vowelName(a.lines[1].pocket ?? '')} rhyme pocket going from the last round`)
  }
  return { category: 'rhyme', label: 'Rhyme', score: clamp(s), basis: 'lyrics', reasons }
}

function cadence(a: BarAnalysis): CategoryScore {
  const c = a.cadence
  const reasons = [`${c.syllables[0]} + ${c.syllables[1]} syllables${c.target ? ` (comfortable: ${c.target.min}–${c.target.max} a bar here)` : ''}`]
  let s = 74
  if (c.verdict === 'crowded') {
    s -= 22
    reasons.push('Crowded — hard to say cleanly at this tempo; cut what you trip on')
  } else if (c.verdict === 'underwritten') {
    s -= 20
    reasons.push('Underwritten — the bar will have dead air; that is often why takes sound gappy')
  } else if (c.verdict === 'fits') {
    s += 12
    reasons.push('Fits the bar')
  }
  if (c.imbalance > 0.45) {
    s -= 10
    reasons.push('One bar is much longer than the other — the flow lurches')
  }
  return { category: 'cadence', label: 'Cadence', score: clamp(s), basis: 'lyrics', reasons }
}

function naturalness(a: BarAnalysis): CategoryScore {
  let s = 88
  const reasons: string[] = []
  for (const f of a.naturalness) {
    if (f.kind === 'stretched-rhyme') continue
    s -= f.kind === 'inversion' ? 22 : f.kind === 'archaic' ? 16 : 10
    reasons.push(f.note)
  }
  if (a.filler.some((f) => f.confidence === 'likely')) {
    s -= 10
    reasons.push('Part of a line sounds built around the rhyme')
  }
  if (!reasons.length) reasons.push('Sounds like something a person would actually say')
  return { category: 'naturalness', label: 'Naturalness', score: clamp(s), basis: 'lyrics', reasons }
}

function structure(ctx: LyricContext): CategoryScore {
  const st = scoreStory(ctx)
  return { ...st, category: 'structure', label: 'Structure' }
}

/** Wordplay only appears when something was attempted — its absence costs nothing. */
function wordplay(a: BarAnalysis): CategoryScore | null {
  const cands = a.wordplay
  const chains = a.chains.filter((c) => c.length >= 2)
  if (!cands.length && !chains.length) return null
  const confirmed = cands.filter((c) => c.confirmed)
  const reasons: string[] = []
  let s = 55
  if (confirmed.length) {
    s += 30
    reasons.push(confirmed[0].note)
  } else if (cands.length) {
    s += 12
    reasons.push(`Possible ${cands[0].kind === 'homophone' ? 'sound-alike' : 'double meaning'}: ${cands[0].note} Intentional?`)
  }
  if (chains.length) {
    s += 10
    const c = chains[0]
    reasons.push(`Semantic chain: ${[c[0].from, ...c.map((l) => l.to)].join(' → ')}`)
  }
  return { category: 'wordplay', label: 'Wordplay', score: clamp(s), basis: confirmed.length ? 'lyrics' : 'lyrics', reasons }
}

// ── coaching ──────────────────────────────────────────────────────────
function focusFor(a: BarAnalysis, cats: CategoryScore[]): { skill: SkillId; note: string } | null {
  const likely = a.filler.find((f) => f.confidence === 'likely')
  const possible = a.filler[0]
  if (likely) return { skill: 'meaning-first', note: `${likely.reason} Try deciding what you want to say first, then come back to the rhyme pocket.` }
  if (a.cadence.verdict === 'underwritten') return { skill: 'cadence', note: 'Fill the bar: say it over the loop and add the detail that the gap is asking for.' }
  if (a.cadence.verdict === 'crowded') return { skill: 'economy', note: 'Too many words for the bar. Cut the ones that only explain — keep the ones that show.' }
  const inv = a.naturalness.find((n) => n.kind === 'inversion')
  if (inv) return { skill: 'naturalness', note: `${inv.note} Say the thought the way you'd say it to a friend, then find a rhyme for THAT ending.` }
  if (possible) return { skill: 'meaning-first', note: `${possible.reason} If the rhyme disappeared, would ${q(possible.word)} still have a reason to be here?` }
  if (!a.meaning.connectsToSong) return { skill: 'story', note: 'These bars could belong to a different song. Pick up a person, image or word from earlier and push it forward.' }
  const weakest = [...cats].filter((c) => c.basis !== 'audio').sort((x, y) => x.score - y.score)[0]
  if (weakest?.category === 'rhyme' && a.rhyme.internal.length === 0) return { skill: 'internal-rhyme', note: 'Everything rests on the end word. Find one rhyme inside the bar before you think about the last word.' }
  if (a.imagery.score < 0.3 && !a.connector) return { skill: 'imagery', note: 'Too general to picture. One real detail — a name, a place, an object — beats three big words.' }
  return null
}

function strengthsOf(a: BarAnalysis): string[] {
  const out: string[] = []
  const e = a.rhyme.end
  if (e.kind === 'multi') out.push(`Multisyllabic landing: ${q(e.words[0])} / ${q(e.words[1])}`)
  else if (a.rhyme.lineMulti >= 2) out.push(`${a.rhyme.lineMulti} syllables rhyme across the line ends`)
  if (a.rhyme.internal.length) out.push(`Internal rhyme ${q(a.rhyme.internal[0].a)} / ${q(a.rhyme.internal[0].b)}`)
  const chain = a.chains[0]
  if (chain) out.push(`Connected images: ${[chain[0].from, ...chain.map((l) => l.to)].join(' → ')}`)
  const wp = a.wordplay.find((w) => w.confirmed)
  if (wp) out.push(wp.note)
  if (a.imagery.score >= 0.6) out.push(`Concrete detail: ${a.imagery.concrete.slice(0, 3).map(q).join(', ')}`)
  if (a.connector) out.push('A clean connector bar — it moves the story without forcing a punchline')
  if (a.cadence.verdict === 'fits' && a.cadence.imbalance < 0.25) out.push('Both bars sit comfortably in the beat')
  return out.slice(0, 3)
}

const MODE_WORD: Record<string, string> = { thought: 'thinking', connections: 'semantic', rhymes: 'rhyme', flip: 'flip', flow: 'flow', critique: 'critique', ask: 'question' }

export function assistanceSummary(as: AssistanceRecord[] = []): string | null {
  if (!as.length) return null
  if (as.length === 1) {
    const a = as[0]
    return `Completed with one ${MODE_WORD[a.mode] ?? a.mode} ${a.level === 1 ? 'nudge' : a.level === 2 ? 'pointer' : 'deep-help session'}.`
  }
  const counts = new Map<string, number>()
  for (const a of as) counts.set(MODE_WORD[a.mode] ?? a.mode, (counts.get(MODE_WORD[a.mode] ?? a.mode) ?? 0) + 1)
  return `Completed with ${as.length} help requests (${[...counts].map(([m, n]) => (n > 1 ? `${m} ×${n}` : m)).join(', ')}).`
}

export function scoreBars(input: ScoreInput): ScoredRound {
  const { analysis: a, ctx } = input
  const writing: CategoryScore[] = [meaning(a, ctx), rhyme(a), cadence(a), naturalness(a), structure(ctx), scoreOriginality(ctx)]
  const wp = wordplay(a)
  // cadence sketches (da-da-DA) aren't lyrics yet: don't score them as bad writing
  if (a.cadenceSketch) for (const c of writing) if (c.category !== 'cadence') c.reasons.unshift('Looks like a cadence sketch, not finished words — scored lightly')

  let wsum = 0
  let total = 0
  for (const c of writing) {
    const w = WRITING_WEIGHTS[c.category] ?? 0
    wsum += w
    total += c.score * w
  }
  let writingScore = total / wsum
  // wordplay can lift the score; it can never pull it down
  if (wp && wp.score > writingScore) writingScore = (total + wp.score * WORDPLAY_WEIGHT) / (wsum + WORDPLAY_WEIGHT)
  writingScore = Math.round(writingScore)

  let perf: CategoryScore | null = null
  if (input.performance) {
    const syll = a.cadence.syllables[0] + a.cadence.syllables[1]
    perf = { ...scoreFlow(analysePerformance({ ...input.performance, lyricSyllables: syll }), { secondsPerBeat: input.performance.secondsPerBeat, lyricSyllables: syll }), category: 'performance', label: 'Performance' }
  }
  const performanceScore = perf ? perf.score : null
  const score = Math.round(performanceScore === null ? writingScore : writingScore * (1 - PERFORMANCE_SHARE) + performanceScore * PERFORMANCE_SHARE)

  const categories = [...writing, ...(wp ? [wp] : []), ...(perf ? [perf] : [])]
  const focus = focusFor(a, categories)
  const strengths = strengthsOf(a)
  const notes: string[] = []
  for (const w of a.wordplay.filter((x) => !x.confirmed).slice(0, 1)) notes.push(`${w.note} If that was on purpose — nice; can the listener find it without you explaining it?`)
  for (const n of a.naturalness.filter((x) => x.kind === 'stretched-rhyme')) notes.push(n.note)
  const assistance = assistanceSummary(input.assistance)

  const feedback: string[] = []
  if (strengths[0]) feedback.push(`${strengths[0]}.`)
  if (focus) feedback.push(focus.note)
  if (assistance) feedback.push(assistance)
  if (!feedback.length) feedback.push('Solid all round.')

  return {
    categories,
    writingScore,
    performanceScore,
    score,
    rank: rankForScore(score),
    feedback: feedback.map((f) => f.replace(/\.\.$/, '.')),
    coach: { version: 1, engine: 'rules', strengths, focus, notes, assistance, analysis: a },
  }
}
