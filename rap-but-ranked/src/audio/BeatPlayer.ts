import { useSyncExternalStore } from 'react'
import { audio } from './AudioEngine'
import { decodeAudio } from './analysis/analyseBeat'

/**
 * The one place beats are played. Starting any beat stops whatever was
 * playing, so there can never be two at once. Stage 3 builds its transport
 * on top of `play(beat, { from, to })`.
 */
export interface PlayableBeat {
  id: string
  /** Either the stored file… */
  blob?: Blob
  /** …or an already-decoded buffer (e.g. straight after analysis)… */
  buffer?: AudioBuffer
  /** …or a way to fetch the file on demand (saved beats). */
  getBlob?: () => Promise<Blob | null>
}

export interface BeatPlayerState {
  beatId: string | null
  playing: boolean
  loading: boolean
  /** Length of the loaded beat in seconds (0 until loaded). */
  duration: number
  error: string | null
}

type Listener = () => void

const IDLE: BeatPlayerState = { beatId: null, playing: false, loading: false, duration: 0, error: null }
const MAX_CACHED = 4

class BeatPlayer {
  private state: BeatPlayerState = IDLE
  private listeners = new Set<Listener>()
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private source: AudioBufferSourceNode | null = null
  private startedAtCtx = 0
  private startedFrom = 0
  private stopAt: number | null = null
  private pausedAt = 0
  private token = 0

  getState = () => this.state
  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Current position (seconds) of the given beat, or null if it isn't the loaded one. */
  position(beatId?: string): number | null {
    if (beatId && beatId !== this.state.beatId) return null
    const ctx = audio.context
    if (this.state.playing && ctx) {
      const p = this.startedFrom + (ctx.currentTime - this.startedAtCtx)
      return Math.min(p, this.stopAt ?? this.state.duration)
    }
    return this.state.beatId ? this.pausedAt : null
  }

  isPlaying(beatId: string) {
    return this.state.playing && this.state.beatId === beatId
  }

  /** Decode + cache a beat so the first play is instant. */
  preload(beat: PlayableBeat) {
    return this.load(beat).catch(() => undefined)
  }

  async play(beat: PlayableBeat, opts: { from?: number; to?: number } = {}) {
    audio.unlock()
    const token = ++this.token
    const sameBeat = this.state.beatId === beat.id
    this.stopSource()
    this.set({ beatId: beat.id, loading: true, playing: false, error: null, duration: sameBeat ? this.state.duration : 0 })
    let buffer: AudioBuffer
    try {
      buffer = await this.load(beat)
    } catch (e) {
      if (token === this.token) this.set({ loading: false, error: e instanceof Error ? e.message : 'Could not play this beat.' })
      return
    }
    if (token !== this.token) return // another play/stop happened while decoding
    const ctx = audio.context
    const out = audio.beatOutput
    if (!ctx || !out) {
      this.set({ loading: false, error: 'Audio is not available yet — click anywhere and try again.' })
      return
    }
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)
    if (token !== this.token) return

    const duration = buffer.duration
    let from = opts.from ?? (sameBeat ? this.pausedAt : 0)
    if (from >= duration - 0.05 || from < 0) from = 0
    const to = opts.to !== undefined ? Math.min(opts.to, duration) : null

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(out)
    src.onended = () => {
      if (this.source !== src) return // stopped on purpose
      this.source = null
      this.pausedAt = to ?? 0
      this.set({ playing: false })
      audio.setMusicDucked(false)
    }
    src.start(0, from, to !== null ? Math.max(0.01, to - from) : undefined)
    this.source = src
    this.startedAtCtx = ctx.currentTime
    this.startedFrom = from
    this.stopAt = to
    this.pausedAt = from
    audio.setMusicDucked(true)
    this.set({ loading: false, playing: true, duration })
  }

  pause() {
    if (!this.state.playing) return
    this.pausedAt = this.position() ?? 0
    this.token++
    this.stopSource()
    this.set({ playing: false })
    audio.setMusicDucked(false)
  }

  toggle(beat: PlayableBeat) {
    if (this.isPlaying(beat.id)) this.pause()
    else void this.play(beat)
  }

  /** Jump to a position; keeps playing if it was playing. */
  seek(beat: PlayableBeat, seconds: number) {
    if (this.isPlaying(beat.id)) void this.play(beat, { from: seconds })
    else {
      if (this.state.beatId !== beat.id) {
        this.token++
        this.stopSource()
        this.set({ beatId: beat.id, playing: false, loading: false, error: null })
        void this.load(beat).then((b) => this.state.beatId === beat.id && this.set({ duration: b.duration }))
      }
      this.pausedAt = Math.max(0, seconds)
      this.emit()
    }
  }

  /** Stop and forget the position (e.g. leaving the Beats screen). */
  stop() {
    this.token++
    const wasPlaying = this.state.playing
    this.stopSource()
    this.pausedAt = 0
    this.set(IDLE)
    if (wasPlaying) audio.setMusicDucked(false)
  }

  /** Drop a cached decode (beat deleted, or a draft discarded). */
  forget(beatId: string) {
    if (this.state.beatId === beatId) this.stop()
    this.buffers.delete(beatId)
  }

  private load(beat: PlayableBeat): Promise<AudioBuffer> {
    let p = this.buffers.get(beat.id)
    if (!p) {
      if (beat.buffer) p = Promise.resolve(beat.buffer)
      else if (beat.blob) p = decodeAudio(beat.blob)
      else if (beat.getBlob)
        p = beat.getBlob().then((blob) => {
          if (!blob) throw new Error("This beat's audio is missing from storage.")
          return decodeAudio(blob)
        })
      else return Promise.reject(new Error('This beat has no audio.'))
      p.catch(() => this.buffers.delete(beat.id))
      this.buffers.set(beat.id, p)
      // keep memory bounded: decoded audio is big (~10 MB per minute)
      while (this.buffers.size > MAX_CACHED) {
        const oldest = [...this.buffers.keys()].find((k) => k !== beat.id && k !== this.state.beatId)
        if (!oldest) break
        this.buffers.delete(oldest)
      }
    }
    return p
  }

  private stopSource() {
    const src = this.source
    this.source = null
    if (src) {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
      src.disconnect()
    }
  }

  private set(patch: Partial<BeatPlayerState>) {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }
}

export const beatPlayer = new BeatPlayer()

export function useBeatPlayer(): BeatPlayerState {
  return useSyncExternalStore(beatPlayer.subscribe, beatPlayer.getState, beatPlayer.getState)
}
