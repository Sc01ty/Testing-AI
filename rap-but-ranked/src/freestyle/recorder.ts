import { computePeaks } from '../audio/analysis/peaks'
import { audio } from '../audio/AudioEngine'
import { beatPlayer, type PlayableBeat } from '../audio/BeatPlayer'
import { ClickTrack } from '../audio/metronome'
import { estimateLatency, mic } from '../audio/mic'
import { scheduleMix } from '../audio/mix'
import { Capture, RecordError, countClick, loadWorklet, peakOf } from '../audio/recordTake'
import { trackPlayer } from '../audio/trackPlayer'

/**
 * One continuous freestyle take:
 *
 *   [ count-in bar · 3 2 1 ] [ bar 1 ][ bar 2 ] … [ bar N ] (tail)
 *     loop's last bar + clicks       beat loops, mic records the whole time
 *
 * Timeline 0 is the downbeat of bar 1; the beat loops [loop.start, loop.end)
 * seamlessly underneath for as long as the freestyle runs.
 */
export interface FreestylePlan {
  beat: PlayableBeat
  loop: { start: number; end: number }
  bars: number
  secondsPerBeat: number
  beatsPerBar: number
  /** Absolute client-clock count-in start, supplied by a synchronised lobby. */
  startAtMs?: number
}

export interface FreestyleCallbacks {
  onPhase?: (p: 'preparing' | 'countin' | 'live' | 'finishing') => void
  onCount?: (n: number | null) => void
  /** Timeline seconds now (negative during the count-in), every frame. */
  onTime?: (t: number) => void
  /** Live vocal waveform across the whole freestyle (0..1 per column). */
  onLive?: (peaks: number[]) => void
}

export interface FreestyleRecording {
  samples: Float32Array
  sampleRate: number
  /** Timeline second of sample 0. */
  startTime: number
  latencySec: number
  inputPeak: number
  peaks: number[]
  durationSec: number
  /** Bars actually completed (less than planned if stopped early). */
  barsDone: number
}

const LIVE_COLUMNS = 600
const TAIL_SEC = 0.6

export class FreestyleRecorder {
  private stopRequested = false
  private cancelled = false
  running = false

  stop() {
    this.stopRequested = true
  }
  cancel() {
    this.cancelled = true
    this.stopRequested = true
  }

  async record(plan: FreestylePlan, cb: FreestyleCallbacks = {}): Promise<FreestyleRecording | null> {
    if (this.running) throw new RecordError('Already recording.')
    this.running = true
    try {
      return await this.run(plan, cb)
    } finally {
      this.running = false
      audio.setMusicDucked(false)
    }
  }

  private async run(plan: FreestylePlan, cb: FreestyleCallbacks): Promise<FreestyleRecording | null> {
    cb.onPhase?.('preparing')
    audio.unlock()
    if (!(await mic.ensure())) throw new RecordError(mic.getState().message ?? 'Microphone unavailable.')
    const ctx = audio.context
    const out = audio.beatOutput
    const source = mic.source
    if (!ctx || !out || !source) throw new RecordError('Audio is not ready — click anywhere and try again.')
    if (ctx.state !== 'running') await ctx.resume()
    const [buffer] = await Promise.all([beatPlayer.loadBuffer(plan.beat), loadWorklet(ctx)])
    if (this.cancelled) return null
    beatPlayer.stop()
    trackPlayer.stop()
    audio.setMusicDucked(true)

    const sr = ctx.sampleRate
    const spb = plan.secondsPerBeat
    const spBar = spb * plan.beatsPerBar
    const total = plan.bars * spBar
    const latency = estimateLatency(ctx)
    const capture = new Capture(ctx, source)

    if (plan.startAtMs !== undefined && plan.startAtMs - Date.now() < 200) throw new RecordError('The shared count-in was missed. Ask the host to reset and start again.')
    const t0 = ctx.currentTime + (plan.startAtMs === undefined ? 0.25 : (plan.startAtMs-Date.now())/1000)
    const zeroAt = t0 + spBar // context time of timeline 0
    const scheduled = scheduleMix(ctx, out, buffer, [], -spBar, total + spb, t0, { loop: plan.loop, beatFadeOut: spb })
    const clickOut = audio.clickOutput ?? out
    for (let k = 0; k < plan.beatsPerBar; k++) scheduled.push(countClick(ctx, clickOut, t0 + k * spb, k === 0))
    const metronome = new ClickTrack()
    metronome.start({ at: zeroAt, from: 0, to: total, grid: { origin: 0, secondsPerBeat: spb, beatsPerBar: plan.beatsPerBar } })

    const winStart = zeroAt - spb + latency // a beat early for pickups
    let winEnd = zeroAt + total + TAIL_SEC + latency
    const live = new Array<number>(LIVE_COLUMNS).fill(0)
    let drawn = 0
    let lastCount: number | null = -1
    let phase: 'countin' | 'live' = 'countin'
    cb.onPhase?.('countin')

    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = ctx.currentTime
        const t = now - zeroAt
        let count: number | null = null
        if (t < 0) {
          const beatIdx = Math.floor((now - t0) / spb)
          count = beatIdx >= 1 ? plan.beatsPerBar - beatIdx : null
        }
        if (count !== lastCount) {
          lastCount = count
          cb.onCount?.(count)
        }
        if (phase === 'countin' && t >= -0.02) {
          phase = 'live'
          cb.onPhase?.('live')
        }
        cb.onTime?.(t)
        if (phase === 'live') {
          const span = winEnd - winStart
          for (; drawn < capture.chunks.length; drawn++) {
            const c = capture.chunks[drawn]
            const ct = c.frame / sr
            if (ct + c.data.length / sr < winStart) continue
            const m = peakOf(c.data)
            const col = Math.floor(((ct - winStart) / span) * LIVE_COLUMNS)
            if (col >= 0 && col < LIVE_COLUMNS) live[col] = Math.max(live[col], m)
          }
          cb.onLive?.(live.slice())
        }
        if (this.stopRequested) {
          winEnd = Math.min(winEnd, now)
          return resolve()
        }
        if (now >= winEnd + 0.1) return resolve()
        window.setTimeout(tick, 30)
      }
      tick()
    })

    cb.onPhase?.('finishing')
    cb.onCount?.(null)
    metronome.stop()
    await capture.stop()
    for (const s of scheduled) {
      try {
        s.stop()
      } catch {
        /* done */
      }
    }
    if (this.cancelled || winEnd <= winStart + 1) return null

    const samples = capture.window(winStart, winEnd)
    const startTime = -spb
    const durationSec = samples.length / sr
    return {
      samples,
      sampleRate: sr,
      startTime,
      latencySec: latency,
      inputPeak: peakOf(samples),
      peaks: computePeaks([samples], 1200),
      durationSec,
      barsDone: Math.max(0, Math.min(plan.bars, Math.floor((startTime + durationSec) / spBar + 0.05))),
    }
  }
}
