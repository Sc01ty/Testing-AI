import { describe, expect, it } from 'vitest'
import { barStart, barTimes, beatTimes, gridFor, tidyBpm } from './beatGrid'

describe('beat grid', () => {
  it('derives seconds per beat / bar in 4/4', () => {
    const g = gridFor({ bpm: 120, introOffset: 0, durationSec: 60 })
    expect(g.secondsPerBeat).toBeCloseTo(0.5)
    expect(g.secondsPerBar).toBeCloseTo(2)
    expect(g.barCount).toBe(30)
  })

  it('respects the intro offset', () => {
    const g = gridFor({ bpm: 90, introOffset: 4, durationSec: 100 })
    // 96s usable / (8/3 s per bar) = 36 bars
    expect(g.barCount).toBe(36)
    expect(barStart(g, 4, 2)).toBeCloseTo(4 + 2 * (8 / 3))
  })

  it('lists bar and beat times', () => {
    const bars = barTimes({ bpm: 120, introOffset: 1, durationSec: 9 })
    expect(bars.map((b) => b.time)).toEqual([1, 3, 5, 7, 9])
    const withIntro = barTimes({ bpm: 120, introOffset: 2.5, durationSec: 6 }, { includeIntro: true })
    expect(withIntro[0]).toEqual({ index: -1, time: 0.5 })
    expect(beatTimes({ bpm: 120, introOffset: 0, durationSec: 2 })).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('tidies BPM to integers when close', () => {
    expect(tidyBpm(91.96)).toBe(92)
    expect(tidyBpm(91.7)).toBe(91.7)
  })
})
