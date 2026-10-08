import { arrangeTakes } from '../audio/arrange'
import type { VocalClip } from '../audio/mix'
import { takeBuffer, takeSamples } from './takeAudio'

/** Where a stored take sits on the timeline. */
export interface PlacedTake {
  id: string
  beatTimeSec: number
  sectionStartSec: number
  sectionEndSec: number
}

/**
 * Takes → clips ready to schedule: each placed where it was recorded, seams
 * cut in the quiet between them, levels matched (see audio/arrange.ts).
 * Takes whose audio is missing are skipped.
 */
export async function arrangedClips(ctx: BaseAudioContext, takes: PlacedTake[]): Promise<VocalClip[]> {
  const loaded = await Promise.all(
    takes.map(async (t) => {
      const [s, buffer] = await Promise.all([takeSamples(t.id), takeBuffer(ctx, t.id)])
      return s && buffer ? { t, s, buffer } : null
    }),
  )
  const ok = loaded.filter((x): x is NonNullable<typeof x> => !!x)
  const regions = arrangeTakes(
    ok.map(({ t, s }) => ({ id: t.id, samples: s.samples, sampleRate: s.sampleRate, startTime: t.beatTimeSec, sectionStart: t.sectionStartSec, sectionEnd: t.sectionEndSec })),
  )
  return ok.map(({ t, buffer }) => {
    const r = regions.find((x) => x.id === t.id)!
    return { id: t.id, buffer, beatTime: t.beatTimeSec, gain: r.gain, region: { start: r.start, end: r.end, fadeIn: r.fadeIn, fadeOut: r.fadeOut } }
  })
}
