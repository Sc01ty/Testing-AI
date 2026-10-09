import { useSyncExternalStore } from 'react'
import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { trackPlayer } from '../audio/trackPlayer'
import { social } from './api'

/**
 * One player for every published track (Feed, Leaderboards, profiles). A
 * listen counts once you've heard 8 seconds, or half of a short track; the
 * server then counts it once per listener per day.
 */
export interface FeedPlayerState {
  id: string | null
  playing: boolean
  time: number
  duration: number
  loading: boolean
}

let state: FeedPlayerState = { id: null, playing: false, time: 0, duration: 0, loading: false }
const listeners = new Set<() => void>()
const counted = new Set<string>()
const playCountListeners = new Set<(id: string, plays: number) => void>()
let el: HTMLAudioElement | null = null

function set(next: Partial<FeedPlayerState>) {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn())
}

function element() {
  if (el) return el
  el = new Audio()
  el.preload = 'auto'
  el.addEventListener('timeupdate', () => {
    const a = el!
    set({ time: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : state.duration })
    const id = state.id
    if (id && !counted.has(id) && (a.currentTime >= 8 || (a.duration > 0 && a.currentTime >= a.duration / 2))) {
      counted.add(id)
      void social
        .play(id)
        .then((r) => playCountListeners.forEach((fn) => fn(id, r.plays)))
        .catch(() => counted.delete(id))
    }
  })
  el.addEventListener('playing', () => set({ playing: true, loading: false }))
  el.addEventListener('waiting', () => set({ loading: true }))
  el.addEventListener('pause', () => {
    set({ playing: false })
    audio.setMusicDucked(false)
  })
  el.addEventListener('ended', () => {
    set({ playing: false, time: 0 })
    audio.setMusicDucked(false)
  })
  el.addEventListener('error', () => set({ playing: false, loading: false }))
  return el
}

export const feedPlayer = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  toggle(id: string, duration = 0) {
    const a = element()
    if (state.id === id) {
      if (a.paused) void this.resume()
      else a.pause()
      return
    }
    beatPlayer.stop()
    trackPlayer.stop()
    a.src = social.audioUrl(id)
    set({ id, playing: false, time: 0, duration, loading: true })
    void this.resume()
  },
  async resume() {
    const a = element()
    audio.unlock()
    audio.setMusicDucked(true)
    try {
      await a.play()
    } catch {
      set({ playing: false, loading: false })
      audio.setMusicDucked(false)
    }
  },
  seek(t: number) {
    const a = element()
    if (Number.isFinite(t)) a.currentTime = Math.max(0, t)
  },
  stop() {
    if (!el) return
    el.pause()
    set({ id: null, playing: false, time: 0 })
  },
  onPlayCounted(fn: (id: string, plays: number) => void) {
    playCountListeners.add(fn)
    return () => {
      playCountListeners.delete(fn)
    }
  },
}

export function useFeedPlayer() {
  return useSyncExternalStore(feedPlayer.subscribe, feedPlayer.get, feedPlayer.get)
}
