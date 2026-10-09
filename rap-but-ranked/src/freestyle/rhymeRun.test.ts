import { describe, expect, it } from 'vitest'
import { rhymeWords } from '../coach/phonetics'
import { sound } from '../coach/lexicon'
import { RHYME_FAMILIES, ballAt, planRhymeRun, rhymeLandings, scoreRhymeRun, targetTime, timingGrade } from './rhymeRun'

describe('rhyme families', () => {
  it('perfect families rhyme by sound', () => {
    for (const fam of [...RHYME_FAMILIES.simple, ...RHYME_FAMILIES.double, ...RHYME_FAMILIES.multi]) {
      for (const w of fam) {
        expect(sound(w)?.known, `${w} is in the dictionary`).toBe(true)
        if (w !== fam[0]) expect(rhymeWords(w, fam[0]).score, `${w} / ${fam[0]}`).toBeGreaterThanOrEqual(0.65)
      }
    }
  })
  it('slant families at least share their vowel', () => {
    for (const fam of RHYME_FAMILIES.slant) for (const w of fam.slice(1)) expect(rhymeWords(w, fam[0]).score, `${w} / ${fam[0]}`).toBeGreaterThan(0.3)
  })
})

describe('rhyme run plan', () => {
  it('one target per bar, a family per block, never the same family twice running', () => {
    const p = planRhymeRun('medium', 16, 7)
    expect(p.map((x) => x.bar)).toEqual([...Array(16).keys()])
    for (let b = 0; b < 16; b += 4) expect(new Set(p.slice(b, b + 4).map((x) => x.target)).size).toBe(1)
    expect(p[3].target).not.toBe(p[4].target)
  })
  it('easy leaves a breather bar after each family', () => {
    const p = planRhymeRun('easy', 10, 3)
    expect(p.map((x) => x.bar)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
  })
  it('chaos switches family every two bars', () => {
    const p = planRhymeRun('chaos', 8, 11)
    expect(p[1].target).toBe(p[0].target)
    expect(p[2].target).not.toBe(p[1].target)
  })
})

describe('the ball follows the beat clock', () => {
  for (const bpm of [72, 100, 140]) {
    it(`touches down on every beat at ${bpm} BPM, word on beat 4`, () => {
      const spb = 60 / bpm
      for (let k = 0; k < 32; k++) {
        const b = ballAt(k * spb, spb, 4)
        expect(b.height).toBeCloseTo(0, 6)
        expect(b.bar).toBe(Math.floor(k / 4))
        expect(b.beat).toBe(k % 4)
        // half way between beats it's at the top
        expect(ballAt((k + 0.5) * spb, spb, 4).height).toBeCloseTo(1, 6)
      }
      expect(ballAt(targetTime(5, spb, 4), spb, 4)).toMatchObject({ bar: 5, beat: 3, height: 0 })
    })
  }
  it('count-in is bar -1', () => {
    expect(ballAt(-0.1, 0.5, 4)).toMatchObject({ bar: -1, beat: 3 })
  })
})

describe('rhyme run scoring', () => {
  const spb = 0.5
  const sr = 8000
  const prompts = [
    { bar: 0, word: 'ground', target: 'ground' },
    { bar: 1, word: 'sound', target: 'ground' },
    { bar: 2, word: 'found', target: 'ground' },
    { bar: 3, word: 'round', target: 'ground' },
  ]
  // voice on beats 1–3 of every bar, silence elsewhere
  const samples = new Float32Array(sr * 9)
  for (let bar = 0; bar < 4; bar++) for (let i = Math.floor(bar * 2 * sr); i < Math.floor((bar * 2 + 1.4) * sr); i++) samples[i] = Math.sin(i / 3) * 0.3
  const w = (text: string, start: number) => ({ text, start, end: start + 0.3 })
  const words = [
    w('whole', 0.1), w('crowd', 0.6), w('on', 1.0), w('the', 1.2), w('ground', 1.5 + 0.09), // +90 ms
    w('hear', 2.2), w('my', 2.6), w('sound', 3.5 - 0.13), // -130 ms
    w('nothing', 4.3), w('pound', 5.5), // rhymes, not the target
    w('go', 6.4), // round never said
  ]
  it('finds each landing with its offset from beat 4', () => {
    const l = rhymeLandings({ prompts, bars: 4, secondsPerBeat: spb, beatsPerBar: 4, words, samples, sampleRate: sr, startTime: 0 })
    expect(l.map((x) => x.hit)).toEqual([true, true, false, false])
    expect(l[0].offsetMs).toBe(90)
    expect(l[1].offsetMs).toBe(-130)
    expect(l[2].near).toBe('pound')
    expect(l[3].near).toBeNull()
    expect(l[0].evidence[0]).toContain('ground')
  })
  it('scores landed share, timing grade and lines built', () => {
    const r = scoreRhymeRun({ prompts, bars: 4, secondsPerBeat: spb, beatsPerBar: 4, words, samples, sampleRate: sr, startTime: 0 })
    expect(r.landed).toEqual({ hits: 2, total: 4, grade: timingGrade(110) })
    expect(r.categories.find((c) => c.category === 'continuity')!.score).toBe(100)
    expect(r.prompts[1].offsetMs).toBe(-130)
  })
  it('without a transcript, landings are not judged', () => {
    const r = scoreRhymeRun({ prompts, bars: 4, secondsPerBeat: spb, beatsPerBar: 4, words: null, samples, sampleRate: sr, startTime: 0 })
    expect(r.transcribed).toBe(false)
    expect(r.landed).toBeUndefined()
    expect(r.categories.map((c) => c.category)).toEqual(['continuity'])
  })
})
