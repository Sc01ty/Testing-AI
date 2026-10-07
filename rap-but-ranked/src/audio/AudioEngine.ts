import { settingsStore, type Settings } from '../settings/settings'
import { MUSIC_TRACKS, UI_SOUNDS, perceptualGain, type MusicTrackId, type UiSoundId } from './sounds'

/**
 * One AudioContext for the whole app, with separate buses:
 *
 *   ui bus ───────────────┐
 *   music ─ lowpass ─ bus ┼─ master ─ destination
 *   (later: beat bus, vocal bus, monitor bus)
 *
 * Nothing is created or downloaded until `unlock()` runs inside a user
 * gesture, which is what browsers require before audio may start. Until
 * then every call is a silent no-op, so components never need to care.
 */
export type MusicMood = 'menu' | 'muffled'

type Listener = () => void

class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private uiBus!: GainNode
  private musicBus!: GainNode
  private musicFilter!: BiquadFilterNode
  private musicMood!: GainNode
  private music: { id: MusicTrackId; el: HTMLAudioElement; gain: GainNode } | null = null
  private wantedMusic: MusicTrackId | null = null
  private mood: MusicMood = 'menu'
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private lastPlayed = new Map<UiSoundId, number>()
  private listeners = new Set<Listener>()
  private settings: Settings = settingsStore.get()

  constructor() {
    settingsStore.subscribe((s) => {
      const musicToggled = s.menuMusic !== this.settings.menuMusic
      this.settings = s
      this.applyLevels()
      if (musicToggled) this.syncMusic()
    })
  }

  get isUnlocked() {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Call from a click/keydown/touch handler. Safe to call repeatedly. */
  unlock() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      this.ctx = ctx
      this.master = ctx.createGain()
      this.uiBus = ctx.createGain()
      this.musicBus = ctx.createGain()
      this.musicMood = ctx.createGain()
      this.musicFilter = ctx.createBiquadFilter()
      this.musicFilter.type = 'lowpass'
      this.musicFilter.frequency.value = 20000
      this.musicFilter.Q.value = 0.5
      this.uiBus.connect(this.master)
      this.musicFilter.connect(this.musicMood).connect(this.musicBus).connect(this.master)
      this.master.connect(ctx.destination)
      this.applyLevels(true)
      ctx.addEventListener('statechange', () => this.emit())
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.emit())
    this.syncMusic()
    this.emit()
  }

  play(id: UiSoundId) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || this.settings.muted) return
    const def = UI_SOUNDS[id]
    const now = performance.now()
    if (def.minIntervalMs && now - (this.lastPlayed.get(id) ?? -Infinity) < def.minIntervalMs) return
    this.lastPlayed.set(id, now)

    const src = def.source
    const out = ctx.createGain()
    out.gain.value = src.gain ?? 1
    out.connect(this.uiBus)
    if (src.kind === 'synth') {
      src.recipe(ctx, out, ctx.currentTime + 0.002)
      window.setTimeout(() => out.disconnect(), 2500)
    } else {
      void this.loadBuffer(src.url).then((buffer) => {
        if (!buffer) return
        const node = ctx.createBufferSource()
        node.buffer = buffer
        node.connect(out)
        node.onended = () => out.disconnect()
        node.start()
      })
    }
  }

  /** Declare which track should be playing; it starts once audio is unlocked. */
  setMusic(id: MusicTrackId | null) {
    this.wantedMusic = id
    this.syncMusic()
  }

  /** Muffle the menu theme behind sub-pages instead of cutting it. */
  setMusicMood(mood: MusicMood) {
    this.mood = mood
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.musicFilter.frequency.cancelScheduledValues(t)
    this.musicFilter.frequency.setTargetAtTime(mood === 'menu' ? 20000 : 650, t, 0.18)
    this.musicMood.gain.setTargetAtTime(mood === 'menu' ? 1 : 0.55, t, 0.2)
  }

  private syncMusic() {
    const ctx = this.ctx
    if (!ctx) return
    const want = this.settings.menuMusic ? this.wantedMusic : null
    if (this.music && this.music.id !== want) this.fadeOutMusic()
    if (want && !this.music) this.startMusic(want)
  }

  private startMusic(id: MusicTrackId) {
    const ctx = this.ctx!
    const track = MUSIC_TRACKS[id]
    const el = new Audio()
    el.src = import.meta.env.BASE_URL + track.url
    el.loop = true
    el.preload = 'auto'
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    ctx.createMediaElementSource(el).connect(gain).connect(this.musicFilter)
    this.music = { id, el, gain }
    void el
      .play()
      .then(() => {
        const t = ctx.currentTime
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(track.gain, t + 2.5)
      })
      .catch(() => {
        /* blocked or failed to load — stay silent, never break the UI */
        if (this.music?.el === el) this.music = null
      })
    this.setMusicMood(this.mood)
  }

  private fadeOutMusic() {
    const ctx = this.ctx!
    const m = this.music!
    this.music = null
    const t = ctx.currentTime
    m.gain.gain.cancelScheduledValues(t)
    m.gain.gain.setValueAtTime(Math.max(m.gain.gain.value, 0.0001), t)
    m.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    window.setTimeout(() => {
      m.el.pause()
      m.gain.disconnect()
    }, 700)
  }

  private applyLevels(immediate = false) {
    const ctx = this.ctx
    if (!ctx) return
    const s = this.settings
    const t = ctx.currentTime
    const set = (p: AudioParam, v: number) => (immediate ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.04))
    set(this.master.gain, s.muted ? 0 : perceptualGain(s.masterVolume))
    set(this.uiBus.gain, perceptualGain(s.uiVolume))
    set(this.musicBus.gain, perceptualGain(s.musicVolume))
  }

  private loadBuffer(url: string) {
    let p = this.buffers.get(url)
    if (!p) {
      p = fetch(import.meta.env.BASE_URL + url)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx!.decodeAudioData(data))
        .catch(() => null)
      this.buffers.set(url, p)
    }
    return p
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }
}

export const audio = new AudioEngine()
