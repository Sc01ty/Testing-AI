import { contentWords } from '../lyrics/text'
import type { DuoSession } from './session'

/** Short, useful things to think about while your mate is on. Never lyrics. */
const TIPS = [
  'Write your last word first, then build the bar towards it.',
  'Pick one detail from their bars and answer it — a name, a place, a thing.',
  'Say your bars out loud on the beat before you type them. Flow first, words second.',
  'One clear picture beats three vague ones. What would a camera see?',
  'Rhyme two syllables, not one: "money / funny" lands harder than "pay / day".',
  'Leave a breath. A gap before the punchline makes it hit.',
  'Flip their idea: if they went up, take it down. Contrast keeps a duo interesting.',
  'Use a number, a time or a street name. Specific sounds true.',
  'Start on the beat they ended on — the handoff is half the performance.',
  'If a word is only there to rhyme, swap it for one that means something.',
]

/**
 * A tip for the waiting player while turn `current` is being written/rapped.
 * Every third turn it points at a detail from the last finished section.
 */
export function waitingTip(s: DuoSession, current: number): string {
  const last = s.turns.slice(0, current).reverse().find((t) => t.take)
  if (last && current % 3 === 1) {
    const word = contentWords(last.lyrics.join(' ')).at(-1)
    if (word) return `${s.players[last.player]} last mentioned “${word}”. You could pick that up — or turn it around.`
  }
  return TIPS[(current * 7 + s.length) % TIPS.length]
}
