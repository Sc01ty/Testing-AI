import { analyseBars } from '../coach/analyse'
import { scoreBars } from '../coach/score'
import type { AssistanceRecord, Constraint } from '../coach/types'
import { rankForScore } from '../domain/rank'
import type { CategoryScore, RoundResult } from '../domain/types'
import type { LyricContext } from './lyricScore'
import type { PerformanceInput } from './performance'

/**
 * One round's result: the coach's deterministic analysis (coach/analyse)
 * scored by coach/score — writing and measured performance kept apart.
 * The local model, when it's running, can refine the language judgements
 * afterwards (coach/llmCoach), labelled as such.
 */
export interface RoundExtras {
  secondsPerBar?: number
  constraints?: Constraint[]
  assistance?: AssistanceRecord[]
  focus?: string[]
}

export function scoreRound(ctx: LyricContext, perf: Omit<PerformanceInput, 'lyricSyllables'> | null, analysis: string, extras: RoundExtras = {}): RoundResult {
  const bars = analyseBars({
    lines: ctx.lyrics,
    topic: ctx.topic,
    previous: ctx.previous.map((p) => p.lyrics),
    focus: extras.focus ?? ctx.challenge.focus,
    constraints: extras.constraints ?? ctx.challenge.spec?.constraints,
    secondsPerBar: extras.secondsPerBar,
  })
  const r = scoreBars({ ctx, analysis: bars, performance: perf, assistance: extras.assistance })
  return { categories: r.categories, writingScore: r.writingScore, performanceScore: r.performanceScore, coach: r.coach, score: r.score, rank: r.rank, feedback: r.feedback, analysis, scoredAt: Date.now() }
}

/** Short and specific: best thing, worst thing (used where there's no coach report, e.g. old rounds). */
export function feedbackFor(categories: CategoryScore[]): string[] {
  const sorted = [...categories].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const lines: string[] = []
  if (best.score >= 60) lines.push(`${best.label}: ${best.reasons[0]}.`)
  if (worst !== best && worst.score < 70) lines.push(`${worst.label}: ${worst.reasons[worst.reasons.length > 1 ? 1 : 0] ?? worst.reasons[0]}.`)
  if (!lines.length) lines.push('Solid all round.')
  return lines.map((l) => l.replace(/\.\.$/, '.').replace(/([!?])\.$/, '$1'))
}

/** Final track result: each category averaged over the rounds that have it (in first-seen order). */
export function finalResult(results: RoundResult[]) {
  const order: CategoryScore['category'][] = []
  const labels = new Map<string, string>()
  for (const r of results)
    for (const c of r.categories)
      if (!labels.has(c.category)) {
        order.push(c.category)
        labels.set(c.category, c.label)
      }
  const averages = order.map((c) => {
    const xs = results.flatMap((r) => r.categories.filter((x) => x.category === c).map((x) => x.score))
    return { category: c, label: labels.get(c) ?? c, score: Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)) }
  })
  const score = Math.round(results.reduce((a, r) => a + r.score, 0) / Math.max(1, results.length))
  const avgOf = (k: 'writingScore' | 'performanceScore') => {
    const xs = results.map((r) => r[k]).filter((x): x is number => typeof x === 'number')
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
  }
  return { averages, score, rank: rankForScore(score), writing: avgOf('writingScore'), performance: avgOf('performanceScore') }
}
