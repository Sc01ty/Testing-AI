/**
 * Beat + vocal clips on one timeline (seconds of the beat file). Used live
 * (take playback, full song) and offline (WAV export), so they always match.
 */
export interface VocalClip {
  buffer: AudioBuffer
  /** Beat-file second where sample 0 of the clip belongs. */
  beatTime: number
  gain: number
}

const FADE = 0.012

/**
 * Schedule everything between beat seconds [from, to] to start at context
 * time `at`. Returns the sources so a live player can stop them.
 */
export function scheduleMix(
  ctx: BaseAudioContext,
  out: AudioNode,
  beat: AudioBuffer,
  clips: VocalClip[],
  from: number,
  to: number,
  at: number,
  opts: { vocalOut?: AudioNode; beatFadeOut?: number } = {},
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = []
  const span = Math.max(0.01, to - from)

  // beat (may start before the file does — e.g. a count-in over silence)
  const bs = ctx.createBufferSource()
  bs.buffer = beat
  const bg = ctx.createGain()
  bs.connect(bg).connect(out)
  const beatFrom = Math.max(0, from)
  const beatAt = at + (beatFrom - from)
  const beatDur = Math.min(beat.duration - beatFrom, to - beatFrom)
  if (beatDur > 0) {
    bs.start(beatAt, beatFrom, beatDur)
    if (opts.beatFadeOut) {
      const end = at + span
      bg.gain.setValueAtTime(1, Math.max(at, end - opts.beatFadeOut))
      bg.gain.linearRampToValueAtTime(0.0001, end)
    }
    sources.push(bs)
  }

  for (const c of clips) {
    const clipStart = c.beatTime
    const clipEnd = c.beatTime + c.buffer.duration
    const s = Math.max(from, clipStart)
    const e = Math.min(to, clipEnd)
    if (e <= s) continue
    const src = ctx.createBufferSource()
    src.buffer = c.buffer
    const g = ctx.createGain()
    const when = at + (s - from)
    const dur = e - s
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(c.gain, when + FADE)
    g.gain.setValueAtTime(c.gain, when + Math.max(FADE, dur - FADE))
    g.gain.linearRampToValueAtTime(0, when + dur)
    src.connect(g).connect(opts.vocalOut ?? out)
    src.start(when, s - clipStart, dur)
    sources.push(src)
  }
  return sources
}

/** Render [from, to] of the mix to a stereo AudioBuffer (for download). */
export async function renderMix(beat: AudioBuffer, clips: VocalClip[], from: number, to: number, sampleRate = 44100) {
  const frames = Math.ceil((to - from) * sampleRate)
  const ctx = new OfflineAudioContext(2, frames, sampleRate)
  // gentle bus limiter so beat + vocal can't clip the export
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -6
  comp.knee.value = 6
  comp.ratio.value = 8
  comp.attack.value = 0.003
  comp.release.value = 0.15
  comp.connect(ctx.destination)
  scheduleMix(ctx, comp, beat, clips, from, to, 0, { beatFadeOut: 1.2 })
  return ctx.startRendering()
}

/** Bring quiet laptop-mic takes up to a usable level (never more than +18 dB). */
export function vocalGain(inputPeak: number) {
  if (inputPeak <= 0.0005) return 1
  return Math.min(8, 0.75 / inputPeak)
}
