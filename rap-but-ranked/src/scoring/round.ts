import { rankForScore } from '../domain/rank'
import type { CategoryScore, RoundResult } from '../domain/types'
import { lineSyllables } from '../lyrics/text'
import { scoreOriginality, scorePrompt, scoreRhyme, scoreStory, type LyricContext } from './lyricScore'
import { analysePerformance, scoreFlow, type PerformanceInput } from './performance'

/**
 * One round's result. Weights favour what a rap judge cares about most,
 * and the order is the order categories are revealed on screen.
 */
export const WEIGHTS: Record<CategoryScore['category'], number> = {
  rhyme: 0.21,
  prompt: 0.19,
  story: 0.19,
  flow: 0.25,
  originality: 0.16,
}

export function scoreRound(ctx: LyricContext, perf: Omit<PerformanceInput, 'lyricSyllables'>, analysis: string): RoundResult {
  const syll = lineSyllables(ctx.lyrics[0]) + lineSyllables(ctx.lyrics[1])
  const flow = scoreFlow(analysePerformance({ ...perf, lyricSyllables: syll }), { secondsPerBeat: perf.secondsPerBeat, lyricSyllables: syll })
  const categories: CategoryScore[] = [scoreRhyme(ctx.lyrics), scorePrompt(ctx), scoreStory(ctx), flow, scoreOriginality(ctx)]
  const score = Math.round(categories.reduce((s, c) => s + c.score * WEIGHTS[c.category], 0))
  return { categories, score, rank: rankForScore(score), feedback: feedbackFor(categories), analysis, scoredAt: Date.now() }
}

/** Short and specific: best thing, worst thing. */
export function feedbackFor(categories: CategoryScore[]): string[] {
  const sorted = [...categories].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const lines: string[] = []
  if (best.score >= 60) lines.push(`${best.label}: ${best.reasons[0]}.`)
  if (worst !== best && worst.score < 70) lines.push(`${worst.label}: ${worst.reasons[worst.reasons.length > 1 && worst.category !== 'flow' ? 1 : 0] ?? worst.reasons[0]}.`)
  if (!lines.length) lines.push('Solid all round.')
  return lines.map((l) => l.replace(/\.\.$/, '.').replace(/([!?])\.$/, '$1'))
}

/** Final track result: category averages across rounds. */
export function finalResult(results: RoundResult[]) {
  const cats = Object.keys(WEIGHTS) as CategoryScore['category'][]
  const averages = cats.map((c) => {
    const xs = results.map((r) => r.categories.find((x) => x.category === c)?.score ?? 0)
    return { category: c, label: results[0]?.categories.find((x) => x.category === c)?.label ?? c, score: Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)) }
  })
  const score = Math.round(results.reduce((a, r) => a + r.score, 0) / Math.max(1, results.length))
  return { averages, score, rank: rankForScore(score) }
}
