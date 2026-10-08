import { useSyncExternalStore } from 'react'
import { audio } from './AudioEngine'
import { scheduleMix, type VocalClip } from './mix'

/**
 * Plays a beat range with vocal clips laid over it (take playback, full
 * song). Like BeatPlayer it is a singleton, and the two stop each other,
 * so only one thing ever plays.
 */
export interface TrackPlayerState {
  id: string | null
  playing: boolean
  from: number
  to: number
}

type Listener = () => void
const IDLE: TrackPlayerState = { id: null, playing: false, from: 0, to: 0 }

class TrackPlayer {
  private state: TrackPlayerState = IDLE
  private listeners = new Set<Listener>()
  private sources: AudioScheduledSourceNode[] = []
  private startedAt = 0
  private endTimer = 0
  /** Set by BeatPlayer so starting one stops the other. */
  onStart: (() => void) | null = null

  getState = () => this.state
  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Beat-file second currently playing, or null. */
  position(id?: string): number | null {
    const ctx = audio.context
    if (!this.state.playing || !ctx || (id && id !== this.state.id)) return null
    return Math.min(this.state.to, this.state.from + Math.max(0, ctx.currentTime - this.startedAt))
  }

  async play(id: string, beat: AudioBuffer, clips: VocalClip[], from: number, to: number) {
    audio.unlock()
    this.stop()
    this.onStart?.()
    const ctx = audio.context
    const out = audio.beatOutput
    if (!ctx || !out) return
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)
    const at = ctx.currentTime + 0.05
    this.sources = scheduleMix(ctx, out, beat, clips, from, to, at)
    this.startedAt = at
    audio.setMusicDucked(true)
    this.set({ id, playing: true, from, to })
    this.endTimer = window.setTimeout(() => this.stop(), (to - from) * 1000 + 120)
  }

  stop() {
    clearTimeout(this.endTimer)
    const wasPlaying = this.state.playing
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* not started yet / already stopped */
      }
      s.disconnect()
    }
    this.sources = []
    if (wasPlaying) {
      this.set(IDLE)
      audio.setMusicDucked(false)
    }
  }

  private set(next: TrackPlayerState) {
    this.state = next
    this.listeners.forEach((fn) => fn())
  }
}

export const trackPlayer = new TrackPlayer()

export function useTrackPlayer() {
  return useSyncExternalStore(trackPlayer.subscribe, trackPlayer.getState, trackPlayer.getState)
}
