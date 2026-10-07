import type { Challenge, RoundResult, Session, Take } from '../../domain/types'

/**
 * Provider-agnostic contract for everything "AI" in the app. The UI only
 * ever talks to this interface. Concrete implementations:
 *   - mock (Stage 3: deterministic challenges, no scoring)
 *   - http  (Stage 4: calls OUR backend route, which holds the API key)
 * API keys never live in frontend code or in this repo.
 */
export interface AIService {
  /** First or next challenge, based on the whole session so far. */
  nextChallenge(session: Session): Promise<Challenge>
  /** Lyric + (where possible) audio analysis for one submitted take. */
  judgeRound(session: Session, challenge: Challenge, take: Take, audioFeatures?: AudioFeatures): Promise<RoundResult>
  /** Help panel: teach / hint, never write the bars by default. */
  help(session: Session, request: HelpRequest): Promise<string>
}

/** Measured client-side from the recording; the AI never "guesses" timing from text. */
export interface AudioFeatures {
  onsetTimesSec: number[]
  vocalActivityRatio: number
  beatAlignmentMs: number | null
}

export type HelpRequest =
  | { kind: 'explain-challenge' }
  | { kind: 'hint' }
  | { kind: 'rhyme-help'; word?: string }
  | { kind: 'story-help' }
  | { kind: 'question'; text: string }
