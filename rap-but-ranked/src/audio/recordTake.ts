import { computePeaks } from './analysis/peaks'
import { audio } from './AudioEngine'
import { beatPlayer, type PlayableBeat } from './BeatPlayer'
import { estimateLatency, mic } from './mic'
import { scheduleMix } from './mix'
import { trackPlayer } from './trackPlayer'
import workletUrl from './recorder.worklet.js?url'

/**
 * Record two bars over the beat:
 *
 *   [ count-in bar: · 3 2 1 ] [ bar A ][ bar B ] (tail)
 *          beat + clicks          beat + mic capture
 *
 * Everything is scheduled on the AudioContext clock. The mic is captured
 * by an AudioWorklet with frame timestamps, and the round-trip latency
 * (speaker out + mic in, plus the user's fine-tune) is subtracted, so
 * sample 0 of the take sits at a known beat position.
 */
export interface RecordPlan {
  beat: PlayableBeat
  sectionStart: number
  sectionEnd: number
  secondsPerBeat: number
  beatsPerBar: number
}

export type RecordPhase = 'preparing' | 'countin' | 'recording' | 'finishing'

export interface RecordCallbacks {
  onPhase?: (p: RecordPhase) => void
  /** 3, 2, 1 during the count-in; null otherwise. */
  onCount?: (n: number | null) => void
  /** Live vocal waveform so far (0..1 per column) + how far through the take we are (0..1). */
  onLive?: (peaks: number[], progress: number) => void
}

export interface RecordedTake {
  samples: Float32Array
  sampleRate: number
  /** Beat-file second of sample 0 (latency-compensated). */
  beatTimeSec: number
  latencySec: number
  inputPeak: number
  peaks: number[]
  durationSec: number
  sectionStart: number
  sectionEnd: number
}

export class RecordError extends Error {}

/** Allow coming in a beat early (pickups) and a little spill after bar 2. */
const PICKUP_BEATS = 1
const TAIL_SEC = 0.45
const LIVE_COLUMNS = 220

const workletReady = new WeakMap<BaseAudioContext, Promise<void>>()
function loadWorklet(ctx: AudioContext) {
  let p = workletReady.get(ctx)
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl)
    workletReady.set(ctx, p)
  }
  return p
}

function click(ctx: AudioContext, out: AudioNode, when: number, accent: boolean) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.value = accent ? 1760 : 1320
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.14, when + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  o.connect(g).connect(out)
  o.start(when)
  o.stop(when + 0.06)
  return o
}

export class TakeRecorder {
  private stopRequested = false
  private cancelled = false
  private running = false

  /** Finish now and keep what was recorded. */
  stop() {
    this.stopRequested = true
  }

  /** Abort and discard. */
  cancel() {
    this.cancelled = true
    this.stopRequested = true
  }

  get isRunning() {
    return this.running
  }

  async record(plan: RecordPlan, cb: RecordCallbacks = {}): Promise<RecordedTake | null> {
    if (this.running) throw new RecordError('Already recording.')
    this.running = true
    try {
      return await this.run(plan, cb)
    } finally {
      this.running = false
      audio.setMusicDucked(false)
    }
  }

  private async run(plan: RecordPlan, cb: RecordCallbacks): Promise<RecordedTake | null> {
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
    const preroll = spb * plan.beatsPerBar
    const sectionDur = plan.sectionEnd - plan.sectionStart
    const lead = spb * PICKUP_BEATS
    const latency = estimateLatency(ctx)

    // capture node
    const node = new AudioWorkletNode(ctx, 'rbr-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    const sink = ctx.createGain()
    sink.gain.value = 0
    source.connect(node)
    node.connect(sink).connect(ctx.destination)
    const captured: { frame: number; data: Float32Array }[] = []
    let drawn = 0 // how many captured chunks the live waveform has used
    node.port.onmessage = (e: MessageEvent<{ frame: number; data: Float32Array }>) => captured.push(e.data)

    // schedule beat (from one bar before the section) + count-in clicks
    const t0 = ctx.currentTime + 0.2
    const sectionAt = t0 + preroll
    const scheduled = scheduleMix(ctx, out, buffer, [], plan.sectionStart - preroll, plan.sectionEnd + Math.min(0.6, spb), t0)
    for (let k = 0; k < plan.beatsPerBar; k++) scheduled.push(click(ctx, out, t0 + k * spb, k === 0))

    const winStart = sectionAt - lead + latency
    let winEnd = sectionAt + sectionDur + TAIL_SEC + latency
    const totalCols = LIVE_COLUMNS
    const livePeaks = new Array<number>(totalCols).fill(0)

    cb.onPhase?.('countin')
    let lastCount: number | null = -1
    let phase: RecordPhase = 'countin'

    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = ctx.currentTime
        // count-in display: beats 2–4 of the count-in bar show 3, 2, 1
        let count: number | null = null
        if (now < sectionAt) {
          const beatIdx = Math.floor((now - t0) / spb)
          count = beatIdx >= 1 ? plan.beatsPerBar - beatIdx : null
          if (beatIdx < 0) count = null
        }
        if (count !== lastCount) {
          lastCount = count
          cb.onCount?.(count)
        }
        if (phase === 'countin' && now >= sectionAt - 0.02) {
          phase = 'recording'
          cb.onPhase?.('recording')
        }
        // live waveform from captured chunks inside the window
        if (phase === 'recording') {
          const span = winEnd - winStart
          for (; drawn < captured.length; drawn++) {
            const c = captured[drawn]
            const t = c.frame / sr
            if (t + c.data.length / sr < winStart) continue
            let m = 0
            for (let i = 0; i < c.data.length; i++) {
              const v = Math.abs(c.data[i])
              if (v > m) m = v
            }
            const col = Math.floor(((t - winStart) / span) * totalCols)
            if (col >= 0 && col < totalCols) livePeaks[col] = Math.max(livePeaks[col], m)
          }
          cb.onLive?.(livePeaks.slice(), Math.min(1, Math.max(0, (now - winStart) / span)))
        }
        if (this.stopRequested) {
          winEnd = Math.min(winEnd, now)
          resolve()
          return
        }
        if (now >= winEnd + 0.12) {
          resolve()
          return
        }
        window.setTimeout(tick, 25)
      }
      window.setTimeout(tick, 0)
    })

    cb.onPhase?.('finishing')
    cb.onCount?.(null)
    node.port.postMessage('stop')
    await new Promise((r) => setTimeout(r, 80))
    node.port.onmessage = null
    source.disconnect(node)
    node.disconnect()
    for (const s of scheduled) {
      try {
        s.stop()
      } catch {
        /* already done */
      }
    }

    if (this.cancelled || winEnd <= winStart + 0.3) return null

    // assemble the window into one buffer
    const f0 = Math.round(winStart * sr)
    const f1 = Math.round(winEnd * sr)
    const samples = new Float32Array(Math.max(0, f1 - f0))
    for (const c of captured) {
      const start = c.frame - f0
      for (let i = 0; i < c.data.length; i++) {
        const j = start + i
        if (j >= 0 && j < samples.length) samples[j] = c.data[i]
      }
    }
    let inputPeak = 0
    for (let i = 0; i < samples.length; i++) inputPeak = Math.max(inputPeak, Math.abs(samples[i]))

    return {
      samples,
      sampleRate: sr,
      beatTimeSec: plan.sectionStart - lead,
      latencySec: latency,
      inputPeak,
      peaks: computePeaks([samples], 400),
      durationSec: samples.length / sr,
      sectionStart: plan.sectionStart,
      sectionEnd: plan.sectionEnd,
    }
  }
}
