import type { Challenge, DirectorSource } from '../domain/types'

/**
 * The director decides where the song goes next — it never writes bars.
 * Two implementations share this contract: the in-browser model and the
 * rule-based fallback. A server-backed one could be added later.
 */
export interface RoundSoFar {
  challenge: Challenge
  lyrics: [string, string]
  score?: number
}

export interface DirectorContext {
  topic: string
  /** Total number of 2-bar rounds in this track. */
  totalRounds: number
  /** Rounds completed so far (the latest is last). */
  rounds: RoundSoFar[]
  storyDirection: string
}

export interface DirectorOutput {
  /** One short line about what the latest bars did for the story. */
  analysis: string
  /** null when the track is finished. */
  next: Challenge | null
  storyDirection: string
}

export type HelpKind = 'explain' | 'hint' | 'rhyme' | 'story' | 'question'

export interface HelpContext extends DirectorContext {
  current: Challenge
  /** What the player has typed so far for this round. */
  draft: [string, string]
  question?: string
}

export interface Director {
  readonly source: DirectorSource
  afterRound(ctx: DirectorContext): Promise<DirectorOutput>
  help(kind: HelpKind, ctx: HelpContext): Promise<string>
}
