import { describe, it, expect } from 'vitest'
import { newDuo, activeTurns, basicDuoChallenge, scoreDuoTurn } from './session'
import { masterRegions } from './audio'
import type { BeatMeta } from '../domain/types'
const beat = {
  id: 'b',
  name: 'Test',
  bpm: 120,
  introOffset: 1,
  beatsPerBar: 4,
  durationSec: 80,
} as BeatMeta
const create = (
  style: 'standard' | 'quick' = 'standard',
  boundary: 'clean' | 'overlap' = 'clean',
) =>
  newDuo({
    players: ['Alfie', 'Mate'],
    trackName: 'Duo',
    beat,
    topic: 'money',
    length: 16,
    style,
    boundary,
  })
describe('musical duo plan', () => {
  it('uses immutable four-bar alternating slots and a shared beat origin', () => {
    const s = create()
    expect(s.turns.map((t) => [t.player, t.barStart, t.barEnd, t.start, t.end])).toEqual([
      [0, 0, 4, 1, 9],
      [1, 4, 8, 9, 17],
      [0, 8, 12, 17, 25],
      [1, 12, 16, 25, 33],
    ])
  })
  it('quick trade has two-bar slots, and overlaps activate both players for one beat', () => {
    const s = create('quick', 'overlap')
    expect(s.turns).toHaveLength(8)
    expect(activeTurns(s, 4.75).map((t) => t.player)).toEqual([0, 1])
    expect(activeTurns(s, 5).map((t) => t.player)).toEqual([1])
  })
  it('replacing a slot leaves every later slot in place and does not duplicate master overlap', () => {
    const s = create('standard', 'overlap')
    const before = s.turns.map((t) => [t.start, t.end])
    s.turns[1].take = { id: 'retake' } as never
    expect(masterRegions(s)).toEqual([
      { start: 1, end: 8.5 },
      { start: 17, end: 33.35 },
    ])
    expect(s.turns.map((t) => [t.start, t.end])).toEqual(before)
  })
  it('the basic director refers to the other player and their actual words', () => {
    const s = create()
    s.turns[0].lyrics = [
      'I bought my mum a house',
      'Now she watches roses grow',
      'Money paid the rent',
      'Finally she can rest',
    ]
    const c = basicDuoChallenge(s, 1)
    expect(c.prompt).toContain('Alfie')
    expect(c.prompt).toContain('rest')
  })
  it('never attributes individual performance through a shared-mic overlap', () => {
    const s = create('standard', 'overlap')
    const t = s.turns[0]
    t.lyrics = [
      'I paid the rent today',
      'The bills all went away',
      'My mum can finally sleep',
      'A promise I will keep',
    ]
    const r = scoreDuoTurn(s, t, {
      samples: new Float32Array(8000),
      sampleRate: 8000,
      startTime: 1,
    })
    expect(r.performanceScore).toBeNull()
    expect(r.feedback.join(' ')).toContain('not attributed')
  })
})
