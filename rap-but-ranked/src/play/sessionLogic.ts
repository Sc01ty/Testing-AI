import { barStart, gridFor } from '../domain/beatGrid'
import { rankForScore } from '../domain/rank'
import type { BeatMeta, Round, Session, TrackLength } from '../domain/types'
import { firstChallenge } from '../director/basicDirector'
import type { DirectorContext, DirectorOutput } from '../director/types'
import { scoreRound } from '../scoring/round'
import { fitWindow, type SectionWindow, type SectionZone } from './sectionWindow'

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

type GridLike = Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>

export interface RoundSection {
  grid: ReturnType<typeof gridFor>
  /** First bar (0-based) the window touches — for labels. */
  firstBar: number
  start: number
  end: number
  /** Where START / END may be dragged for this round. */
  zone: SectionZone
}

/** How far ahead of its natural slot a round may be placed (bars). */
export const ROUND_ZONE_BARS = 4

/**
 * Every round's section, in order. Each round gets a zone of up to four bars
 * starting where the previous round ended; its window is two bars at most and
 * defaults to the next bar line. The zone never extends so far that the
 * remaining rounds would run off the end of the beat. Rounds without a stored
 * window sit exactly where they always did (bars 1–2, 3–4, …).
 */
export function roundSections(s: Pick<Session, 'rounds' | 'length'>, beat: GridLike): RoundSection[] {
  const grid = gridFor({ bpm: beat.bpm, introOffset: beat.introOffset, durationSec: beat.durationSec, beatsPerBar: beat.beatsPerBar })
  const origin = beat.introOffset
  const bar = grid.secondsPerBar
  const total = totalRounds(s)
  const usableEnd = origin + Math.max(grid.barCount, s.length) * bar
  const out: RoundSection[] = []
  let prevEnd = origin
  for (let i = 0; i < Math.max(s.rounds.length, 1); i++) {
    const def = origin + Math.ceil((prevEnd - origin) / bar - 1e-6) * bar
    const latest = usableEnd - Math.max(0, total - i - 1) * 2 * bar
    const max = Math.max(Math.min(def + ROUND_ZONE_BARS * bar, latest), prevEnd + 2 * bar)
    const zone: SectionZone = { min: prevEnd, max, maxLen: 2 * bar, minLen: bar, step: grid.secondsPerBeat, origin }
    const w = fitWindow(zone, s.rounds[i]?.section, { start: def, end: def + 2 * bar })
    out.push({ grid, firstBar: Math.floor((w.start - origin) / bar + 1e-6), start: w.start, end: w.end, zone })
    prevEnd = w.end
  }
  return out
}

/** One round's section (see roundSections). */
export function roundSection(s: Pick<Session, 'rounds' | 'length'>, beat: GridLike, roundIndex: number): RoundSection {
  const all = roundSections(s, beat)
  return all[Math.min(roundIndex, all.length - 1)]
}

/** Track lengths this beat is long enough for. */
export function lengthsFor(beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>): TrackLength[] {
  const { barCount } = gridFor({ bpm: beat.bpm, introOffset: beat.introOffset, durationSec: beat.durationSec, beatsPerBar: beat.beatsPerBar })
  return ([8, 16, 32] as TrackLength[]).filter((n) => n <= barCount)
}

export function directorContext(s: Session, upToIndex: number, extra: Pick<DirectorContext, 'profile' | 'secondsPerBar'> = {}, latestReport?: DirectorContext['rounds'][number]['report']): DirectorContext {
  return {
    topic: s.startingTopic,
    totalRounds: totalRounds(s),
    rounds: s.rounds.slice(0, upToIndex + 1).map((r, i) => ({ challenge: r.challenge, lyrics: r.lyrics, score: r.result?.score, report: (i === upToIndex && latestReport) || r.result?.coach })),
    storyDirection: s.storyDirection,
    secondsPerBar: extra.secondsPerBar ?? (s.beatGrid ? (60 / s.beatGrid.bpm) * s.beatGrid.beatsPerBar : undefined),
    profile: extra.profile,
  }
}

/** Everything the coach needs to judge a round (shared by the rules and the model refine step). */
export function roundInputs(s: Session, roundIndex: number, take: { samples: Float32Array; sampleRate: number } | null, beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>) {
  const round = s.rounds[roundIndex]
  const sec = roundSection(s, beat, roundIndex)
  return {
    ctx: { lyrics: round.lyrics, challenge: round.challenge, topic: s.startingTopic, previous: s.rounds.slice(0, roundIndex).map((r) => ({ lyrics: r.lyrics, challenge: r.challenge })) },
    performance:
      take && round.take
        ? { samples: take.samples, sampleRate: take.sampleRate, beatTimeSec: round.take.beatTimeSec, sectionStart: sec.start, sectionEnd: sec.end, secondsPerBeat: sec.grid.secondsPerBeat }
        : null,
    secondsPerBar: sec.grid.secondsPerBar,
    assistance: round.assistance,
  }
}

export function scoreSessionRound(
  s: Session,
  roundIndex: number,
  take: { samples: Float32Array; sampleRate: number } | null,
  beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>,
  analysis: string,
) {
  const round = s.rounds[roundIndex]
  const sec = roundSection(s, beat, roundIndex)
  return scoreRound(
    {
      lyrics: round.lyrics,
      challenge: round.challenge,
      topic: s.startingTopic,
      previous: s.rounds.slice(0, roundIndex).map((r) => ({ lyrics: r.lyrics, challenge: r.challenge })),
    },
    take && round.take
      ? {
          samples: take.samples,
          sampleRate: take.sampleRate,
          beatTimeSec: round.take.beatTimeSec,
          sectionStart: sec.start,
          sectionEnd: sec.end,
          secondsPerBeat: sec.grid.secondsPerBeat,
        }
      : null,
    analysis,
    { secondsPerBar: sec.grid.secondsPerBar, assistance: round.assistance, constraints: round.challenge.spec?.constraints },
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

/** Store a round's START / END window. */
export function setRoundSection(s: Session, roundIndex: number, w: SectionWindow): Session {
  return { ...s, rounds: s.rounds.map((r) => (r.index === roundIndex ? { ...r, section: { start: w.start, end: w.end } } : r)), updatedAt: Date.now() }
}

export function barsDone(s: Session) {
  return s.rounds.filter((r) => r.result).length * 2
}
