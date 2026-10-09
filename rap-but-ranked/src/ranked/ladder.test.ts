import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { applyEvent, hotStreak, movement, parAt, rankAt, type LadderState, type RpEvent } from './ladder'

const fresh: LadderState = { rp: 0, events: 0, shield: -1 }
const ranked = (rp: number, shield = -1): LadderState => ({ rp, events: 10, shield })
const play = (score: number, bars: 8 | 16 | 32 = 16, hot = false): RpEvent => ({ id: 'x', kind: 'play', score, bars, hot })

describe('rankAt', () => {
  it('names tiers and divisions III → I', () => {
    expect(rankAt(0).label).toBe('OPEN MIC III')
    expect(rankAt(99).label).toBe('OPEN MIC III')
    expect(rankAt(100).label).toBe('OPEN MIC II')
    expect(rankAt(299).label).toBe('OPEN MIC I')
    expect(rankAt(300).label).toBe('CYPHER III')
    expect(rankAt(641).label).toBe('UNDERGROUND III')
    expect(rankAt(641).nextLabel).toBe('UNDERGROUND II')
    expect(rankAt(641).next).toBe(700)
    expect(rankAt(2099).label).toBe('ICON I')
    expect(rankAt(2099).nextLabel).toBe('HALL OF FAME')
    expect(rankAt(2100).label).toBe('HALL OF FAME')
    expect(rankAt(99999).next).toBeNull()
  })
  it('par climbs with RP', () => {
    expect(parAt(0)).toBe(45)
    expect(parAt(300)).toBe(55)
    expect(parAt(1500)).toBe(80)
    expect(parAt(2100)).toBe(90)
    expect(parAt(9000)).toBe(95)
    expect(parAt(150)).toBe(50)
  })
})

describe('applyEvent', () => {
  it('placement boosts, never loses, and stops at Breakout III', () => {
    const o = applyEvent(fresh, play(70))
    expect(o.placement).toBe(true)
    expect(o.delta).toBe(187) // (70-45)*3+10 = 85, ×2.2 (placement allows up to 150 raw)
    const weak = applyEvent(fresh, play(20))
    expect(weak.delta).toBe(0)
    let s = fresh
    for (let i = 0; i < 3; i++) s = applyEvent(s, play(100)).state
    expect(rankAt(s.rp).label).toBe('BREAKOUT III')
    s = fresh
    for (let i = 0; i < 3; i++) s = applyEvent(s, play(100, 32)).state
    expect(s.rp).toBe(999)
  })
  it('the same B track is worth less as you climb', () => {
    const low = applyEvent(ranked(100), play(70)).delta
    const high = applyEvent(ranked(1500), play(70)).delta
    expect(low).toBeGreaterThan(0)
    expect(high).toBeLessThan(0)
  })
  it('caps gains and losses, scaled by length', () => {
    expect(applyEvent(ranked(0), play(100, 16)).delta).toBe(60)
    expect(applyEvent(ranked(0), play(100, 32)).delta).toBe(96)
    expect(applyEvent(ranked(0), play(100, 8)).delta).toBe(36)
    expect(applyEvent(ranked(1800), play(0, 16)).delta).toBe(-30)
  })
  it('hot streak adds 10% to gains only', () => {
    expect(applyEvent(ranked(0), play(100, 16, true)).delta).toBe(66)
    expect(applyEvent(ranked(1800), play(40, 16, true)).delta).toBe(-30)
  })
  it('never goes below zero', () => {
    expect(applyEvent(ranked(10), play(0)).after).toBe(0)
  })
  it('a promotion shields the first loss that would demote', () => {
    const up = applyEvent(ranked(290), play(100))
    expect(rankAt(up.after).tier.id).toBe('cypher')
    expect(up.state.shield).toBe(1)
    const loss = applyEvent({ ...up.state, rp: 305 }, play(0))
    expect(loss.shielded).toBe(true)
    expect(loss.after).toBe(300)
    expect(loss.state.shield).toBe(-1)
    const again = applyEvent(loss.state, play(0))
    expect(again.after).toBe(270)
  })
  it('freestyle and multiplayer scale by length', () => {
    expect(applyEvent(ranked(0), { id: 'f', kind: 'freestyle', score: 100, seconds: 30 }).delta).toBe(24)
    expect(applyEvent(ranked(0), { id: 'r', kind: 'room', score: 100, bars: 8 }).delta).toBe(30)
  })
})

describe('movement and streaks', () => {
  it('reads the result', () => {
    expect(movement({ before: 290, after: 310 })).toBe('promoted')
    expect(movement({ before: 310, after: 290 })).toBe('demoted')
    expect(movement({ before: 390, after: 410 })).toBe('division-up')
    expect(movement({ before: 360, after: 390 })).toBe('near-miss')
    expect(movement({ before: 320, after: 340 })).toBe('held')
  })
  it('hot streak needs three A/S rounds in a row', () => {
    expect(hotStreak(['A', 'S', 'A'])).toBe(true)
    expect(hotStreak(['A', 'B', 'A', 'S'])).toBe(false)
  })
})

// The server has its own copy (public/api/social-ladder.php). Same cases, same answers.
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!php)('PHP ladder matches', () => {
  it('on 2,000 random cases', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const cases: { state: LadderState; event: RpEvent }[] = []
    for (let i = 0; i < 2000; i++) {
      const state = { rp: Math.floor(rnd() * 3000), events: Math.floor(rnd() * 6), shield: rnd() < 0.3 ? Math.floor(rnd() * 8) : -1 }
      const k = rnd()
      const score = Math.round(rnd() * 1000) / 10
      const event: RpEvent =
        k < 0.5
          ? { id: 'p', kind: 'play', score, bars: ([8, 16, 32] as const)[Math.floor(rnd() * 3)], hot: rnd() < 0.3 }
          : k < 0.75
            ? { id: 'f', kind: 'freestyle', score, seconds: [30, 60, 120][Math.floor(rnd() * 3)] }
            : { id: 'r', kind: 'room', score, bars: [2, 4, 8, 12, 16][Math.floor(rnd() * 5)] }
      cases.push({ state, event })
    }
    const out = JSON.parse(execFileSync('php', ['public/api/social-ladder.php'], { input: JSON.stringify(cases) }).toString()) as { after: number; delta: number; state: LadderState }[]
    cases.forEach((c, i) => {
      const ts = applyEvent(c.state, c.event)
      expect({ i, after: out[i].after, shield: out[i].state.shield }).toEqual({ i, after: ts.after, shield: ts.state.shield })
    })
  })
})
