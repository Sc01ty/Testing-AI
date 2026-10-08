import { beforeAll, describe, expect, it } from 'vitest'
import { ensureLexicon, sound } from './lexicon'
import { lineEndMatch, lineSyllables, rhymePocket, rhymeWords, stressString } from './phonetics'

beforeAll(() => ensureLexicon())

describe('rhymes are judged by sound, not spelling', () => {
  it.each([
    ['night', 'light', 'perfect'],
    ['time', 'rhyme', 'perfect'],
    ['flow', 'go', 'perfect'],
    ['hand', 'planned', 'perfect'],
    ['money', 'honey', 'multi'],
    ['paper', 'later', 'multi'],
    ['station', 'patience', 'multi'],
    ['flats', 'stacks', 'slant'],
    ['see', 'sea', 'identical'],
    ['back', 'rock', 'consonance'],
    ['money', 'window', 'none'],
  ])('%s / %s → %s', (a, b, kind) => {
    expect(rhymeWords(a, b).kind).toBe(kind)
  })

  it('a multi beats a perfect beats a slant', () => {
    expect(rhymeWords('money', 'honey').score).toBeGreaterThan(rhymeWords('night', 'light').score)
    expect(rhymeWords('night', 'light').score).toBeGreaterThan(rhymeWords('flats', 'stacks').score)
  })

  it('still handles slang the dictionary lacks (guessed, flagged)', () => {
    const s = sound('grindin')!
    expect(s.known).toBe(true) // folded to "grinding"
    const t = sound('skrrt')
    expect(t === null || t.known === false).toBe(true)
    expect(rhymeWords('grindin', 'finding').score).toBeGreaterThanOrEqual(0.7)
  })
})

describe('lines', () => {
  it('weak function words are unstressed; the line end is stressed', () => {
    const syl = lineSyllables('I finally made it to the top')
    expect(syl.find((s) => s.word === 'the')!.stress).toBe(0)
    expect(syl[syl.length - 1].stress).toBe(1)
    expect(stressString(syl)).toMatch(/DA$/)
  })
  it('finds multisyllabic rhymes across word boundaries', () => {
    expect(lineEndMatch('I came from the bottom of the stairs', 'now I got a lot of shares').syllables).toBeGreaterThanOrEqual(1)
    expect(lineEndMatch('they never had a vision for me', 'now I got a mission to see').syllables).toBeGreaterThanOrEqual(2)
  })
  it("names a line's rhyme pocket", () => {
    expect(rhymePocket('get my mum out the flats')!.vowel).toBe('AE')
  })
})
