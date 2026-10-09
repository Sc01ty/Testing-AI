import type { AssistanceRecord, ChallengeSpec, CoachReport } from '../coach/types'

/**
 * Core domain model for the whole product. Stage 1 only *declares* these so
 * later stages slot in without reshaping the app.
 */

// ── Beats (Stage 2) ────────────────────────────────────────────────
export type BpmSource = 'auto' | 'manual' | 'tap'

/** Everything about a beat except the audio itself (cheap to list). */
export interface BeatMeta {
  id: string
  name: string
  fileName: string
  mimeType: string
  sizeBytes: number
  durationSec: number
  bpm: number
  bpmSource: BpmSource
  /** 0..1 from the detector; null once the user has set BPM themselves. */
  bpmConfidence: number | null
  /** Seconds before bar 1, beat 1 (intro / silence). */
  introOffset: number
  introOffsetSource: 'auto' | 'manual'
  /** 4/4 for now. */
  beatsPerBar: number
  /** Normalised 0..1 peak per waveform column, from the real audio. */
  peaks: number[]
  createdAt: number
  updatedAt: number
}

/** What Play / Freestyle get from `getSavedBeats()`. */
export interface SavedBeat extends BeatMeta {
  blob: Blob
  secondsPerBeat: number
  secondsPerBar: number
  /** Whole bars that fit after the intro offset. */
  barCount: number
}

// ── Play sessions ──────────────────────────────────────────────────
export type TrackLength = 8 | 16 | 32
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S'
/** Who wrote a challenge / analysis: the in-browser model or the rule-based director. */
export type DirectorSource = 'local-ai' | 'basic'

export interface Challenge {
  /** "Write 2 bars about what you'd do for your mum if you made it." */
  prompt: string
  /** Words the bars should touch — used for prompt-relevance scoring. */
  focus: string[]
  /** Short label for where the story is ("family", "the obstacle", "back to the start"). */
  storyBeat: string
  source: DirectorSource
  /** What this challenge is for (skill, difficulty, constraints) — v2 director. */
  spec?: ChallengeSpec
}

/** One recorded vocal, with everything needed to place it over the beat again. */
export interface TakeMeta {
  id: string
  beatId: string
  barStart: number
  barCount: number
  /** Beat-file second where sample 0 of the stored vocal belongs (latency already compensated). */
  beatTimeSec: number
  /** The two bars this take is for, in beat-file seconds. */
  sectionStartSec: number
  sectionEndSec: number
  durationSec: number
  sampleRate: number
  /** Latency compensation that was applied (seconds). */
  latencySec: number
  /** Loudest sample 0..1 — to warn about a silent or clipping mic. */
  inputPeak: number
  peaks: number[]
  recordedAt: number
}

/** Categories are only scored when the system has a legitimate input for them. */
export type ScoreCategory =
  // play rounds (v2): writing dimensions + measured performance
  | 'meaning'
  | 'rhyme'
  | 'cadence'
  | 'naturalness'
  | 'structure'
  | 'originality'
  | 'wordplay'
  | 'performance'
  // older play rounds (v1, kept so saved tracks still read)
  | 'prompt'
  | 'story'
  | 'flow'
  // freestyle
  | 'prompts'
  | 'continuity'
  | 'variety'
  | 'timing'

export interface CategoryScore {
  confidence?: 'medium' | 'low'
  category: ScoreCategory
  label: string
  score: number // 0–100
  /** What produced this number. */
  basis: 'lyrics' | 'audio' | 'transcript'
  /** Plain-English reasons — the score must be explainable. */
  reasons: string[]
}

export interface RoundResult {
  categories: CategoryScore[]
  /** Writing and measured performance, separately (v2 rounds). */
  writingScore?: number
  performanceScore?: number | null
  /** The coach's structured read of the bars (v2 rounds). */
  coach?: CoachReport
  score: number
  rank: Rank
  /** 1–3 short lines. */
  feedback: string[]
  /** One-line read of the bars from the director (AI or basic). */
  analysis: string
  scoredAt: number
}

export interface Round {
  index: number
  challenge: Challenge
  lyrics: [string, string]
  take: TakeMeta | null
  result: RoundResult | null
  /** Help used on this round (context, not a penalty). */
  assistance?: AssistanceRecord[]
}

/** The beat's timing when the track was made (so it still plays right if the beat is edited or deleted). */
export interface BeatGrid {
  bpm: number
  introOffset: number
  durationSec: number
  beatsPerBar: number
}

export interface AdlibLayer {
  id: string
  startTime: number
  durationSec: number
  peaks: number[]
  muted: boolean
  recordedAt: number
}

export interface Session {
  adlibs?: AdlibLayer[]
  id: string
  trackName: string
  beatId: string
  beatName: string
  beatGrid?: BeatGrid
  startingTopic: string
  length: TrackLength
  rounds: Round[]
  /** Running one-line summary of where the song's story is heading. */
  storyDirection: string
  status: 'active' | 'complete'
  createdAt: number
  updatedAt: number
}

// ── Freestyle ──────────────────────────────────────────────────────
export type FreestyleDifficulty = 'easy' | 'medium' | 'hard' | 'chaos'
export type FreestyleDuration = 30 | 60 | 120
export type FreestyleMode = 'topic' | 'rhyme'
export type FreestyleCategory = 'everyday' | 'personal' | 'absurd' | 'mixed'

/** One prompt word, shown from `bar` (0-based, timeline) until the next. */
export interface FreestylePrompt {
  target?: string
  word: string
  bar: number
}

export interface TranscriptWord {
  text: string
  /** Timeline seconds. */
  start: number
  end: number
}

export interface FreestyleTake {
  id: string
  /** Timeline second of sample 0 (latency compensated; timeline 0 = bar 1 of the freestyle). */
  startTime: number
  durationSec: number
  sampleRate: number
  latencySec: number
  inputPeak: number
  peaks: number[]
  recordedAt: number
}

export interface FreestyleResult {
  categories: CategoryScore[]
  score: number
  rank: Rank
  feedback: string[]
  /** Per prompt: did you use it, and the words that show it. */
  prompts: { word: string; bar: number; hit: boolean; evidence: string[] }[]
  /** False when speech recognition wasn't available — word-based categories are then left out. */
  transcribed: boolean
  scoredAt: number
}

export interface FreestyleSession {
  mode?: FreestyleMode
  category?: FreestyleCategory
  requestedDurationSec?: number
  promptEvery?: number | null
  id: string
  kind: 'freestyle'
  name: string
  beatId: string
  beatName: string
  beatGrid: BeatGrid
  difficulty: FreestyleDifficulty
  /** Bars actually played (whole bars ≈ the chosen duration). */
  bars: number
  /** Looped part of the beat file (whole bars), timeline 0 = loop.start. */
  loop: { start: number; end: number }
  prompts: FreestylePrompt[]
  take: FreestyleTake | null
  transcript: { text: string; words: TranscriptWord[]; model: string } | null
  result: FreestyleResult | null
  createdAt: number
  updatedAt: number
}
