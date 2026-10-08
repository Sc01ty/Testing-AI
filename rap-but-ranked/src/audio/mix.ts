/**
 * Beat + vocal clips on one timeline. Used live (take playback, full song)
 * and offline (WAV export), so what you hear is exactly what you download.
 *
 * Timeline seconds are beat-file seconds, unless the beat loops (Freestyle):
 * then timeline 0 is `loop.start` in the file and the beat repeats
 * [loop.start, loop.end) seamlessly for as long as needed.
 */
export interface VocalClip {
  /** Which take this is (for drawing / highlighting). */
  id?: string
  buffer: AudioBuffer
  /** Timeline second where sample 0 of the clip belongs. */
  beatTime: number
  gain: number
  /** The part of the clip to play (timeline seconds) and its fades — from arrangeTakes. */
  region?: { start: number; end: number; fadeIn: number; fadeOut: number }
}

export interface MixOptions {
  /** Where vocals go (defaults to `out`). */
  vocalOut?: AudioNode
  /** Fade the beat out over the last n seconds. */
  beatFadeOut?: number
  /** Loop this part of the beat file; timeline 0 = loop.start. */
  loop?: { start: number; end: number }
}

const FADE = 0.012

/**
 * Schedule everything between timeline seconds [from, to] to start at
 * context time `at`. Returns the sources so a live player can stop them.
 */
export function scheduleMix(
  ctx: BaseAudioContext,
  out: AudioNode,
  beat: AudioBuffer | null,
  clips: VocalClip[],
  from: number,
  to: number,
  at: number,
  opts: MixOptions = {},
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = []
  const span = Math.max(0.01, to - from)

  if (beat) {
    const bs = ctx.createBufferSource()
    bs.buffer = beat
    const bg = ctx.createGain()
    bs.connect(bg).connect(out)
    let started = false
    if (opts.loop) {
      const { start, end } = opts.loop
      const len = end - start
      // before bar 1 (a count-in) the loop's last bars play, like any loop would
      if (from < to && len > 0.05) {
        bs.loop = true
        bs.loopStart = start
        bs.loopEnd = end
        bs.start(at, start + (((from % len) + len) % len))
        bs.stop(at + span)
        started = true
      }
    } else {
      // (may start before the file does — e.g. a count-in over silence)
      const beatFrom = Math.max(0, from)
      const beatDur = Math.min(beat.duration - beatFrom, to - beatFrom)
      if (beatDur > 0) {
        bs.start(at + (beatFrom - from), beatFrom, beatDur)
        started = true
      }
    }
    if (started) {
      if (opts.beatFadeOut) {
        const end = at + span
        bg.gain.setValueAtTime(1, Math.max(at, end - opts.beatFadeOut))
        bg.gain.linearRampToValueAtTime(0.0001, end)
      }
      sources.push(bs)
    }
  }

  for (const c of clips) {
    const clipStart = c.beatTime
    const clipEnd = c.beatTime + c.buffer.duration
    const regStart = c.region ? Math.max(clipStart, c.region.start) : clipStart
    const regEnd = c.region ? Math.min(clipEnd, c.region.end) : clipEnd
    const s = Math.max(from, regStart)
    const e = Math.min(to, regEnd)
    if (e - s < 0.005) continue
    const dur = e - s
    // the region's own fades where it really starts/ends; a tiny anti-click fade where playback cuts in
    let fi = s > regStart + 1e-4 ? FADE : (c.region?.fadeIn ?? FADE)
    let fo = e < regEnd - 1e-4 ? FADE : (c.region?.fadeOut ?? FADE)
    if (fi + fo > dur) {
      const k = dur / (fi + fo)
      fi *= k
      fo *= k
    }
    const src = ctx.createBufferSource()
    src.buffer = c.buffer
    const g = ctx.createGain()
    const when = at + (s - from)
    // silent before the fade begins too: a source started between samples renders its
    // first sample a hair before `when`, and a gain's default of 1 would let it click
    g.gain.value = 0
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(c.gain, when + fi)
    g.gain.setValueAtTime(c.gain, when + dur - fo)
    g.gain.linearRampToValueAtTime(0, when + dur)
    src.connect(g).connect(opts.vocalOut ?? out)
    src.start(when, s - clipStart, dur)
    sources.push(src)
  }
  return sources
}

/** Render [from, to] of the mix to a stereo AudioBuffer (for download). The metronome is never part of it. */
export async function renderMix(beat: AudioBuffer | null, clips: VocalClip[], from: number, to: number, opts: { loop?: MixOptions['loop']; sampleRate?: number } = {}) {
  const sampleRate = opts.sampleRate ?? 44100
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
  scheduleMix(ctx, comp, beat, clips, from, to, 0, { beatFadeOut: 1.2, loop: opts.loop })
  return ctx.startRendering()
}
