import type { FreestyleSession, Session } from '../domain/types'
import type { DuoSession } from '../multiplayer/session'
import { finalResult } from '../scoring/round'
import { hotStreak, type RpEvent } from './ladder'

/** A finished solo track. */
export function trackEvent(s: Session): RpEvent | null {
  const results = s.rounds.map((r) => r.result).filter((r): r is NonNullable<typeof r> => !!r)
  if (s.status !== 'complete' || !results.length) return null
  return { id: `track:${s.id}`, kind: 'play', score: finalResult(results).score, bars: s.length, hot: hotStreak(s.rounds.map((r) => r.result?.rank)) }
}

/** A scored freestyle. */
export function freestyleEvent(f: FreestyleSession): RpEvent | null {
  if (!f.result || !f.take) return null
  const seconds = f.requestedDurationSec ?? Math.round((f.bars * f.beatGrid.beatsPerBar * 60) / f.beatGrid.bpm)
  return { id: `freestyle:${f.id}`, kind: 'freestyle', score: f.result.score, seconds: Math.min(600, Math.max(10, seconds)) }
}

/** Your sections of a finished online multiplayer track. Same-computer duos don't rank (two people, one profile). */
export function roomEvent(s: DuoSession, me: 0 | 1): RpEvent | null {
  if (s.mode !== 'online' || s.status !== 'complete') return null
  const mine = s.turns.filter((t) => t.player === me && t.result)
  if (!mine.length) return null
  const bars = mine.reduce((a, t) => a + (t.barEnd - t.barStart), 0)
  const score = Math.round(mine.reduce((a, t) => a + t.result!.score, 0) / mine.length)
  return { id: `room:${s.id}:${me}`, kind: 'room', score, bars: Math.min(32, Math.max(2, bars)) }
}
