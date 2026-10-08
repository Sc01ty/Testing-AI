import { profileSummary, type SkillProfile } from './profile'
import { rhymePocket, vowelName } from './phonetics'
import { assistanceSummary } from './score'
import type { AssistanceRecord, ChallengeSpec, Constraint } from './types'

/**
 * The concise, structured context every coach / director / help request
 * gets — not the whole session. Older bars are summarised by the story
 * direction; only the last few bars are sent verbatim.
 */
export interface CoachContext {
  topic: string
  bpm: number | null
  barsTotal: number
  barsLeft: number
  storyDirection: string
  /** Up to the last 4 lines before the current bars. */
  earlier: string[]
  challenge: { prompt: string; skill: string | null; constraints: string[] }
  bars: [string, string]
  rhymePocket: string | null
  lastFocus: string | null
  profile: string
  help: string | null
}

export function describeConstraint(c: Constraint): string {
  switch (c.kind) {
    case 'avoid-words':
      return `don't use ${c.words.join(', ')}`
    case 'internal-rhyme':
      return 'include an internal rhyme'
    case 'multi-end':
      return `land a ${c.syllables}-syllable rhyme`
    case 'syllables':
      return `${c.min}-${c.max} syllables per bar`
    case 'callback':
      return `call back to "${c.word}"`
    case 'one-end-rhyme':
      return 'one end rhyme; meaning first'
    case 'hidden-double-meaning':
      return 'a hidden double meaning, not explained'
    case 'sense-shift':
      return 'a word that changes meaning between the bars'
  }
}

export function buildCoachContext(p: {
  topic: string
  bpm?: number | null
  barsTotal: number
  barsDone: number
  storyDirection: string
  previous: [string, string][]
  challenge: { prompt: string; spec?: ChallengeSpec }
  bars: [string, string]
  lastFocus?: string | null
  profile?: SkillProfile | null
  assistance?: AssistanceRecord[]
}): CoachContext {
  const earlier = p.previous.flat().slice(-4)
  const pocket = rhymePocket(p.bars[1] || p.bars[0] || earlier[earlier.length - 1] || '')
  return {
    topic: p.topic,
    bpm: p.bpm ?? null,
    barsTotal: p.barsTotal,
    barsLeft: Math.max(0, p.barsTotal - p.barsDone),
    storyDirection: p.storyDirection,
    earlier,
    challenge: { prompt: p.challenge.prompt, skill: p.challenge.spec?.skill ?? null, constraints: (p.challenge.spec?.constraints ?? []).map(describeConstraint) },
    bars: p.bars,
    rhymePocket: pocket ? `${vowelName(pocket.vowel)} (as in "${pocket.word}")` : null,
    lastFocus: p.lastFocus ?? null,
    profile: p.profile ? profileSummary(p.profile) : 'unknown',
    help: assistanceSummary(p.assistance),
  }
}

/** Render for a prompt: short labelled lines, nothing that isn't needed. */
export function renderContext(c: CoachContext) {
  return [
    `Song topic: ${c.topic}${c.bpm ? ` · ${Math.round(c.bpm)} BPM` : ''} · ${c.barsLeft} of ${c.barsTotal} bars left`,
    `Story so far: ${c.storyDirection}`,
    c.earlier.length ? `Earlier lines:\n${c.earlier.map((l) => `  ${l}`).join('\n')}` : 'Earlier lines: none (first round)',
    `Current challenge: ${c.challenge.prompt}${c.challenge.skill ? ` [trains: ${c.challenge.skill}${c.challenge.constraints.length ? `; ${c.challenge.constraints.join('; ')}` : ''}]` : ''}`,
    c.rhymePocket ? `Rhyme pocket: ${c.rhymePocket}` : '',
    c.lastFocus ? `Last coaching focus: ${c.lastFocus}` : '',
    `Player tendencies: ${c.profile}`,
    c.help ? `Help used this round: ${c.help}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
