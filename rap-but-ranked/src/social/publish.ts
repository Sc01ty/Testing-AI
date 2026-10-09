import { audio } from '../audio/AudioEngine'
import { renderMix } from '../audio/mix'
import { encodeWav } from '../audio/wav'
import { rankForScore } from '../domain/rank'
import { barsOfWords } from '../freestyle/score'
import { freestyleMix, timing } from '../freestyle/session'
import { duoMix } from '../multiplayer/audio'
import { buildFullTrack } from '../play/fullTrack'
import { gridOf } from '../play/sessionLogic'
import { finalResult } from '../scoring/round'
import { getBeat, type SavedItem } from '../storage'
import type { PieceKind, PublishMeta } from './api'

/**
 * Turns a saved piece into what the Feed needs: the finished mix as a small
 * WAV (22.05 kHz mono, ~1.7 MB for 16 bars) and the card details. Only things
 * made in the app can be published, so nothing here takes an outside file.
 */
const RATE = 22050

export const kindOf = (item: SavedItem): PieceKind => (item.kind === 'multiplayer' ? 'room' : item.kind)
export const sourceIdOf = (item: SavedItem) => `${kindOf(item)}:${item.id}`
export const titleOf = (item: SavedItem) => (item.kind === 'track' ? item.session.trackName : item.kind === 'freestyle' ? item.freestyle.name : item.duo.trackName)

export function summaryOf(item: SavedItem): Omit<PublishMeta, 'title' | 'caption'> {
  if (item.kind === 'track') {
    const s = item.session
    const results = s.rounds.map((r) => r.result).filter((r): r is NonNullable<typeof r> => !!r)
    const f = finalResult(results)
    return {
      sourceId: sourceIdOf(item),
      kind: 'track',
      lyrics: s.rounds.flatMap((r) => r.lyrics),
      score: f.score,
      grade: f.rank,
      bars: s.length,
      duration: 0,
      beat: s.beatName,
      breakdown: f.averages.map((a) => ({ label: a.label, score: a.score })),
      rounds: results.map((r) => ({ grade: r.rank, score: r.score })),
    }
  }
  if (item.kind === 'freestyle') {
    const fs = item.freestyle
    const r = fs.result!
    const lines = fs.transcript ? barsOfWords(fs.transcript.words, fs.bars, timing(fs).spBar).map((b) => b.join(' ')).filter(Boolean) : []
    return {
      sourceId: sourceIdOf(item),
      kind: 'freestyle',
      lyrics: lines,
      score: r.score,
      grade: r.rank,
      bars: fs.bars,
      duration: 0,
      beat: fs.beatName,
      breakdown: r.categories.map((c) => ({ label: c.label, score: c.score })),
      rounds: [],
    }
  }
  const d = item.duo
  const turns = d.turns.filter((t) => t.result)
  const score = Math.round(turns.reduce((a, t) => a + t.result!.score, 0) / Math.max(1, turns.length))
  return {
    sourceId: sourceIdOf(item),
    kind: 'room',
    lyrics: d.turns.flatMap((t) => t.lyrics.map((l, i) => (i === 0 ? `${d.players[t.player]}: ${l}` : l))),
    score,
    grade: rankForScore(score),
    bars: d.length,
    duration: 0,
    beat: d.beatName,
    breakdown: [],
    rounds: turns.map((t) => ({ grade: t.result!.rank, score: t.result!.score })),
  }
}

/** The finished mix at Feed quality. */
export async function renderForFeed(item: SavedItem): Promise<{ wav: Blob; duration: number }> {
  audio.unlock()
  const ctx = audio.context ?? new OfflineAudioContext(2, 1, 44100)
  let mixed: AudioBuffer
  if (item.kind === 'track') {
    const meta = await getBeat(item.session.beatId)
    const grid = gridOf(item.session, meta)!
    const t = await buildFullTrack(item.session, meta ? { ...meta, ...grid } : { id: item.session.beatId, ...grid }, ctx, { withBeat: !!meta })
    mixed = await renderMix(t.beatBuffer, t.clips, t.from, t.to, { sampleRate: RATE })
  } else if (item.kind === 'freestyle') {
    const meta = await getBeat(item.freestyle.beatId)
    const m = await freestyleMix(item.freestyle, ctx, !!meta)
    mixed = await renderMix(m.beatBuffer, m.clips, m.from, m.to, { loop: m.loop, sampleRate: RATE })
  } else {
    const m = await duoMix(item.duo, ctx)
    mixed = await renderMix(m.beatBuffer, m.clips, m.from, m.to, { sampleRate: RATE })
  }
  const l = mixed.getChannelData(0)
  const r = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : l
  const mono = new Float32Array(l.length)
  for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2
  return { wav: encodeWav([mono], mixed.sampleRate), duration: mixed.duration }
}
