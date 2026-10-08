import { barStart, gridFor } from '../domain/beatGrid'
import { rankForScore } from '../domain/rank'
import type { BeatMeta, Round, Session, TrackLength } from '../domain/types'
import { firstChallenge } from '../director/basicDirector'
import type { DirectorContext, DirectorOutput } from '../director/types'
import { scoreRound } from '../scoring/round'

/** Pure session rules — no storage, no audio, no UI. */

export function newSession(input: { trackName: string; beat: BeatMeta; topic: string; length: TrackLength }): Session {
  const now = Date.now()
  const topic = input.topic.trim() || 'what drives you'
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s_${now}`,
    trackName: input.trackName.trim() || 'Untitled track',
    beatId: input.beat.id,
    beatName: input.beat.name,
    beatGrid: { bpm: input.beat.bpm, introOffset: input.beat.introOffset, durationSec: input.beat.durationSec, beatsPerBar: input.beat.beatsPerBar },
    startingTopic: topic,
    length: input.length,
    rounds: [{ index: 0, challenge: firstChallenge(topic), lyrics: ['', ''], take: null, result: null }],
    storyDirection: topic,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
}

export const totalRounds = (s: Pick<Session, 'length'>) => s.length / 2

/** The round being worked on (the first without a result), or null when finished. */
export function currentRound(s: Session): Round | null {
  return s.rounds.find((r) => !r.result) ?? null
}

/** Where a round's two bars sit in the beat (seconds). */
export function sectionFor(beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>, roundIndex: number) {
  const grid = gridFor({ bpm: beat.bpm, introOffset: beat.introOffset, durationSec: beat.durationSec, beatsPerBar: beat.beatsPerBar })
  const firstBar = roundIndex * 2
  return {
    grid,
    firstBar,
    start: barStart(grid, beat.introOffset, firstBar),
    end: barStart(grid, beat.introOffset, firstBar + 2),
  }
}

/** Track lengths this beat is long enough for. */
export function lengthsFor(beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>): TrackLength[] {
  const { barCount } = gridFor({ bpm: beat.bpm, introOffset: beat.introOffset, durationSec: beat.durationSec, beatsPerBar: beat.beatsPerBar })
  return ([8, 16, 32] as TrackLength[]).filter((n) => n <= barCount)
}

export function directorContext(s: Session, upToIndex: number): DirectorContext {
  return {
    topic: s.startingTopic,
    totalRounds: totalRounds(s),
    rounds: s.rounds.slice(0, upToIndex + 1).map((r) => ({ challenge: r.challenge, lyrics: r.lyrics, score: r.result?.score })),
    storyDirection: s.storyDirection,
  }
}

export function scoreSessionRound(
  s: Session,
  roundIndex: number,
  take: { samples: Float32Array; sampleRate: number },
  beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>,
  analysis: string,
) {
  const round = s.rounds[roundIndex]
  const sec = sectionFor(beat, roundIndex)
  return scoreRound(
    {
      lyrics: round.lyrics,
      challenge: round.challenge,
      topic: s.startingTopic,
      previous: s.rounds.slice(0, roundIndex).map((r) => ({ lyrics: r.lyrics, challenge: r.challenge })),
    },
    {
      samples: take.samples,
      sampleRate: take.sampleRate,
      beatTimeSec: round.take!.beatTimeSec,
      sectionStart: sec.start,
      sectionEnd: sec.end,
      secondsPerBeat: sec.grid.secondsPerBeat,
    },
    analysis,
  )
}

/** Apply a scored round + the director's output, adding the next round or completing the track. */
export function advance(s: Session, roundIndex: number, result: Round['result'], director: DirectorOutput): Session {
  const rounds = s.rounds.map((r, i) => (i === roundIndex ? { ...r, result } : r))
  const finished = roundIndex + 1 >= totalRounds(s) || !director.next
  if (!finished) rounds.push({ index: roundIndex + 1, challenge: director.next!, lyrics: ['', ''], take: null, result: null })
  return { ...s, rounds, storyDirection: director.storyDirection || s.storyDirection, status: finished ? 'complete' : 'active', updatedAt: Date.now() }
}

/** Running rank across scored rounds. */
export function runningScore(s: Session) {
  const scored = s.rounds.filter((r) => r.result)
  if (!scored.length) return null
  const score = Math.round(scored.reduce((a, r) => a + r.result!.score, 0) / scored.length)
  return { score, rank: rankForScore(score) }
}

/** The beat timing a session was made with (older sessions: the beat's current timing). */
export function gridOf(s: Session, beat?: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'> | null) {
  return s.beatGrid ?? (beat ? { bpm: beat.bpm, introOffset: beat.introOffset, durationSec: beat.durationSec, beatsPerBar: beat.beatsPerBar } : null)
}

export function barsDone(s: Session) {
  return s.rounds.filter((r) => r.result).length * 2
}
