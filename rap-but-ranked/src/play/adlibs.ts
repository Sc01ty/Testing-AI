import type { AdlibLayer } from '../domain/types'
import type { VocalClip } from '../audio/mix'
import { takeBuffer, takeSamples } from './takeAudio'
import { envelope, levelGain } from '../audio/arrange'

/** Layers share the existing take store, but never replace accepted lead vocals. */
export async function adlibClips(
  layers: AdlibLayer[] = [],
  ctx: BaseAudioContext,
): Promise<VocalClip[]> {
  return Promise.all(
    layers
      .filter((l) => !l.muted)
      .map(async (l) => {
        const [buffer, data] = await Promise.all([takeBuffer(ctx, l.id), takeSamples(l.id)])
        if (!buffer || !data) throw new Error('Ad-lib audio is missing on this device.')
        return {
          id: l.id,
          buffer,
          beatTime: l.startTime,
          gain: levelGain(envelope(data.samples, data.sampleRate)) * 0.55,
          region: {
            start: l.startTime,
            end: l.startTime + l.durationSec,
            fadeIn: 0.015,
            fadeOut: 0.035,
          },
        }
      }),
  )
}
