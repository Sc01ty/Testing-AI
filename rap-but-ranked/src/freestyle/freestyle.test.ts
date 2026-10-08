import { describe, expect, it } from 'vitest'
import type { TranscriptWord } from '../domain/types'
import { planPrompts, promptIndexAt } from './prompts'
import { barsOfWords, promptHits, scoreFreestyle } from './score'

const SPBAR = 2 // 120 BPM
const SPB = 0.5

/** Timeline words: "w@bar" means a word said at the start of that bar (+ offset seconds). */
function said(...items: [string, number, number?][]): TranscriptWord[] {
  return items.map(([text, bar, off = 0]) => ({ text, start: bar * SPBAR + off, end: bar * SPBAR + off + 0.3 }))
}

/** A voice that's on for the given bars (8 kHz, a beat early pickup). */
function voice(bars: number, onBars: (b: number) => boolean) {
  const sr = 8000
  const startTime = -SPB
  const n = Math.round((bars * SPBAR - startTime) * sr)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = startTime + i / sr
    const b = Math.floor(t / SPBAR)
    const beatPhase = (t / SPB) % 1
    s[i] = 0.0008 * Math.sin(i * 1.3) + (b >= 0 && onBars(b) && beatPhase < 0.5 ? 0.3 * Math.sin(i * 0.31) : 0)
  }
  return { samples: s, sampleRate: sr, startTime }
}

describe('planPrompts', () => {
  it('spaces prompts by difficulty', () => {
    expect(planPrompts('easy', 16, 1).map((p) => p.bar)).toEqual([0, 8])
    expect(planPrompts('medium', 16, 1).map((p) => p.bar)).toEqual([0, 4, 8, 12])
    expect(planPrompts('hard', 16, 1)).toHaveLength(8)
    expect(planPrompts('medium', 16, 1, 2)).toHaveLength(8) // override
  })
  it('chaos is irregular but always starts at bar 1 and never repeats a word back-to-back', () => {
    const p = planPrompts('chaos', 32, 7)
    expect(p[0].bar).toBe(0)
    const gaps = p.slice(1).map((x, i) => x.bar - p[i].bar)
    expect(new Set(gaps).size).toBeGreaterThan(1)
    for (let i = 1; i < p.length; i++) expect(p[i].word).not.toBe(p[i - 1].word)
  })
  it('is reproducible from its seed', () => {
    expect(planPrompts('hard', 16, 42)).toEqual(planPrompts('hard', 16, 42))
  })
  it('finds the prompt showing at a bar', () => {
    const p = [
      { word: 'a', bar: 0 },
      { word: 'b', bar: 4 },
    ]
    expect(promptIndexAt(p, 3)).toBe(0)
    expect(promptIndexAt(p, 4)).toBe(1)
  })
})

describe('promptHits', () => {
  const prompts = [
    { word: 'money', bar: 0 },
    { word: 'school', bar: 4 },
    { word: 'regret', bar: 8 },
  ]
  it('uses explicit equivalents and does not count loose theme associations', () => {
    const words = said(['stacking', 0], ['cash', 1], ['teacher', 5], ['classroom', 9])
    const hits = promptHits(prompts, words, 12, SPBAR)
    expect(hits[0]).toMatchObject({ hit: true }) // cash → money theme
    expect(hits[0].evidence.join(' ')).toContain('cash')
    expect(hits[1].hit).toBe(false) // teacher alone is too loose; later classroom is outside its window
    expect(hits[2].hit).toBe(false) // classroom isn't regret
  })
  it('rejects bank alone and credits a financial phrase with its transcript excerpt',()=>{
    expect(promptHits([{word:'money',bar:0}],said(['bank',0]),4,SPBAR)[0].hit).toBe(false)
    const h=promptHits([{word:'money',bar:0}],said(['double',0],['my',0],['bank',0],['balance',0]),4,SPBAR)[0]
    expect(h.hit).toBe(true);expect(h.evidence[0]).toContain('bank balance')
    expect(promptHits([{word:'school',bar:0}],said(['teacher',0]),4,SPBAR)[0].hit).toBe(false)
  })
  it("doesn't credit a word said long before its prompt appeared", () => {
    const words = said(['regret', 1])
    expect(promptHits(prompts, words, 12, SPBAR)[2].hit).toBe(false)
  })
})

