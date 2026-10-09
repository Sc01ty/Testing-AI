import { describe, expect, it } from 'vitest'
import { atMaxLength, barBeatLabel, endLabel, dragWindow, fitWindow, lengthLabel, type SectionZone } from './sectionWindow'
import { newSession, roundSection, roundSections, sectionFor, setRoundSection } from './sessionLogic'
import type { BeatMeta } from '../domain/types'

// 120 BPM: a beat is 0.5 s, a bar is 2 s
const zone: SectionZone = { min: 1, max: 9, maxLen: 4, minLen: 2, step: 0.5, origin: 1 }

describe('section window', () => {
  it('locks END at two bars instead of stretching', () => {
    const { window, blocked } = dragWindow(zone, { start: 1, end: 5 }, 'end', 8.2)
    expect(window).toEqual({ start: 1, end: 5 })
    expect(blocked).toBe(true)
  })

  it('trims inward on the beat grid', () => {
    const { window } = dragWindow(zone, { start: 1, end: 5 }, 'end', 4.1)
    expect(window).toEqual({ start: 1, end: 4 })
    const s = dragWindow(zone, window, 'start', 1.6)
    expect(s.window).toEqual({ start: 1.5, end: 4 })
  })

  it('never goes shorter than a bar', () => {
    expect(dragWindow(zone, { start: 1, end: 5 }, 'start', 4.9).window).toEqual({ start: 3, end: 5 })
  })

  it('START cannot be pulled out to make the window longer than the max', () => {
    expect(dragWindow(zone, { start: 3, end: 7 }, 'start', 1).window).toEqual({ start: 3, end: 7 })
  })

  it('slides within the zone and stops at its edges', () => {
    expect(dragWindow(zone, { start: 1, end: 5 }, 'move', 3).window).toEqual({ start: 3, end: 7 })
    const r = dragWindow(zone, { start: 1, end: 5 }, 'move', 7)
    expect(r.window).toEqual({ start: 5, end: 9 })
    expect(r.blocked).toBe(true)
    expect(dragWindow(zone, { start: 3, end: 7 }, 'move', -4).window).toEqual({ start: 1, end: 5 })
  })

  it('fits a stale window back into its zone', () => {
    expect(fitWindow(zone, { start: 8, end: 14 }, { start: 1, end: 5 })).toEqual({ start: 5, end: 9 })
    expect(fitWindow(zone, null, { start: 1, end: 5 })).toEqual({ start: 1, end: 5 })
  })

  it('labels', () => {
    expect(atMaxLength(zone, { start: 1, end: 5 })).toBe(true)
    expect(barBeatLabel(1, 1, 0.5, 4)).toBe('bar 1')
    expect(barBeatLabel(4, 1, 0.5, 4)).toBe('bar 2 · beat 3')
    expect(endLabel(5, 1, 0.5, 4)).toBe('end of bar 2')
    expect(endLabel(4.5, 1, 0.5, 4)).toBe('bar 2 · beat 4')
    expect(lengthLabel({ start: 0, end: 4 }, 2)).toBe('2 bars')
    expect(lengthLabel({ start: 0, end: 3.5 }, 2)).toBe('1¾ bars')
    expect(lengthLabel({ start: 0, end: 2 }, 2)).toBe('1 bar')
  })
})

describe('round sections', () => {
  const beat = { id: 'b', name: 'B', bpm: 120, introOffset: 1, durationSec: 1 + 40 * 2, beatsPerBar: 4 } as BeatMeta

  it('rounds without a stored window sit where they always did', () => {
    const s = newSession({ trackName: 't', beat, topic: 'money', length: 16 })
    s.rounds.push({ ...s.rounds[0], index: 1 }, { ...s.rounds[0], index: 2 })
    const all = roundSections(s, beat)
    for (let i = 0; i < 3; i++) {
      const old = sectionFor(beat, i)
      expect([all[i].start, all[i].end]).toEqual([old.start, old.end])
    }
    // zone: from the previous END, four bars of room, window max two bars
    expect(all[1].zone.min).toBe(5)
    expect(all[1].zone.max).toBe(13)
    expect(all[1].zone.maxLen).toBe(4)
  })

  it('a moved window pushes the next round along', () => {
    let s = newSession({ trackName: 't', beat, topic: 'money', length: 16 })
    s = setRoundSection(s, 0, { start: 3, end: 6.5 })
    s.rounds.push({ ...s.rounds[0], index: 1, section: undefined })
    const r0 = roundSection(s, beat, 0)
    const r1 = roundSection(s, beat, 1)
    expect([r0.start, r0.end]).toEqual([3, 6.5])
    expect(r1.zone.min).toBe(6.5)
    // next round defaults to the next bar line after the previous END
    expect([r1.start, r1.end]).toEqual([7, 11])
  })

  it('the zone leaves room for the rounds still to come', () => {
    const tight = { ...beat, durationSec: 1 + 16 * 2 } // exactly 16 bars
    const s = newSession({ trackName: 't', beat: tight, topic: 'money', length: 16 })
    const r0 = roundSection(s, tight, 0)
    expect(r0.zone.max).toBe(r0.end) // no slack: trim only
  })
})
