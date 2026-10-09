import type { Round, Session } from '../domain/types'
import type { SkillId } from './types'

/**
 * A lightweight rap skill profile from ROLLING evidence: the most recent
 * scored rounds across all tracks (never one attempt). It's computed from
 * the stored coach reports, so there is nothing extra to keep in sync, and
 * it naturally forgets old habits as new rounds come in.
 *
 * The director reads it to pick what the next challenge should train.
 */
export interface Tendency {
  id: string
  label: string
  kind: 'strength' | 'weakness'
  skill: SkillId
  /** Rounds that showed it, out of rounds looked at. */
  count: number
  of: number
}

export interface SkillProfile {
  rounds: number
  tendencies: Tendency[]
  /** What to train next (most consistent weakness), if there's enough evidence. */
  weakest: SkillId | null
  /** Challenge difficulty that fits right now (1 early … 4 advanced). */
  level: 1 | 2 | 3 | 4
  help: { perRound: number; byMode: Record<string, number> }
}

const WINDOW = 24
const MIN_ROUNDS = 4

interface Signal {
  id: string
  label: string
  kind: 'strength' | 'weakness'
  skill: SkillId
  test: (r: Round, i: number) => boolean | null
  /** Share of rounds needed to call it a tendency. */
  rate: number
}

const cat = (r: Round, c: string) => r.result?.categories.find((x) => x.category === c)?.score ?? null

const SIGNALS: Signal[] = [
  { id: 'rhyme-first', label: 'often rhyme-first (the rhyme picks the word)', kind: 'weakness', skill: 'meaning-first', rate: 0.3, test: (r) => (r.result!.coach!.analysis.filler.length ? true : false) },
  { id: 'no-internal', label: 'rarely uses internal rhyme', kind: 'weakness', skill: 'internal-rhyme', rate: 0.6, test: (r) => r.result!.coach!.analysis.rhyme.internal.length === 0 },
  { id: 'multis', label: 'strong multisyllabic rhymes', kind: 'strength', skill: 'multis', rate: 0.4, test: (r) => r.result!.coach!.analysis.rhyme.end.kind === 'multi' || r.result!.coach!.analysis.rhyme.lineMulti >= 2 },
  { id: 'chains', label: 'strong semantic connections', kind: 'strength', skill: 'semantic-chain', rate: 0.35, test: (r) => r.result!.coach!.analysis.chains.length > 0 },
  { id: 'wordplay', label: 'reaches for double meanings', kind: 'strength', skill: 'invisible-punchline', rate: 0.35, test: (r) => r.result!.coach!.analysis.wordplay.length > 0 },
  { id: 'crowded', label: 'overcrowded bars', kind: 'weakness', skill: 'economy', rate: 0.35, test: (r) => r.result!.coach!.analysis.cadence.verdict === 'crowded' },
  { id: 'underwritten', label: 'bars too short for the beat', kind: 'weakness', skill: 'cadence', rate: 0.35, test: (r) => r.result!.coach!.analysis.cadence.verdict === 'underwritten' },
  { id: 'unnatural', label: 'wording bent to fit the rhyme', kind: 'weakness', skill: 'naturalness', rate: 0.3, test: (r) => r.result!.coach!.analysis.naturalness.some((n) => n.kind !== 'stretched-rhyme') },
  { id: 'imagery', label: 'strong imagery', kind: 'strength', skill: 'imagery', rate: 0.5, test: (r) => r.result!.coach!.analysis.imagery.score >= 0.6 },
  { id: 'vague', label: 'too general to picture', kind: 'weakness', skill: 'imagery', rate: 0.5, test: (r) => r.result!.coach!.analysis.imagery.score < 0.3 && !r.result!.coach!.analysis.connector },
  { id: 'disconnected', label: 'jumps topic instead of developing it', kind: 'weakness', skill: 'story', rate: 0.35, test: (r, i) => (i === 0 ? null : !r.result!.coach!.analysis.meaning.connectsToSong) },
  { id: 'repetitive', label: 'repeats words and ideas', kind: 'weakness', skill: 'economy', rate: 0.4, test: (r) => (cat(r, 'originality') ?? 100) < 55 },
  { id: 'timing', label: 'delivery drifts off the beat', kind: 'weakness', skill: 'cadence', rate: 0.5, test: (r) => (cat(r, 'performance') === null ? null : cat(r, 'performance')! < 50) },
]

export function computeProfile(sessions: Session[]): SkillProfile {
  // newest rounds first, across tracks
  const rounds = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .flatMap((s) => [...s.rounds].reverse().filter((r) => r.result?.coach))
    .slice(0, WINDOW)
  const tendencies: Tendency[] = []
  if (rounds.length >= MIN_ROUNDS) {
    for (const sig of SIGNALS) {
      const res = rounds.map((r) => sig.test(r, r.index)).filter((x): x is boolean => x !== null)
      const count = res.filter(Boolean).length
      if (res.length >= MIN_ROUNDS && count >= 3 && count / res.length >= sig.rate) tendencies.push({ id: sig.id, label: sig.label, kind: sig.kind, skill: sig.skill, count, of: res.length })
    }
  }
  const weaknesses = tendencies.filter((t) => t.kind === 'weakness').sort((a, b) => b.count / b.of - a.count / a.of)
  const assists = rounds.flatMap((r) => r.assistance ?? [])
  const byMode: Record<string, number> = {}
  for (const a of assists) byMode[a.mode] = (byMode[a.mode] ?? 0) + 1
  const perRound = rounds.length ? assists.length / rounds.length : 0
  if (rounds.length >= MIN_ROUNDS && perRound >= 1.5) tendencies.push({ id: 'help', label: `leans on Help (${Object.entries(byMode).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'help'} most)`, kind: 'weakness', skill: 'meaning-first', count: assists.length, of: rounds.length })

  const writing = rounds.map((r) => r.result!.writingScore ?? r.result!.score)
  const avg = writing.length ? writing.reduce((a, b) => a + b, 0) / writing.length : 0
  let level: 1 | 2 | 3 | 4 = rounds.length < MIN_ROUNDS ? 1 : avg >= 80 ? 4 : avg >= 68 ? 3 : avg >= 55 ? 2 : 1
  if (perRound >= 2 && level > 1) level = (level - 1) as 1 | 2 | 3
  // Repeated rhyme-first filler is more urgent than adding decorative rhyme density.
  const priority = weaknesses.find(t => t.skill === 'meaning-first') ?? weaknesses[0]
  return { rounds: rounds.length, tendencies, weakest: priority?.skill ?? null, level, help: { perRound, byMode } }
}

/** One line for prompts / logs: "multis (strength); often rhyme-first; overcrowded bars". */
export function profileSummary(p: SkillProfile) {
  if (!p.tendencies.length) return p.rounds < MIN_ROUNDS ? 'new player — not enough rounds yet' : 'no strong tendencies yet'
  return p.tendencies
    .slice(0, 4)
    .map((t) => `${t.label}${t.kind === 'strength' ? ' (strength)' : ''}`)
    .join('; ')
}
