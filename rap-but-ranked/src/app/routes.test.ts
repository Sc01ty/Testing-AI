import { describe, expect, it } from 'vitest'
import { parseHash } from './routes'

describe('parseHash', () => {
  it('maps known routes', () => {
    expect(parseHash('#/play')).toBe('play')
    expect(parseHash('#settings')).toBe('settings')
    expect(parseHash('#/beats/123')).toBe('beats')
  })
  it('falls back to the menu', () => {
    expect(parseHash('')).toBe('menu')
    expect(parseHash('#/nope')).toBe('menu')
  })
})
