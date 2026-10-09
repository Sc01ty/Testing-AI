import type { Challenge } from '../domain/types'
import { contentWords } from '../lyrics/text'
import { peopleIn, topicWords } from '../lyrics/themes'
import type { SkillProfile } from './profile'
import type { ChallengeSpec, ChallengeType, CoachReport, Constraint, SkillId } from './types'

/**
 * Gives every challenge a PURPOSE. The story director decides where the
 * song goes next ("you mentioned your mum…"); this decides what the bars
 * should TRAIN, from the coach's read of the latest round and the player's
 * rolling skill profile — and turns that into a checkable constraint.
 *
 * Not every round gets a constraint: the first stays simple, and a player
 * with no clear weakness gets room to just write (with an occasional
 * stretch goal as their level rises).
 */
export interface PurposeInput {
  nextIndex: number
  totalRounds: number
  topic: string
  /** All bars so far, oldest first. */
  bars: [string, string][]
  /** The coach report on the latest round, if any. */
  latest?: CoachReport | null
  profile?: SkillProfile | null
  secondsPerBar?: number
  /** Specs already used in this track (avoid repeating the same drill back to back). */
  used: (ChallengeSpec | undefined)[]
}

interface Plan {
  type: ChallengeType
  skill: SkillId
  constraints: Constraint[]
  /** Sentence appended to the story prompt. */
  clause: string
}

const obvious = (topic: string) => {
  const t = topicWords(topic)
  const own = contentWords(topic)
  return [...new Set([...own, ...t.slice(0, 4)])].filter((w) => w.length > 2).slice(0, 4)
}

function planFor(skill: SkillId, level: number, input: PurposeInput): Plan | null {
  const banned = obvious(input.topic)
  const people = peopleIn(input.bars.flat().join(' '))
  const lastDetail = contentWords(input.bars[input.bars.length - 1]?.join(' ') ?? '').sort((a, b) => b.length - a.length)[0]
  const spb = input.secondsPerBar
  switch (skill) {
    case 'meaning-first':
      return level <= 2
        ? { type: 'one-rhyme-meaning', skill, constraints: [{ kind: 'one-end-rhyme' }], clause: 'Decide what you want to say first — only the last words need to rhyme, and both lines should be one clear thought.' }
        : { type: 'one-rhyme-meaning', skill, constraints: [{ kind: 'one-end-rhyme' }], clause: 'Meaning beats rhyme this round: one end rhyme, and both lines form one image.' }
    case 'internal-rhyme':
      return { type: 'internal-rhyme', skill, constraints: [{ kind: 'internal-rhyme' }], clause: 'Get at least one rhyme inside the bar, not just at the end.' }
    case 'multis':
      return { type: 'multisyllabic', skill, constraints: [{ kind: 'multi-end', syllables: 2 }], clause: 'Land it on a two-syllable rhyme.' }
    case 'imagery':
      return { type: 'imagery', skill, constraints: banned.length ? [{ kind: 'avoid-words', words: banned }] : [], clause: banned.length ? `Show it, don't say it — no ${banned.map((b) => `“${b}”`).join(', ')}.` : 'Make us see it: a name, a place or an object in each bar.' }
    case 'story':
      return people.length
        ? { type: 'callback', skill, constraints: [{ kind: 'callback', word: people[people.length - 1].toLowerCase() }], clause: `Bring ${people[people.length - 1]} back into it.` }
        : lastDetail
          ? { type: 'callback', skill, constraints: [{ kind: 'callback', word: lastDetail }], clause: `Call back to “${lastDetail}”.` }
          : null
    case 'naturalness':
      return { type: 'conversational', skill, constraints: [], clause: "Write it exactly how you'd say it to a friend — no bending the word order to fit a rhyme." }
    case 'cadence':
      return spb ? { type: 'cadence', skill, constraints: [{ kind: 'syllables', min: Math.max(6, Math.round(spb * 3.2)), max: Math.round(spb * 5) }], clause: `Fill the bar: about ${Math.max(6, Math.round(spb * 3.2))}–${Math.round(spb * 5)} syllables each.` } : null
    case 'economy':
      return spb ? { type: 'cadence', skill, constraints: [{ kind: 'syllables', min: 5, max: Math.round(spb * 4.2) }], clause: `Say it in fewer words — no more than ${Math.round(spb * 4.2)} syllables a bar, and cut anything that only explains.` } : { type: 'conversational', skill, constraints: [], clause: 'Say it in fewer words — cut anything that only explains.' }
    case 'semantic-chain':
      return { type: 'semantic-chain', skill, constraints: [], clause: 'Let each image lead to the next — every key word should come from a connected world.' }
    case 'invisible-punchline':
      return level >= 4
        ? { type: 'invisible-punchline', skill, constraints: [{ kind: 'hidden-double-meaning' }], clause: "Hide a double meaning in a natural-sounding line — and don't explain it." }
        : { type: 'two-line-flip', skill, constraints: [{ kind: 'sense-shift' }], clause: 'Use one word in bar one that means something different by the end of bar two.' }
  }
}

/** Stretch goals for players without a clear weakness, by level. */
const STRETCH: SkillId[][] = [[], ['imagery', 'internal-rhyme'], ['multis', 'semantic-chain', 'imagery'], ['invisible-punchline', 'semantic-chain', 'multis']]

export function purposeFor(input: PurposeInput): { spec: ChallengeSpec; clause: string } | null {
  if (input.nextIndex <= 0) return null
  const level = input.profile?.level ?? 1
  const prevSkill = input.used[input.used.length - 1]?.skill
  // 1) what the latest bars need, 2) the player's recurring weakness, 3) a stretch goal (every other round)
  const candidates: { skill: SkillId; why: string }[] = []
  if (input.latest?.focus) candidates.push({ skill: input.latest.focus.skill, why: `latest bars: ${input.latest.focus.note}` })
  if (input.profile?.weakest) candidates.push({ skill: input.profile.weakest, why: `recurring: ${input.profile.tendencies.find((t) => t.skill === input.profile!.weakest)?.label ?? input.profile.weakest}` })
  if (!candidates.length && input.nextIndex % 2 === 0 && level >= 2) for (const s of STRETCH[level - 1]) candidates.push({ skill: s, why: `stretch goal at level ${level}` })
  for (const c of candidates) {
    if (c.skill === prevSkill && candidates.length > 1) continue // don't drill the same thing twice in a row
    const plan = planFor(c.skill, level, input)
    if (!plan) continue
    const difficulty = Math.min(4, Math.max(1, level + (c.why.startsWith('stretch') ? 0 : -0))) as 1 | 2 | 3 | 4
    return {
      spec: { type: plan.type, skill: plan.skill, difficulty, constraints: plan.constraints, context: input.bars.length ? `continues from: “${input.bars[input.bars.length - 1][1]}”` : input.topic, reason: c.why },
      clause: plan.clause,
    }
  }
  return null
}

/** Story challenge + purpose → the challenge the player sees. */
export function withPurpose(story: Challenge, input: PurposeInput): Challenge {
  const p = purposeFor(input)
  if (!p) return { ...story, spec: story.spec ?? { type: input.nextIndex ? 'storytelling' : 'topic', skill: 'story', difficulty: (input.profile?.level ?? 1) as 1, constraints: [], context: input.topic, reason: input.nextIndex ? 'move the song on' : 'open the song' } }
  // Training remains optional coaching; the story prompt stays one readable task.
  return { ...story, spec: { ...p.spec, constraints: [], trainingHint:p.clause } }
}
