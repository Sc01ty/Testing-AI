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

describe('scoring rise', () => {
  it('ends on the top C6 and climbs a whole tone per reveal', async () => {
    const { riseNote, SCORE_NOTES } = await import('./sounds')
    expect(SCORE_NOTES).toHaveLength(7)
    for (const count of [1, 3, 7]) {
      const notes = Array.from({ length: count }, (_, i) => riseNote(i, count))
      expect(notes.at(-1)).toEqual({ note: 6, rate: 1 })
      for (let i = 1; i < count; i++) expect(notes[i].note).toBe(notes[i - 1].note + 1)
    }
    // eight reveals: the first is C5 pitched down a whole tone (A#4), then C5 … C6
    const eight = Array.from({ length: 8 }, (_, i) => riseNote(i, 8))
    expect(eight[0].note).toBe(0)
    expect(eight[0].rate).toBeCloseTo(2 ** (-2 / 12))
    expect(eight.slice(1).map((x) => x.note)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
