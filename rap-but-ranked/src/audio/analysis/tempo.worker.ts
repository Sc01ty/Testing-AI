import { detectTempo } from './tempo'

// Runs off the main thread so the "Analysing…" animation stays smooth.
self.onmessage = (e: MessageEvent<{ mono: Float32Array; sampleRate: number }>) => {
  const { mono, sampleRate } = e.data
  try {
    self.postMessage({ ok: true, result: detectTempo(mono, sampleRate) })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
