import { settingsStore } from '../settings/settings'
import { audio } from './AudioEngine'

/**
 * Quiet metronome that follows the beat grid.
 *
 * Clicks are scheduled on the AudioContext clock a little ahead of time
 * (look-ahead scheduler), so they stay locked to the beat however long it
 * runs or loops. They go to their own bus — never into a mix or an export —
 * through a gate that follows the on/off setting live.
 */
export interface ClickGrid {
  /** Timeline second of any downbeat (bar 1 beat 1). */
  origin: number
  secondsPerBeat: number
  beatsPerBar: number
}

export interface ClickRun {
  /** Context time at which timeline second `from` plays. */
  at: number
  from: number
  to: number
  /** If set, [from, to) repeats (looped preview)… */
  loop?: boolean
  /** …until this context time (set when looping is switched off mid-play). */
  endAt?: number
  grid: ClickGrid
}

/** A short, soft tick that sits under the beat: filtered noise + a pitched body. */
export function playClick(ctx: BaseAudioContext, out: AudioNode, when: number, accent: boolean, level = 1) {
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(accent ? 1900 : 1400, when)
  body.frequency.exponentialRampToValueAtTime(accent ? 1200 : 900, when + 0.03)
  const g = ctx.createGain()
  const peak = (accent ? 0.5 : 0.32) * level
  g.gain.value = 0.0001
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(peak, when + 0.0015)
  g.gain.exponentialRampToValueAtTime(0.0001, when + (accent ? 0.06 : 0.045))
  body.connect(g).connect(out)
  body.start(when)
  body.stop(when + 0.08)
  return body
}

const LOOKAHEAD = 0.15
const TICK_MS = 25

export class ClickTrack {
  private timer = 0
  private gate: GainNode | null = null
  private nodes: AudioScheduledSourceNode[] = []
  private unsub: (() => void) | null = null
  private run: ClickRun | null = null
  private scheduledUntil = 0

  /** Start following a playback run. The gate follows Settings → Metronome unless `force` is given. */
  start(run: ClickRun, force?: boolean) {
    this.stop()
    const ctx = audio.context
    const bus = audio.clickOutput
    if (!ctx || !bus) return
    this.run = run
    this.gate = ctx.createGain()
    this.gate.connect(bus)
    const apply = () => {
      const on = force ?? settingsStore.get().metronome
      this.gate?.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.01)
    }
    this.gate.gain.value = (force ?? settingsStore.get().metronome) ? 1 : 0
    if (force === undefined) this.unsub = settingsStore.subscribe(apply)
    this.scheduledUntil = Math.max(run.at, ctx.currentTime)
    const tick = () => {
      this.schedule(ctx)
      this.timer = window.setTimeout(tick, TICK_MS)
    }
    tick()
  }

  stop() {
    clearTimeout(this.timer)
    this.unsub?.()
    this.unsub = null
    for (const n of this.nodes) {
      try {
        n.stop()
      } catch {
        /* not started */
      }
    }
    this.nodes = []
    const gate = this.gate
    this.gate = null
    if (gate) window.setTimeout(() => gate.disconnect(), 100)
    this.run = null
  }

  /** Switch looping on/off while running (off = finish the current pass). */
  setLoop(on: boolean, endAt?: number) {
    if (!this.run) return
    this.run.loop = true
    this.run.endAt = on ? undefined : endAt
  }

  private schedule(ctx: BaseAudioContext) {
    const run = this.run
    const gate = this.gate
    if (!run || !gate) return
    const until = ctx.currentTime + LOOKAHEAD
    if (until <= this.scheduledUntil) return
    const len = run.to - run.from
    const { origin, secondsPerBeat: spb, beatsPerBar } = run.grid
    // which pass through [from, to) the window starts in
    let pass = run.loop && len > 0 ? Math.max(0, Math.floor((this.scheduledUntil - run.at) / len)) : 0
    for (;;) {
      const passAt = run.at + pass * len
      if (passAt > until) break
      // beats inside [from, to) of this pass
      const k0 = Math.ceil((run.from - origin) / spb - 1e-6)
      for (let k = k0; ; k++) {
        const tl = origin + k * spb // timeline second of this beat
        if (tl >= run.to - 1e-6) break
        const when = passAt + (tl - run.from)
        if (when < this.scheduledUntil || when < ctx.currentTime) continue
        if (when >= until || (run.endAt !== undefined && when >= run.endAt - 1e-4)) break
        const accent = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0
        const n = playClick(ctx, gate, when, accent)
        this.nodes.push(n)
        n.onended = () => {
          const i = this.nodes.indexOf(n)
          if (i >= 0) this.nodes.splice(i, 1)
        }
      }
      if (!run.loop) break
      pass++
    }
    this.scheduledUntil = until
  }
}

/** Every beat between [from, to) of a beat file, as context times (for one-shot schedules). */
export function beatTimes(grid: ClickGrid, from: number, to: number) {
  const out: { t: number; accent: boolean }[] = []
  const k0 = Math.ceil((from - grid.origin) / grid.secondsPerBeat - 1e-6)
  for (let k = k0; ; k++) {
    const t = grid.origin + k * grid.secondsPerBeat
    if (t >= to - 1e-6) break
    out.push({ t, accent: ((k % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0 })
  }
  return out
}
