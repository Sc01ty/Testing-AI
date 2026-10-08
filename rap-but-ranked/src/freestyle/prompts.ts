import type { FreestyleDifficulty, FreestylePrompt } from '../domain/types'

/**
 * Freestyle prompt words and when they land.
 *   Easy   — every 8 bars, everyday things
 *   Medium — every 4 bars, everyday + a bit more
 *   Hard   — every 2 bars, abstract concepts
 *   Chaos  — unpredictable gaps (1–6 bars), anything goes
 */
const EASY = ['money', 'school', 'food', 'family', 'phone', 'football', 'summer', 'car', 'music', 'friends', 'weekend', 'trainers', 'pizza', 'rain', 'birthday', 'the bus', 'the gym', 'video games', 'holiday', 'your mum']
const MEDIUM = ['work', 'the city', 'midnight', 'dreams', 'fame', 'your ex', 'sleep', 'the crowd', 'mirror', 'trophy', 'kitchen', 'the train', 'winter', 'gold', 'hospital', 'landlord', 'the boss', 'cash', 'hometown', 'first car']
const HARD = ['regret', 'gravity', 'loyalty', 'nostalgia', 'time', 'ego', 'silence', 'envy', 'legacy', 'karma', 'freedom', 'anxiety', 'ambition', 'betrayal', 'patience', 'mortality', 'temptation', 'doubt', 'pride', 'redemption']
const WEIRD = ['penguin', 'microwave', 'space', 'time travel', 'dinosaurs', 'the moon', 'haunted fridge', 'wifi password', 'pigeons', 'aliens', 'lasagne', 'invisible', 'sharks', 'broken lift', 'tax return', 'volcano', 'robot butler', 'cheese', 'quicksand', 'ninja']

export const PROMPT_BANKS: Record<FreestyleDifficulty, string[]> = {
  easy: EASY,
  medium: [...EASY, ...MEDIUM],
  hard: [...MEDIUM.slice(8), ...HARD, ...HARD],
  chaos: [...EASY, ...MEDIUM, ...HARD, ...WEIRD, ...WEIRD],
}

export const PROMPT_EVERY: Record<FreestyleDifficulty, number | null> = { easy: 8, medium: 4, hard: 2, chaos: null }

/** Small seeded RNG, so a plan can be reproduced (and tested). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * The prompts for a freestyle of `bars` bars. `every` overrides the
 * difficulty's spacing (Chaos stays unpredictable unless overridden).
 */
export function planPrompts(difficulty: FreestyleDifficulty, bars: number, seed: number, every?: number | null): FreestylePrompt[] {
  const rand = rng(seed)
  const bank = [...new Set(PROMPT_BANKS[difficulty])]
  const used = new Set<string>()
  const pick = () => {
    if (used.size >= bank.length) used.clear()
    let w = bank[Math.floor(rand() * bank.length)]
    for (let i = 0; used.has(w) && i < 50; i++) w = bank[Math.floor(rand() * bank.length)]
    used.add(w)
    return w
  }
  const step = every ?? PROMPT_EVERY[difficulty]
  const out: FreestylePrompt[] = []
  for (let bar = 0; bar < bars; ) {
    out.push({ word: pick(), bar })
    bar += step ?? [1, 2, 2, 3, 4, 6][Math.floor(rand() * 6)]
  }
  return out
}

/** Index of the prompt showing at a bar. */
export function promptIndexAt(prompts: FreestylePrompt[], bar: number) {
  let i = 0
  for (let k = 0; k < prompts.length; k++) if (prompts[k].bar <= bar) i = k
  return i
}
