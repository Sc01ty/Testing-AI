import { describe, expect, it } from 'vitest'
import { resolveReducedMotion } from './motion'

describe('resolveReducedMotion', () => {
  it('follows the OS when set to system', () => {
    expect(resolveReducedMotion('system', true)).toBe(true)
    expect(resolveReducedMotion('system', false)).toBe(false)
  })
  it('explicit choice wins over the OS', () => {
    expect(resolveReducedMotion('full', true)).toBe(false)
    expect(resolveReducedMotion('reduced', false)).toBe(true)
  })
})
