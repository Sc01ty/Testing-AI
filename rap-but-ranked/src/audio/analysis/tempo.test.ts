import { describe, expect, it } from 'vitest'
import { computePeaks, resamplePeaks } from './peaks'
import { detectTempo, findSoundStart } from './tempo'

const SR = 22050

/** A simple boom-bap style pattern: kick on 1 & 3 (+ an "and"), snare on 2 & 4, hats on 8ths. */
function drumLoop(bpm: number, seconds: number, { lead = 0, swingNoise = 0 } = {}) {
  const out = new Float32Array(Math.floor((seconds + lead) * SR))
  const beat = 60 / bpm
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const hit = (t: number, kind: 'kick' | 'snare' | 'hat') => {
    const start = Math.floor((t + lead) * SR)
    const len = Math.floor((kind === 'kick' ? 0.25 : kind === 'snare' ? 0.18 : 0.05) * SR)
    for (let i = 0; i < len && start + i < out.length; i++) {
      const tt = i / SR
      let v = 0
      if (kind === 'kick') v = Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 12) * 0.9
      if (kind === 'snare') v = (rand() * 0.6 + Math.sin(2 * Math.PI * 190 * tt) * 0.3) * Math.exp(-tt * 18)
      if (kind === 'hat') v = rand() * 0.25 * Math.exp(-tt * 70)
      out[start + i] += v
    }
  }
  for (let b = 0, t = 0; t < seconds; b++, t = b * beat) {
    const pos = b % 4
    if (pos === 0 || pos === 2) hit(t, 'kick')
    if (pos === 2) hit(t + beat * 0.5, 'kick')
    if (pos === 1 || pos === 3) hit(t, 'snare')
    hit(t, 'hat')
    hit(t + beat / 2, 'hat')
  }
  if (swingNoise) for (let i = 0; i < out.length; i++) out[i] += rand() * swingNoise
  return out
}

describe('detectTempo', () => {
  for (const bpm of [72, 86, 92, 100, 128, 140, 150]) {
    it(`finds ${bpm} BPM (or its half/double) within 0.5`, () => {
      const r = detectTempo(drumLoop(bpm, 24, { swingNoise: 0.01 }), SR)
      const readings = [r.bpm, ...r.alternatives]
      const close = readings.some((v) => Math.abs(v - bpm) < 0.5)
      expect(close, `got ${r.bpm.toFixed(2)} (alts ${r.alternatives})`).toBe(true)
      expect(r.confidence).toBeGreaterThan(0.3)
    })
  }

  it('reports typical rap tempos directly (not double-time)', () => {
    for (const bpm of [86, 92, 100]) expect(Math.abs(detectTempo(drumLoop(bpm, 24), SR).bpm - bpm)).toBeLessThan(0.5)
  })

  it('finds the start after leading silence, and a downbeat on a kick', () => {
    const r = detectTempo(drumLoop(90, 20, { lead: 2.3 }), SR)
    expect(r.soundStart).toBeGreaterThan(2.2)
    expect(r.soundStart).toBeLessThan(2.35)
    // downbeat should sit on a bar line: 2.3 + n * (4 * 60/90)
    const bar = (4 * 60) / 90
    const n = Math.round((r.downbeat - 2.3) / bar)
    expect(Math.abs(r.downbeat - (2.3 + n * bar))).toBeLessThan(0.05)
  })

  it('handles silence without throwing', () => {
    const r = detectTempo(new Float32Array(SR * 5), SR)
    expect(r.confidence).toBe(0)
    expect(findSoundStart(new Float32Array(100), SR)).toBe(0)
  })
})

describe('peaks', () => {
  it('normalises to the loudest column', () => {
    const ch = new Float32Array([0, 0.5, 0, -1, 0.25, 0])
    const p = computePeaks([ch], 3)
    expect(p[1]).toBe(1)
    expect(p.every((v) => v >= 0 && v <= 1)).toBe(true)
  })
  it('resamples down', () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3])
  })
})
