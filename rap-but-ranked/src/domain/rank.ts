import type { Rank } from './types'

/** D → C → B → A → S. Thresholds live here so every screen agrees. */
export const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S']

const THRESHOLDS: [Rank, number][] = [
  ['S', 92],
  ['A', 80],
  ['B', 65],
  ['C', 50],
]

export function rankForScore(score: number): Rank {
  for (const [rank, min] of THRESHOLDS) if (score >= min) return rank
  return 'D'
}
