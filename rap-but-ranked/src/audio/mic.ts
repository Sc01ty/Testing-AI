import { useSyncExternalStore } from 'react'
import { settingsStore } from '../settings/settings'
import { audio } from './AudioEngine'

/**
 * Microphone access. Asks for permission only when the user first records,
 * keeps the stream open for the session, and exposes a live input level.
 * Processing (echo cancel, noise suppression, auto gain) is OFF: it smears
 * timing and pumps the level, which is the opposite of what a rap take needs.
 */
export type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error'

export interface MicState {
  status: MicStatus
  message: string | null
  deviceLabel: string | null
}

type Listener = () => void

class Mic {
  private state: MicState = { status: 'idle', message: null, deviceLabel: null }
  private listeners = new Set<Listener>()
  private stream: MediaStream | null = null
  private node: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private pending: Promise<boolean> | null = null
  private levelBuf: Float32Array<ArrayBuffer> | null = null

  getState = () => this.state
  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  get source(): MediaStreamAudioSourceNode | null {
    return this.node
  }
  get mediaStream(): MediaStream | null { return this.stream }

  /** Must be called from a click (it may show the browser's permission prompt). */
  ensure(): Promise<boolean> {
    if (this.state.status === 'ready' && this.stream?.active && this.node) return Promise.resolve(true)
    if (this.pending) return this.pending
    this.pending = this.open().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  private async open(): Promise<boolean> {
    audio.unlock()
    const ctx = audio.context
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({
        status: 'unavailable',
        message: window.isSecureContext
          ? "This browser doesn't support microphone recording."
          : 'Microphone access needs a secure page — open the app on http://localhost (not a network IP).',
      })
      return false
    }
    if (!ctx) {
      this.set({ status: 'error', message: 'Audio is not ready yet — click anywhere and try again.' })
      return false
    }
    this.set({ status: 'requesting', message: null })
    try {
      const deviceId = settingsStore.get().micDeviceId
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      this.release()
      this.stream = stream
      this.node = ctx.createMediaStreamSource(stream)
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.node.connect(this.analyser)
      const track = stream.getAudioTracks()[0]
      track.addEventListener('ended', () => this.set({ status: 'error', message: 'The microphone was disconnected.' }))
      this.set({ status: 'ready', message: null, deviceLabel: track.label || 'Microphone' })
      return true
    } catch (e) {
      const name = (e as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError')
        this.set({ status: 'denied', message: 'Microphone blocked. Click the 🔒 / mic icon in the address bar, allow the microphone, then try again.' })
      else if (name === 'NotFoundError' || name === 'OverconstrainedError')
        this.set({ status: 'unavailable', message: 'No microphone found. Plug one in (or pick another in Settings) and try again.' })
      else if (name === 'NotReadableError') this.set({ status: 'error', message: 'The microphone is busy in another app. Close it and try again.' })
      else this.set({ status: 'error', message: 'Could not open the microphone.' })
      return false
    }
  }

  /** Seconds between sound hitting the mic and it reaching the audio graph (estimate). */
  inputLatency(): number {
    const s = this.stream?.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined
    const v = s?.latency
    return typeof v === 'number' && v >= 0 && v < 0.5 ? v : 0.01
  }

  /** Current input level 0..1 (RMS, roughly perceptual). */
  level(): number {
    const a = this.analyser
    if (!a) return 0
    if (!this.levelBuf || this.levelBuf.length !== a.fftSize) this.levelBuf = new Float32Array(a.fftSize)
    a.getFloatTimeDomainData(this.levelBuf)
    let sum = 0
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] * this.levelBuf[i]
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4)
  }

  release() {
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.node = null
    this.analyser = null
    this.stream = null
    if (this.state.status === 'ready') this.set({ status: 'idle', message: null })
  }

  private set(patch: Partial<MicState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }
}

export const mic = new Mic()

export function useMic() {
  return useSyncExternalStore(mic.subscribe, mic.getState, mic.getState)
}

/** Total round-trip delay to compensate: what you hear is late, and what you sing arrives late. */
export function estimateLatency(ctx: AudioContext): number {
  const out = (ctx.outputLatency || 0) + (ctx.baseLatency || 0)
  const manual = settingsStore.get().latencyOffsetMs / 1000
  return Math.max(0, out + mic.inputLatency() + manual)
}
