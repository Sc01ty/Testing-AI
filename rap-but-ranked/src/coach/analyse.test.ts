import { describe, expect, it } from 'vitest'
import { analyseBars, isCadenceSketch } from './analyse'

const base = { topic: 'wanting money', previous: [] as [string, string][], focus: ['money'], secondsPerBar: 2.6 }

describe('rhyme-first filler', () => {
  it('flags a rhyming word nothing else connects to', () => {
    const a = analyseBars({ ...base, lines: ['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'] })
    expect(a.filler.map((f) => f.word)).toContain('fright')
    expect(a.filler[0].reason).toMatch(/rhymes, but nothing else/)
  })
  it("doesn't flag an end word that belongs to the bar's world", () => {
    const a = analyseBars({ ...base, lines: ['Counting every penny that I saved up in the jar', 'Two more years of overtime and I can buy a car'] })
    expect(a.filler).toEqual([])
  })
  it('a meaningful bar with a weak rhyme is not called filler', () => {
    const a = analyseBars({ ...base, lines: ['Mum worked two jobs just to keep the heating on', 'I counted every coin she left me on the kitchen table'] })
    expect(a.filler).toEqual([])
    expect(a.rhyme.end.score).toBeLessThan(0.5)
  })
})

describe('wordplay candidates (rules find them; they are never auto-confirmed)', () => {
  it('double-duty word: two meanings both supported by the bar', () => {
    const a = analyseBars({ ...base, lines: ['I got interest in the money that the bank keeps', "And I'm curious who's watching while the city sleeps"] })
    const c = a.wordplay.find((w) => w.word === 'interest')
    expect(c?.kind).toBe('double-duty')
    expect(c?.confirmed).toBe(false)
  })
  it('homophone: "see" next to sea words', () => {
    const a = analyseBars({ ...base, lines: ['From the window of the ship I can see the waves', 'Salt on my lips from the ocean of my days'] })
    expect(a.wordplay.some((w) => w.kind === 'homophone' && w.word === 'see' && w.senses.includes('sea'))).toBe(true)
  })
  it('two-line flip: a word changes meaning between bar 1 and bar 2', () => {
    const a = analyseBars({ ...base, lines: ['I kept the change from every bill I ever paid', 'Mum watched me grow, she saw the change in me today'] })
    expect(a.wordplay.some((w) => w.kind === 'two-line-flip' && w.word === 'change')).toBe(true)
  })
  it('a plain story line has no wordplay — and is marked a connector, not a failure', () => {
    const a = analyseBars({ ...base, previous: [['I want the money so my mum can rest', 'She works the night shift and she does her best']], lines: ['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough'] })
    expect(a.wordplay).toEqual([])
    expect(a.connector).toBe(true)
  })
})

describe('semantic chains', () => {
  it('follows connected concepts across a bar (cheque → ink → squid)', () => {
    const a = analyseBars({ ...base, lines: ['Signed the cheque and the ink went everywhere', "Like a squid in the deep, I don't have a care"] })
    const words = a.chains.flatMap((c) => c.flatMap((l) => [l.from, l.to]))
    expect(words).toEqual(expect.arrayContaining(['cheque', 'ink']))
    expect(a.chains.some((c) => c.some((l) => l.to === 'squid'))).toBe(true)
  })
})

describe('rhyme by sound', () => {
  it('multisyllabic and slant rhymes are recognised', () => {
    expect(analyseBars({ ...base, lines: ['All I ever wanted was a little bit of money', 'Now the whole estate is calling me their honey'] }).rhyme.end.kind).toBe('multi')
    expect(analyseBars({ ...base, lines: ['Get my mum out of the flats', 'Every bill paid, now we stacking up the stacks'] }).rhyme.end.score).toBeGreaterThanOrEqual(0.7)
  })
  it('internal rhymes are found (and filler words are not counted)', () => {
    const a = analyseBars({ ...base, lines: ['Cash in a flash, I dash to the stash', 'The way that I play, I pay for the day'] })
    expect(a.rhyme.internal.length).toBeGreaterThan(2)
    expect(a.rhyme.internal.some((p) => ['the', 'a', 'i'].includes(p.a))).toBe(false)
  })
})

describe('cadence', () => {
  it('mumble / da-da input is a cadence sketch, not bad lyrics', () => {
    expect(isCadenceSketch('da-da-DA-da-da-da-AY-in')).toBe(true)
    const a = analyseBars({ ...base, lines: ['da-da-DA-da-da-da-AY-in', 'na na NA na na na DAY-in'] })
    expect(a.cadenceSketch).toBe(true)
    expect(a.filler).toEqual([])
    expect(a.wordplay).toEqual([])
  })
  it('flags crowded and underwritten bars for the tempo', () => {
    expect(analyseBars({ ...base, lines: ['I want it', 'I need it'] }).cadence.verdict).toBe('underwritten')
    expect(
      analyseBars({ ...base, lines: ['I been working every single day and every single night and every single minute of the hour', 'Counting every penny that I ever made and every single thing I ever bought and every single dollar'] }).cadence.verdict,
    ).toBe('crowded')
  })
})

describe('song context', () => {
  it('notices bars that have nothing to do with the song so far', () => {
    const a = analyseBars({ ...base, previous: [['I want the money so my mum can rest', 'She works the night shift and she does her best']], lines: ['Penguins on the ice and the volcano is erupting', 'Dinosaurs are dancing while the robots are corrupting'] })
    expect(a.meaning.connectsToSong).toBe(false)
  })
})

describe('naturalness', () => {
  it('spots word order bent for the rhyme', () => {
    const a = analyseBars({ ...base, lines: ['All the money that I want is the money I did get', 'And the future that I see is the future I have met'] })
    expect(a.naturalness.some((n) => n.kind === 'inversion')).toBe(true)
  })
})

describe('constraints', () => {
  it('checks avoid-words and callbacks; says when it cannot judge', () => {
    const a = analyseBars({
      ...base,
      lines: ['Bills on the table and the rent is overdue', 'Mum still smiling though, she knows I will come through'],
      constraints: [{ kind: 'avoid-words', words: ['money', 'cash', 'rich'] }, { kind: 'callback', word: 'mum' }, { kind: 'hidden-double-meaning' }],
    })
    expect(a.constraints.map((c) => c.met)).toEqual([true, true, null])
  })
})
