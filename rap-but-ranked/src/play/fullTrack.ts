import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { renderMix, vocalGain, type VocalClip } from '../audio/mix'
import { encodeWav } from '../audio/wav'
import type { SavedBeat, Session } from '../domain/types'
import { getBeatAudio } from '../storage'
import { sectionFor } from './sessionLogic'
import { takeBuffer } from './takeAudio'

/**
 * The finished song: the original beat from one bar before your first bars
 * to one bar after your last, with every accepted take placed exactly where
 * it was recorded.
 */
export async function buildFullTrack(session: Session, beat: SavedBeat, ctx: BaseAudioContext) {
  const beatBuffer = await beatPlayer.loadBuffer({ id: beat.id, getBlob: () => getBeatAudio(beat.id) })
  const scored = session.rounds.filter((r) => r.take)
  const clips: VocalClip[] = []
  for (const r of scored) {
    const buf = await takeBuffer(ctx, r.take!.id)
    if (buf) clips.push({ buffer: buf, beatTime: r.take!.beatTimeSec, gain: vocalGain(r.take!.inputPeak) })
  }
  const first = sectionFor(beat, 0)
  const last = sectionFor(beat, Math.max(0, session.rounds.length - 1))
  const from = Math.max(0, first.start - first.grid.secondsPerBar)
  const to = Math.min(beat.durationSec, last.end + last.grid.secondsPerBar)
  return { beatBuffer, clips, from, to }
}

/** Which round's bars are playing at beat-time t (for lyric highlighting). */
export function roundAt(session: Session, beat: SavedBeat, t: number): number | null {
  for (const r of session.rounds) {
    const s = sectionFor(beat, r.index)
    if (t >= s.start && t < s.end) return r.index
  }
  return null
}

export async function downloadTrack(session: Session, beat: SavedBeat) {
  audio.unlock()
  const ctx = audio.context ?? new OfflineAudioContext(1, 1, 44100)
  const { beatBuffer, clips, from, to } = await buildFullTrack(session, beat, ctx)
  const mixed = await renderMix(beatBuffer, clips, from, to)
  const blob = encodeWav([mixed.getChannelData(0), mixed.getChannelData(1)], mixed.sampleRate)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${session.trackName.replace(/[^\w\- ]+/g, '').trim() || 'rap-but-ranked'}.wav`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return blob.size
}
