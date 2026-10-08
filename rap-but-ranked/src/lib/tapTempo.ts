/**
 * Tap along to get a BPM. Taps more than RESET_MS apart start a new
 * measurement; the result averages the most recent intervals.
 */
const RESET_MS = 2000
const KEEP = 9

export function createTapTempo() {
  let taps: number[] = []
  return {
    tap(now = performance.now()): { bpm: number | null; count: number } {
      if (taps.length && now - taps[taps.length - 1] > RESET_MS) taps = []
      taps.push(now)
      if (taps.length > KEEP) taps = taps.slice(-KEEP)
      if (taps.length < 4) return { bpm: null, count: taps.length }
      const span = taps[taps.length - 1] - taps[0]
      const bpm = (60_000 * (taps.length - 1)) / span
      return { bpm: Math.round(bpm * 10) / 10, count: taps.length }
    },
    reset() {
      taps = []
    },
  }
}
