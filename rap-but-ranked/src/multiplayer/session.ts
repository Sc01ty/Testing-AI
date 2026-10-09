import type { BeatMeta, Challenge, RoundResult, TakeMeta, TrackLength } from '../domain/types'
import { firstChallenge } from '../director/basicDirector'
import { scoreRound, finalResult } from '../scoring/round'
import { contentWords } from '../lyrics/text'
import { localModel } from '../director/localModel'
import { settingsStore } from '../settings/settings'
import { fitWindow, type SectionWindow, type SectionZone } from '../play/sectionWindow'

export interface DuoTurn {
  index: number
  player: 0 | 1
  barStart: number
  barEnd: number
  start: number
  end: number
  vocalOffset: number
  boundary: 'clean' | 'overlap'
  lyrics: string[]
  challenge: Challenge
  ready: boolean
  take: TakeMeta | null
  result: RoundResult | null
  captureId?: string
  /** Online: where the player put START / END inside their bars (beat-file seconds). */
  section?: { start: number; end: number } | null
}

/** Where an online turn's START / END may go: its own bars (plus the overlap beat), never the next player's. */
export function turnZone(s: Pick<DuoSession, 'beatGrid'>, t: DuoTurn): SectionZone {
  const step = 60 / s.beatGrid.bpm
  const min = t.start + t.vocalOffset
  return { min, max: t.end, maxLen: t.end - min, minLen: step * s.beatGrid.beatsPerBar, step, origin: s.beatGrid.introOffset }
}

