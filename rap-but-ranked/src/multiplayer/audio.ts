import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { renderMix, type VocalClip } from '../audio/mix'
import { envelope, levelGain } from '../audio/arrange'
import { getBeatAudio } from '../storage'
import { takeBuffer, takeSamples } from '../play/takeAudio'
import { adlibClips } from '../play/adlibs'
import { saveWav } from '../play/fullTrack'
import type { DuoSession } from './session'

/** Master is heard once, including shared-mic overlaps. Punch-ins replace fixed slots. */
export function masterRegions(s: DuoSession) {
  let regions = [{ start: s.turns[0].start, end: s.turns.at(-1)!.end + 0.35 }]
  for (const t of s.turns.filter((t) => t.take)) {
    const start = t.start + t.vocalOffset
    regions = regions.flatMap((r) =>
      r.end <= start || r.start >= t.end
        ? [r]
        : [
            { start: r.start, end: Math.min(r.end, start) },
            { start: Math.max(r.start, t.end), end: r.end },
          ].filter((x) => x.end > x.start),
    )
  }
  return regions
}
export async function duoMix(s: DuoSession, ctx: BaseAudioContext) {
  const beatBuffer = await beatPlayer
    .loadBuffer({ id: s.beatId, getBlob: () => getBeatAudio(s.beatId) })
    .catch(() => null)
  const clips: VocalClip[] = []
  const add = async (id: string, start: number, regions: { start: number; end: number }[]) => {
    const [buffer, data] = await Promise.all([takeBuffer(ctx, id), takeSamples(id)])
    if (!buffer || !data) throw new Error('Saved vocal audio is missing.')
    const gain = levelGain(envelope(data.samples, data.sampleRate))
    for (const r of regions)
      clips.push({
        id,
        buffer,
        beatTime: start,
        gain,
        region: { ...r, fadeIn: 0.015, fadeOut: 0.015 },
      })
  }
  if (s.master) await add(s.master.id, s.master.beatTimeSec, masterRegions(s))
  for (const t of s.turns)
    if (t.take)
      await add(t.take.id, t.take.beatTimeSec, [{ start: t.start + t.vocalOffset, end: t.end }])
  return {
    beatBuffer,
    clips:[...clips,...await adlibClips(s.adlibs,ctx)],
    from: Math.max(0, s.turns[0].start - 60 / s.beatGrid.bpm),
    to: s.turns.at(-1)!.end + 0.35,
  }
}
export async function downloadDuo(s: DuoSession) {
  audio.unlock()
  const ctx = audio.context ?? new OfflineAudioContext(2, 1, 44100)
  const m = await duoMix(s, ctx)
  return saveWav(await renderMix(m.beatBuffer, m.clips, m.from, m.to), s.trackName)
}
