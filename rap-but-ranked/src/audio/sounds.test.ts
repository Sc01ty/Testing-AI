import { describe, expect, it } from 'vitest'
import { MUSIC_TRACKS, UI_SOUNDS, perceptualGain } from './sounds'

describe('sound registry', () => {
  it('every UI sound has a playable source', () => {
    for (const [id, def] of Object.entries(UI_SOUNDS)) {
      if (def.source.kind === 'synth') expect(typeof def.source.recipe, id).toBe('function')
      else expect(def.source.url, id).toMatch(/^audio\//)
    }
  })

  it('music paths are relative so they work under any base path', () => {
    for (const t of Object.values(MUSIC_TRACKS)) expect(t.url.startsWith('/')).toBe(false)
  })

  it('perceptual gain is clamped and curved', () => {
    expect(perceptualGain(0)).toBe(0)
    expect(perceptualGain(1)).toBe(1)
    expect(perceptualGain(0.5)).toBeCloseTo(0.25)
    expect(perceptualGain(3)).toBe(1)
  })
})
