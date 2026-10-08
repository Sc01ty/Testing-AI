import { describe, expect, it } from 'vitest'
import type { BeatMeta } from '../domain/types'
import { advance, currentRound, lengthsFor, newSession, runningScore, sectionFor, totalRounds } from './sessionLogic'

const beat = { id: 'b', name: 'Beat', bpm: 90, introOffset: 2, durationSec: 120, beatsPerBar: 4 } as BeatMeta

describe('session logic', () => {
  it('creates a session with the first challenge on the topic', () => {
    const s = newSession({ trackName: ' ', beat, topic: 'money', length: 8 })
    expect(s.trackName).toBe('Untitled track')
    expect(totalRounds(s)).toBe(4)
    expect(currentRound(s)!.challenge.prompt).toBe('Write 2 bars about money.')
  })

  it('maps rounds to exact bar ranges after the intro', () => {
    const r0 = sectionFor(beat, 0)
    const r2 = sectionFor(beat, 2)
    expect(r0.start).toBeCloseTo(2)
    expect(r0.end).toBeCloseTo(2 + 2 * (240 / 90))
    expect(r2.start).toBeCloseTo(2 + 4 * (240 / 90))
  })

  it('only offers lengths the beat can hold', () => {
    expect(lengthsFor(beat)).toEqual([8, 16, 32].filter((n) => n <= Math.floor(118 / (240 / 90))))
    expect(lengthsFor({ ...beat, durationSec: 25 })).toEqual([8])
  })

  it('advances round by round and completes', () => {
    let s = newSession({ trackName: 'T', beat, topic: 'money', length: 8 })
    const result = (score: number) => ({ categories: [], score, rank: 'B' as const, feedback: [], analysis: '', scoredAt: 0 })
    for (let i = 0; i < 4; i++) {
      const next = i < 3 ? { prompt: `next ${i}`, focus: [], storyBeat: '', source: 'basic' as const } : null
      s = advance(s, i, result(60 + i * 10), { analysis: '', next, storyDirection: 'x' })
    }
    expect(s.status).toBe('complete')
    expect(s.rounds).toHaveLength(4)
    expect(currentRound(s)).toBeNull()
    expect(runningScore(s)).toEqual({ score: 75, rank: 'B' })
  })
})
