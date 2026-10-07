/**
 * Core domain model for the whole product. Stage 1 only *declares* these so
 * later stages slot in without reshaping the app. Nothing here is persisted yet.
 */

// ── Beats (Stage 2) ────────────────────────────────────────────────
export interface Beat {
  id: string
  name: string
  /** Audio blob lives in IndexedDB under this key, never in localStorage. */
  audioKey: string
  mimeType: 'audio/mpeg' | 'audio/wav' | string
  durationSec: number
  bpm: number
  bpmSource: 'auto' | 'manual' | 'tap'
  /** Seconds before bar 1 beat 1 (intro / silence). */
  offsetSec: number
  beatsPerBar: number
  /** Downsampled peaks for the small card waveform. */
  peaks: number[]
  createdAt: number
}

// ── Play sessions (Stage 3–5) ──────────────────────────────────────
export type TrackLength = 8 | 16 | 32
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S'

export interface Challenge {
  id: string
  index: number // 0-based round number
  prompt: string // "Write 2 bars about wanting money."
  barStart: number // first bar this round covers (0-based)
  barCount: 2
  /** Why the director chose this (shown subtly / used for continuity). */
  storyBeat?: string
}

/** Everything needed to rebuild the final song over the original beat. */
export interface Take {
  id: string
  challengeId: string
  beatId: string
  barStart: number
  barCount: number
  /** Position in the beat (seconds) where the vocal belongs. */
  beatStartSec: number
  /** Offset into the vocal recording where usable audio begins (latency comp). */
  vocalStartSec: number
  durationSec: number
  audioKey: string
  lyrics: [string, string]
  recordedAt: number
}

/** Categories are only scored when the system has a legitimate input for them. */
export type ScoreCategory = 'rhyme' | 'relevance' | 'storytelling' | 'originality' | 'flow' | 'delivery'

export interface CategoryScore {
  category: ScoreCategory
  score: number // 0–100
  /** What produced this number — text analysis, audio timing analysis, etc. */
  basis: 'lyrics' | 'audio' | 'lyrics+audio'
  note?: string
}

export interface RoundResult {
  challengeId: string
  takeId: string
  categories: CategoryScore[]
  score: number
  rank: Rank
  feedback: string[] // max ~3 short lines
}

export interface Session {
  id: string
  trackName: string
  beatId: string
  startingTopic: string
  length: TrackLength
  challenges: Challenge[]
  takes: Take[]
  results: RoundResult[]
  storyDirection: string
  createdAt: number
}

// ── Freestyle (Stage 6) ────────────────────────────────────────────
export type FreestyleDifficulty = 'easy' | 'medium' | 'hard' | 'chaos'
export type FreestyleDuration = 30 | 60 | 120
