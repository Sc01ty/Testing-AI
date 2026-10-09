import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { renderMix } from '../audio/mix'
import { encodeWav } from '../audio/wav'
import type { SavedBeat, Session } from '../domain/types'
import { getBeatAudio } from '../storage'
import { roundSections } from './sessionLogic'
import { adlibClips } from './adlibs'
import { arrangedClips } from './vocals'

/**
 * The finished song: the original beat from one bar before your first bars
 * to one bar after your last, with every accepted take placed exactly where
 * it was recorded and joined into one continuous vocal (no gaps, no doubling).
 * If the beat was deleted from the library, the vocals still play on their own.
 */
export async function buildFullTrack(session: Session, beat: Pick<SavedBeat, 'id' | 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>, ctx: BaseAudioContext, opts: { withBeat?: boolean } = {}) {
  const beatBuffer = opts.withBeat === false ? null : await beatPlayer.loadBuffer({ id: beat.id, getBlob: () => getBeatAudio(beat.id) }).catch(() => null)
  const clips = await arrangedClips(ctx, session.rounds.filter((r) => r.take && r.result).map((r) => r.take!))
  const sections = roundSections(session, beat)
  const first = sections[0]
  const last = sections[sections.length - 1]
  const from = Math.max(0, first.start - first.grid.secondsPerBar)
  const to = Math.min(beat.durationSec, last.end + last.grid.secondsPerBar)
  return { beatBuffer, clips: [...clips,...await adlibClips(session.adlibs,ctx)], from, to }
}

/** Which round's bars are playing at beat-time t (for lyric highlighting). */
export function roundAt(session: Session, beat: Pick<SavedBeat, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>, t: number): number | null {
  const sections = roundSections(session, beat)
  for (const r of session.rounds) {
    const s = sections[r.index]
    if (t >= s.start && t < s.end) return r.index
  }
  return null
}

export async function downloadTrack(session: Session, beat: Pick<SavedBeat, 'id' | 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>) {
  audio.unlock()
  const ctx = audio.context ?? new OfflineAudioContext(1, 1, 44100)
  const { beatBuffer, clips, from, to } = await buildFullTrack(session, beat, ctx)
  const mixed = await renderMix(beatBuffer, clips, from, to)
  return saveWav(mixed, session.trackName)
}

/** Offer a rendered mix as a .wav download; returns its size in bytes. */
export function saveWav(mixed: AudioBuffer, name: string) {
  const blob = encodeWav([mixed.getChannelData(0), mixed.getChannelData(1)], mixed.sampleRate)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'rap-but-ranked'}.wav`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return blob.size
}
