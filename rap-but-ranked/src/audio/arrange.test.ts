import { describe, expect, it } from 'vitest'
import { arrangeTakes, type TakeInput } from './arrange'

const SR = 8000
const BAR = 2 // seconds per bar (120 BPM)
const BEAT = BAR / 4

/** A take for bars [2k, 2k+2): recorded from a beat early to 0.45s late, voiced where `voice` says. */
function take(k: number, voice: (t: number) => number, opts: { level?: number; noise?: number } = {}): TakeInput {
  const sectionStart = k * 2 * BAR
  const startTime = sectionStart - BEAT
  const dur = 2 * BAR + BEAT + 0.45
  const samples = new Float32Array(Math.round(dur * SR))
  let seed = k * 7919 + 1
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let i = 0; i < samples.length; i++) {
    const t = startTime + i / SR
    samples[i] = (opts.noise ?? 0.001) * rnd() + voice(t) * (opts.level ?? 0.3) * Math.sin(i * 0.37)
  }
  return { id: `t${k}`, samples, sampleRate: SR, startTime, sectionStart, sectionEnd: sectionStart + 2 * BAR }
}

const always = () => 1
const between = (a: number, b: number) => (t: number) => (t >= a && t < b ? 1 : 0)

describe('arrangeTakes', () => {
  it('leaves no gap between back-to-back takes, even when the voice never stops', () => {
    const regions = arrangeTakes([0, 1, 2, 3].map((k) => take(k, always)))
    for (let k = 0; k < 3; k++) {
      // the next region starts before this one ends (crossfade), never after
      expect(regions[k + 1].start).toBeLessThanOrEqual(regions[k].end + 1e-9)
      expect(regions[k].end - regions[k + 1].start).toBeLessThan(0.05) // short crossfade, no doubling
    }
  })

  it('cuts each seam in the silence between the last word and the next pickup', () => {
    // take 0 says its last word just past the bar line (to 4.2s); take 1 starts at 4.3s
    const a = take(0, between(0.2, 4.2))
    const b = take(1, between(4.3, 7.9))
    const [ra, rb] = arrangeTakes([a, b])
    const cut = (ra.end + rb.start) / 2
    expect(cut).toBeGreaterThan(4.2)
    expect(cut).toBeLessThan(4.3)
    // the late word of take 0 survives (not chopped at the bar line)
    expect(ra.end).toBeGreaterThan(4.2)
  })

  it("keeps the next take's pickup when it comes in early", () => {
    const a = take(0, between(0.1, 3.4))
    const b = take(1, between(3.6, 7.8)) // pickup half a beat early
    const [ra, rb] = arrangeTakes([a, b])
    expect(rb.start).toBeLessThan(3.6)
    expect(ra.end).toBeGreaterThan(3.4)
  })

  it('trims leading silence on the first take and keeps a natural tail on the last', () => {
    const r = arrangeTakes([take(0, between(0.6, 3.5))])[0]
    expect(r.start).toBeGreaterThan(0.4)
    expect(r.start).toBeLessThan(0.6)
    expect(r.end).toBeGreaterThan(3.5)
    expect(r.end).toBeLessThan(3.5 + 0.5)
  })

  it('levels a quiet take toward the others, within limits', () => {
    const regions = arrangeTakes([take(0, always, { level: 0.3 }), take(1, always, { level: 0.08 }), take(2, always, { level: 0.3 })])
    const out = (lvl: number, g: number) => lvl * g
    expect(out(0.08, regions[1].gain)).toBeGreaterThan(out(0.3, regions[0].gain) * 0.5)
    for (const r of regions) expect(r.gain).toBeLessThanOrEqual(8)
  })

  it('never inserts time: every region stays where its take was recorded', () => {
    const takes = [0, 1, 2].map((k) => take(k, always))
    const regions = arrangeTakes(takes)
    regions.forEach((r, k) => {
      expect(r.start).toBeGreaterThanOrEqual(takes[k].startTime - 1e-9)
      expect(r.end).toBeLessThanOrEqual(takes[k].startTime + takes[k].samples.length / SR + 1e-9)
    })
  })
})