describe('scoreFreestyle', () => {
  const prompts = planPrompts('medium', 8, 3)
  it('without a transcript, only scores what the audio shows', () => {
    const v = voice(8, () => true)
    const r = scoreFreestyle({ prompts, bars: 8, secondsPerBar: SPBAR, secondsPerBeat: SPB, words: null, ...v })
    expect(r.transcribed).toBe(false)
    expect(r.categories.map((c) => c.category)).toEqual(['continuity', 'flow'])
    expect(r.feedback.join(' ')).toMatch(/speech recognition/i)
  })
  it('freezing costs continuity, with the bars named', () => {
    const full = scoreFreestyle({ prompts, bars: 8, secondsPerBar: SPBAR, secondsPerBeat: SPB, words: null, ...voice(8, () => true) })
    const froze = scoreFreestyle({ prompts, bars: 8, secondsPerBar: SPBAR, secondsPerBeat: SPB, words: null, ...voice(8, (b) => b < 3 || b > 5) })
    const c = (r: typeof full) => r.categories.find((x) => x.category === 'continuity')!
    expect(c(froze).score).toBeLessThan(c(full).score)
    expect(c(froze).reasons.join(' ')).toMatch(/bars 4–6/)
  })
  it('rhyming bar endings beat non-rhyming ones', () => {
    const v = voice(4, () => true)
    const rhymes = said(['I', 0], ['came', 0, 1.5], ['for', 1], ['the', 1, 1], ['fame', 1, 1.5], ['never', 2], ['lame', 2, 1.5], ['same', 3, 1.5])
    const flat = said(['I', 0], ['came', 0, 1.5], ['for', 1], ['the', 1, 1], ['bus', 1, 1.5], ['never', 2], ['orange', 2, 1.5], ['window', 3, 1.5])
    const p = [{ word: 'fame', bar: 0 }]
    const a = scoreFreestyle({ prompts: p, bars: 4, secondsPerBar: SPBAR, secondsPerBeat: SPB, words: rhymes, ...v })
    const b = scoreFreestyle({ prompts: p, bars: 4, secondsPerBar: SPBAR, secondsPerBeat: SPB, words: flat, ...v })
    const rh = (r: typeof a) => r.categories.find((x) => x.category === 'rhyme')!.score
    expect(rh(a)).toBeGreaterThan(rh(b))
    expect(a.prompts[0].hit).toBe(true)
  })
  it('groups words into bars by time', () => {
    expect(barsOfWords(said(['a', 0], ['b', 0, 1.9], ['c', 1]), 2, SPBAR)).toEqual([['a', 'b'], ['c']])
  })
})

describe('cleanWords (speech recognition clean-up)', () => {
  const w = (s: string) => s.split(' ').map((text, i) => ({ text, start: i, end: i + 0.5 }))
  it('collapses a stuck repetition loop', async () => {
    const { cleanWords } = await import('./asr')
    const out = cleanWords(w('football on the i saw it i saw it i saw it i saw it i saw it on the screen'))
    expect(out.map((x) => x.text).join(' ')).toBe('football on the i saw it i saw it on the screen')
  })
  it('catches long looped phrases too', async () => {
    const { cleanWords } = await import('./asr')
    const loop = Array(6).fill('i saw her in the middle of the night').join(' ')
    expect(cleanWords(w(`${loop} on the screen`)).length).toBe(9 * 2 + 3)
  })
  it('leaves normal bars (and a doubled word) alone', async () => {
    const { cleanWords } = await import('./asr')
    const text = 'money money on my mind and my family by my side'
    expect(cleanWords(w(text)).map((x) => x.text).join(' ')).toBe(text)
  })
})
