/**
 * Types for the rap-coach intelligence layer.
 *
 * Two kinds of judgement live here and are kept apart:
 *   - deterministic analysis (code): syllables, stress, rhyme by sound,
 *     semantic-world links, constraint checks, timing — `engine: 'rules'`
 *   - language judgement (the local model, when it's running): meaning,
 *     forced wording, whether a double meaning lands — `engine: 'local-ai'`
 * Every judgement says which engine produced it.
 */
import type { SoundRhymeKind } from './phonetics'

export type Engine = 'rules' | 'local-ai'

// ── skills & challenges ───────────────────────────────────────────────
export type SkillId =
  | 'meaning-first' // decide the thought before the rhyme
  | 'internal-rhyme'
  | 'multis'
  | 'imagery'
  | 'semantic-chain'
  | 'invisible-punchline' // double meanings that stay hidden but discoverable
  | 'naturalness'
  | 'cadence'
  | 'story'
  | 'economy' // not over-explaining / over-writing

export type ChallengeType =
  | 'topic'
  | 'imagery'
  | 'internal-rhyme'
  | 'multisyllabic'
  | 'semantic-chain'
  | 'invisible-punchline'
  | 'two-line-flip'
  | 'storytelling'
  | 'conversational'
  | 'cadence'
  | 'callback'
  | 'setup-payoff'
  | 'one-rhyme-meaning'

export type Constraint =
  | { kind: 'avoid-words'; words: string[] }
  | { kind: 'internal-rhyme' }
  | { kind: 'multi-end'; syllables: number }
  | { kind: 'syllables'; min: number; max: number }
  | { kind: 'callback'; word: string }
  | { kind: 'one-end-rhyme' }
  /** Subjective: only the language model can judge these (rules report "can't check"). */
  | { kind: 'hidden-double-meaning' }
  | { kind: 'sense-shift' }

export interface ChallengeSpec {
  type: ChallengeType
  skill: SkillId
  /** 1 early … 4 advanced. */
  difficulty: 1 | 2 | 3 | 4
  constraints: Constraint[]
  /** What from the song this builds on ("you mentioned your mum"). */
  context: string
  /** Why this challenge, now (for the coach / logs — not shown as a lecture). */
  reason: string
}

// ── analysis of one round's two bars ──────────────────────────────────
export interface LineInfo {
  text: string
  syllables: number
  /** "da-DA-da…" likely stresses as written. */
  stress: string
  endWord: string
  /** Vowel of the last stressed syllable (the rhyme pocket). */
  pocket: string | null
}

export interface RhymeInfo {
  end: { kind: SoundRhymeKind; score: number; words: [string, string] }
  /** Syllables matched across the line endings, across word boundaries. */
  lineMulti: number
  internal: { a: string; b: string; kind: SoundRhymeKind }[]
  /** Rhyming pairs per line (excluding the end pair). */
  density: number
  /** Same vowel pocket as the previous round's ending (a sustained scheme). */
  continuesPocket: boolean
  /** End rhyme only works by stressing a syllable the word doesn't normally stress. */
  stretched: string | null
}

export interface CadenceInfo {
  syllables: [number, number]
  /** Comfortable range per bar at this tempo. */
  target: { min: number; max: number } | null
  verdict: 'fits' | 'crowded' | 'underwritten' | 'unknown'
  /** 0 = equal lengths … 1 = one bar empty. */
  imbalance: number
  stress: [string, string]
}

export interface FillerFlag {
  word: string
  line: 0 | 1
  /** Short, explainable reason. */
  reason: string
  confidence: 'possible' | 'likely'
  engine: Engine
}

export interface ChainLink {
  from: string
  to: string
  via: 'world' | 'sense' | 'bridge'
  label: string
}

export interface WordplayCandidate {
  kind: 'double-duty' | 'homophone' | 'two-line-flip'
  word: string
  /** The meanings in play. */
  senses: string[]
  /** Words in the bars / song that support each meaning. */
  support: string[]
  note: string
  engine: Engine
  /** Rules can only find candidates; the model (or the player) confirms. */
  confirmed: boolean
}

export interface NaturalnessFlag {
  kind: 'inversion' | 'archaic' | 'padding' | 'stretched-rhyme'
  text: string
  note: string
}

export interface ConstraintResult {
  constraint: Constraint
  met: boolean | null
  note: string
}

export interface BarAnalysis {
  version: 1
  lines: [LineInfo, LineInfo]
  /** Looks like cadence sketching (da-da-DA / mumble) rather than finished words. */
  cadenceSketch: boolean
  rhyme: RhymeInfo
  cadence: CadenceInfo
  meaning: {
    contentWords: string[]
    /** Content words that weren't in the song before. */
    fresh: string[]
    /** Shares a world / person / word with earlier bars or the topic. */
    connectsToSong: boolean
    /** Worlds the bars live in. */
    worlds: string[]
  }
  chains: ChainLink[][]
  wordplay: WordplayCandidate[]
  filler: FillerFlag[]
  naturalness: NaturalnessFlag[]
  imagery: { concrete: string[]; sensory: string[]; score: number }
  /** A plain line that moves the story — not every bar needs a punchline. */
  connector: boolean
  constraints: ConstraintResult[]
}

// ── help ───────────────────────────────────────────────────────────────
export type HelpMode = 'thought' | 'connections' | 'rhymes' | 'flip' | 'flow' | 'critique'
/** 1 nudge · 2 direction · 3 deep coaching. Never "write it for me". */
export type HelpLevel = 1 | 2 | 3

export interface HelpSection {
  title: string
  items: string[]
  /** Optional grouping, e.g. rhyme families. */
  groups?: { label: string; items: string[] }[]
}

export interface HelpResponse {
  mode: HelpMode
  level: HelpLevel
  engine: Engine
  /** The main coaching line (one question / observation at level 1). */
  message: string
  sections: HelpSection[]
  /** A task for the player — they write the line. */
  yourMove: string
  /** Whether "more help" can go further. */
  canGoDeeper: boolean
}

export interface AssistanceRecord {
  mode: HelpMode | 'ask'
  level: HelpLevel
  at: number
}

// ── coaching report for a round ─────────────────────────────────────────
export interface CoachReport {
  version: 1
  engine: Engine
  /** Specific mechanisms that worked. */
  strengths: string[]
  /** The ONE thing to work on next. */
  focus: { skill: SkillId; note: string } | null
  /** Other observations (filler, naturalness, wordplay notes). */
  notes: string[]
  /** "Completed with one semantic nudge." */
  assistance: string | null
  analysis: BarAnalysis
}
