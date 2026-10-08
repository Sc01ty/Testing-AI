import { describe, expect, it } from 'vitest'
import type { Challenge } from '../domain/types'
import { scoreOriginality, scorePrompt, scoreRhyme, scoreStory } from './lyricScore'
import { analysePerformance, scoreFlow } from './performance'
import { scoreRound } from './round'

const ch = (prompt: string, focus: string[], storyBeat = 'the start'): Challenge => ({ prompt, focus, storyBeat, source: 'basic' })
const money = ch('Write 2 bars about wanting money.', ['money', 'wanting'])

describe('lyric scoring', () => {
  it('rewards real rhymes over none', () => {
    const good = scoreRhyme(['I finally made enough to get my mum out the flats', 'Now every single bill is paid and I am stacking up stacks'])
    const bad = scoreRhyme(['I want some money today', 'I really like my dog'])
    expect(good.score).toBeGreaterThan(bad.score + 25)
    expect(good.reasons[0]).toContain('“flats” / “stacks”')
    expect(bad.reasons[0]).toContain("don't rhyme")
  })

  it('prompt relevance: on-topic beats off-topic, slang counts', () => {
    const on = scorePrompt({ lyrics: ['Counting up the bread while I dream about the racks', 'Broke boy dreams of a bank full of cash'], challenge: money, topic: 'money', previous: [] })
    const off = scorePrompt({ lyrics: ['The sky is blue and the grass is green', 'My cat is sleeping on the trampoline'], challenge: money, topic: 'money', previous: [] })
    expect(on.score).toBeGreaterThan(80)
    expect(off.score).toBeLessThan(30)
  })

  it('story: calling back beats changing the subject', () => {
    const previous = [{ lyrics: ['I finally made enough to get my mum out the flats', 'Every bill paid now we never looking back'] as [string, string], challenge: money }]
    const next = ch('Write 2 bars about what success would mean for your family.', ['mum', 'family', 'success'], 'family')
    const follow = scoreStory({ lyrics: ['Bought my mum a house with a garden and a gate', 'She cried at the keys said her son was worth the wait'], challenge: next, topic: 'money', previous })
    const random = scoreStory({ lyrics: ['Flying to the moon in a rocket made of cheese', 'Aliens dancing on the stars if you please'], challenge: next, topic: 'money', previous })
    expect(follow.score).toBeGreaterThan(random.score + 20)
    expect(follow.reasons[0]).toContain('mum')
  })

  it('originality punishes clichés and repetition', () => {
    const cliche = scoreOriginality({ lyrics: ['Money on my mind I am on my grind', 'Money money money get money all the time'], challenge: money, topic: 'money', previous: [] })
    const fresh = scoreOriginality({ lyrics: ['Microwave dinners in a freezing bedsit kitchen', 'Calculator tapping while the landlord keeps on itching'], challenge: money, topic: 'money', previous: [] })
    expect(fresh.score).toBeGreaterThan(cliche.score + 30)
  })

  it('empty bars score zero, not random', () => {
    expect(scoreRhyme(['', 'something']).score).toBe(0)
  })
})

/** Synthetic vocal: short bursts at given beat times. */
function vocal(onsetsBeatTime: number[], beatTimeSec: number, dur: number, sr = 16000) {
  const s = new Float32Array(Math.floor(dur * sr))
  for (const t of onsetsBeatTime) {
    const i0 = Math.floor((t - beatTimeSec) * sr)
    for (let i = 0; i < 0.12 * sr; i++) if (i0 + i < s.length && i0 + i >= 0) s[i0 + i] = Math.sin(i * 0.12) * 0.4 * Math.exp(-i / (0.06 * sr))
  }
  return s
}

describe('performance scoring', () => {
  const spb = 0.6 // 100 BPM
  const sectionStart = 5
  const sectionEnd = 5 + 8 * spb
  const beatTimeSec = sectionStart - spb
  const base = { sampleRate: 16000, beatTimeSec, sectionStart, sectionEnd, secondsPerBeat: spb, lyricSyllables: 24 }

  it('on-grid rapping beats off-grid rapping', () => {
    const grid = Array.from({ length: 28 }, (_, i) => sectionStart + i * (spb / 4) + (i % 3 === 2 ? spb / 4 : 0)).filter((t) => t < sectionEnd - 0.1)
    const off = grid.map((t, i) => t + spb / 8 + (i % 2 ? 0.01 : -0.01))
    const a = scoreFlow(analysePerformance({ ...base, samples: vocal(grid, beatTimeSec, 6.5) }), base)
    const b = scoreFlow(analysePerformance({ ...base, samples: vocal(off, beatTimeSec, 6.5) }), base)
    expect(a.score).toBeGreaterThan(b.score + 20)
    expect(a.reasons[0]).toContain('tight')
  })

  it('silence is called out, not scored as a performance', () => {
    const r = scoreFlow(analysePerformance({ ...base, samples: new Float32Array(16000 * 6) }), base)
    expect(r.score).toBeLessThan(10)
    expect(r.reasons[0]).toContain('barely hear')
  })

  it('a full round produces five explained categories and a rank', () => {
    const grid = Array.from({ length: 24 }, (_, i) => sectionStart + i * (spb / 3))
    const res = scoreRound(
      { lyrics: ['I finally made enough to get my mum out the flats', 'Now every single bill is paid and I am stacking up stacks'], challenge: money, topic: 'money', previous: [] },
      { samples: vocal(grid, beatTimeSec, 6.5), sampleRate: 16000, beatTimeSec, sectionStart, sectionEnd, secondsPerBeat: spb },
      'test',
    )
    expect(res.categories.map((c) => c.category)).toEqual(['rhyme', 'prompt', 'story', 'flow', 'originality'])
    expect(res.categories.every((c) => c.reasons.length > 0)).toBe(true)
    expect(['D', 'C', 'B', 'A', 'S']).toContain(res.rank)
    expect(res.feedback.length).toBeGreaterThan(0)
  })
})
