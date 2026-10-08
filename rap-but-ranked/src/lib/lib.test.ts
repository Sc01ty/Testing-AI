import { describe, expect, it } from 'vitest'
import { formatAdded, formatBpm, formatTime } from './format'
import { createTapTempo } from './tapTempo'

describe('tap tempo', () => {
  it('needs 4 taps, then averages', () => {
    const t = createTapTempo()
    expect(t.tap(0).bpm).toBeNull()
    t.tap(500)
    t.tap(1000)
    expect(t.tap(1500).bpm).toBe(120)
    expect(t.tap(2000).bpm).toBe(120)
  })
  it('resets after a long pause', () => {
    const t = createTapTempo()
    ;[0, 600, 1200, 1800].forEach((ms) => t.tap(ms))
    expect(t.tap(9000)).toEqual({ bpm: null, count: 1 })
  })
})

describe('format', () => {
  it('formats times and bpm', () => {
    expect(formatTime(151.4)).toBe('2:31')
    expect(formatTime(5)).toBe('0:05')
    expect(formatBpm(92)).toBe('92')
    expect(formatBpm(91.5)).toBe('91.5')
  })
  it('says today / yesterday', () => {
    const now = new Date(2026, 9, 8, 15).getTime()
    expect(formatAdded(now - 3_600_000, now)).toBe('Today')
    expect(formatAdded(now - 86_400_000, now)).toBe('Yesterday')
  })
})