/** The turn's recording window: what the player chose, or all of its bars. */
export function turnWindow(s: Pick<DuoSession, 'beatGrid'>, t: DuoTurn): SectionWindow {
  const zone = turnZone(s, t)
  return fitWindow(zone, t.section, { start: zone.min, end: zone.max })
}
export function duoObservations(s: DuoSession): string[] {
  const notes: string[] = []
  for (let i = 1; i < s.turns.length; i++) {
    const prior = s.turns[i - 1],
      current = s.turns[i]
    const words = new Set(contentWords(prior.lyrics.join(' ')))
    const shared = contentWords(current.lyrics.join(' ')).find((w) => words.has(w))
    if (shared)
      notes.push(
        `${s.players[current.player]} picks up “${shared}” from ${s.players[prior.player]}'s previous section.`,
      )
  }
  if (s.turns.some((t) => t.boundary === 'overlap'))
    notes.push(
      s.mode==='online'?'Intentional overlaps combine two separately captured microphones in the finished mix.': 'Intentional overlaps are part of the shared recording. Listen back together; voice-by-voice performance is not attributed there.',
    )
  if (!notes.length)
    notes.push(
      'No repeated story details detected between neighbours. Listen for whether each section answers the previous player.',
    )
  return notes.slice(0, 4)
}
export interface DuoSession {
  adlibs?: import('../domain/types').AdlibLayer[]
  version: 1
  kind: 'multiplayer'
  mode?: 'online'
  roomCode?: string
  id: string
  trackName: string
  players: [string, string]
  beatId: string
  beatName: string
  beatGrid: Pick<BeatMeta, 'bpm' | 'introOffset' | 'beatsPerBar' | 'durationSec'>
  topic: string
  length: TrackLength
  style: 'standard' | 'quick'
  turns: DuoTurn[]
  storyDirection: string
  status: 'preparing' | 'active' | 'complete'
  master: TakeMeta | null
  createdAt: number
  updatedAt: number
}
export function newDuo(input: {
  players: [string, string]
  trackName: string
  beat: BeatMeta
  topic: string
  length: TrackLength
  style: DuoSession['style']
  boundary: DuoTurn['boundary']
}): DuoSession {
  const count = input.style === 'standard' ? 4 : 2
  const spb = 60 / input.beat.bpm,
    spBar = spb * input.beat.beatsPerBar
  return {
    version: 1,
    kind: 'multiplayer',
    id: crypto.randomUUID(),
    players: input.players.map((p, i) => p.trim() || `Player ${i + 1}`) as [string, string],
    trackName: input.trackName.trim() || 'Our track',
    beatId: input.beat.id,
    beatName: input.beat.name,
    beatGrid: {
      bpm: input.beat.bpm,
      introOffset: input.beat.introOffset,
      beatsPerBar: input.beat.beatsPerBar,
      durationSec: input.beat.durationSec,
    },
    topic: input.topic,
    length: input.length,
    style: input.style,
    storyDirection: input.topic,
    status: 'preparing',
    master: null,
    turns: Array.from({ length: input.length / count }, (_, i) => ({
      index: i,
      player: (i % 2) as 0 | 1,
      barStart: i * count,
      barEnd: (i + 1) * count,
      start: input.beat.introOffset + i * count * spBar,
      end: input.beat.introOffset + (i + 1) * count * spBar,
      vocalOffset: i && input.boundary === 'overlap' ? -spb : 0,
      boundary: i ? input.boundary : 'clean',
      lyrics: Array(count).fill(''),
      challenge: firstChallenge(input.topic),
      ready: false,
      take: null,
      result: null,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
export function activeTurns(s: DuoSession, time: number) {
  return s.turns.filter((t) => time >= t.start + t.vocalOffset && time < t.end)
}
export function basicDuoChallenge(s: DuoSession, index: number): Challenge {
  const turn = s.turns[index],
    prior = s.turns[index - 1]
  const anchor = prior ? contentWords(prior.lyrics.join(' ')).slice(-3).join(', ') : s.topic
  const detail = anchor.split(', ').slice(-1)[0]
  const action = index === 0 ? `Open your shared song about ${s.topic}`
    : index === s.turns.length - 1 ? `Finish the story ${s.players[prior.player]} started about ${detail}`
    : index % 3 === 2 ? `What could stop ${s.players[prior.player]}'s plans for ${detail}?`
    : `Answer ${s.players[prior.player]}'s idea about ${detail}`
  return {
    prompt: `Rap ${turn.lyrics.length} bars: ${action.replace(/\?$/, '')}.`,
    focus: contentWords(anchor),
    storyBeat: index === 0 ? 'opening' : 'response',
    source: 'basic',
  }
}
export async function duoChallenge(s: DuoSession, index: number): Promise<Challenge> {
  const fallback = basicDuoChallenge(s, index),
    turn = s.turns[index]
  if (settingsStore.get().aiMode !== 'local' || localModel.getState().status !== 'ready')
    return fallback
  try {
    const context = {
      topic: s.topic,
      players: s.players,
      storyDirection: s.storyDirection,
      incomingPlayer: s.players[turn.player],
      bars: turn.lyrics.length,
      history: s.turns
        .slice(0, index)
        .map((t) => ({
          player: s.players[t.player],
          lyrics: t.lyrics,
          challenge: t.challenge.prompt,
        })),
    }
    const raw = await localModel.chat(
      [
        {
          role: 'system',
          content:
            'You direct a rap duo. Give one sentence, at most 20 words, in everyday language; one task only, never lyrics. Reply JSON with a single prompt string. Address the incoming player, respond to the latest lyrics and develop the shared story.',
        },
        { role: 'user', content: JSON.stringify(context) },
      ],
      {
        maxTokens: 160,
        temperature: 0.7,
        timeoutMs: 30000,
        jsonSchema: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
        },
      },
    )
    const obj = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    const p = String(obj.prompt ?? '').trim()
    const anchor = fallback.focus
    if (
      p.length < 15 ||
      p.split(/\s+/).length > 20 || /[.!?].+\S/.test(p) ||
      /\n|\s\/\s/.test(p) ||
      !/\b(write|rap|respond|develop|introduce|explain|describe)\b/i.test(p) ||
      (index > 0 && !anchor.some((w) => p.toLowerCase().includes(w.toLowerCase()))) ||
      s.turns.slice(0, index).some((t) => t.challenge.prompt === p)
    )
      return fallback
    return { ...fallback, prompt: `${turn.lyrics.length} bars · ${p}`, source: 'local-ai' }
  } catch {
    return fallback
  }
}
export function scoreDuoTurn(
  s: DuoSession,
  t: DuoTurn,
  audio: { samples: Float32Array; sampleRate: number; startTime: number } | null,
): RoundResult {
  const overlap = s.mode !== 'online' && (t.boundary === 'overlap' || s.turns[t.index + 1]?.boundary === 'overlap')
  const secondsPerBeat = 60 / s.beatGrid.bpm,
    secondsPerBar = secondsPerBeat * s.beatGrid.beatsPerBar
  const results: RoundResult[] = []
  // each pair of lines gets its share of the chosen START → END window
  const win = turnWindow(s, t)
  const share = (win.end - win.start) / t.lyrics.length
  for (let i = 0; i < t.lyrics.length; i += 2) {
    const lyrics = [t.lyrics[i], t.lyrics[i + 1]] as [string, string]
    results.push(
      scoreRound(
        {
          lyrics,
          challenge: t.challenge,
          topic: s.topic,
          previous: s.turns
            .slice(0, t.index)
            .flatMap((p) =>
              Array.from({ length: p.lyrics.length / 2 }, (_, j) => ({
                lyrics: [p.lyrics[j * 2], p.lyrics[j * 2 + 1]] as [string, string],
                challenge: p.challenge,
              })),
            ),
        },
        audio && !overlap
          ? {
              samples: audio.samples,
              sampleRate: audio.sampleRate,
              beatTimeSec: audio.startTime,
              sectionStart: win.start + i * share,
              sectionEnd: win.start + (i + 2) * share,
              secondsPerBeat,
            }
          : null,
        '',
        { secondsPerBar },
      ),
    )
  }
  const avg = finalResult(results)
  return {
    ...results[0],
    score: avg.score,
    rank: avg.rank,
    writingScore: avg.writing ?? undefined,
    performanceScore: avg.performance,
    categories: avg.averages.map((c) => ({
      ...c,
      basis: c.category === 'performance' ? 'audio' : 'lyrics',
      confidence: c.category === 'rhyme' ? (results.some(r=>r.categories.find(x=>x.category==='rhyme')?.confidence !== 'medium') ? 'low' : 'medium') : undefined,
      reasons: results
        .flatMap((r) => r.categories.find((x) => x.category === c.category)?.reasons ?? [])
        .slice(0, 8),
    })),
    feedback: [
      ...results[0].feedback,
      ...(overlap ? ['Shared-mic overlap: individual performance is not attributed.'] : []),
    ],
    analysis:
      'Writing feedback uses your typed lyrics; performance uses the recording where attribution is possible.',
  }
}
