import { describe, expect, it } from 'vitest'
import { rankForScore } from './rank'

describe('rankForScore', () => {
  it('maps boundaries', () => {
    expect(rankForScore(100)).toBe('S')
    expect(rankForScore(92)).toBe('S')
    expect(rankForScore(91.9)).toBe('A')
    expect(rankForScore(80)).toBe('A')
    expect(rankForScore(65)).toBe('B')
    expect(rankForScore(50)).toBe('C')
    expect(rankForScore(49)).toBe('D')
    expect(rankForScore(0)).toBe('D')
  })
})
