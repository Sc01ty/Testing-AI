import { describe, expect, it } from 'vitest'
import { lineSyllables, rhymeStrength, stem, syllables } from './text'
import { peopleIn, themesIn, topicWords } from './themes'

const rhymes = (a: string, b: string) => rhymeStrength(a, b).score

describe('rhyme engine', () => {
  it('finds perfect rhymes', () => {
    for (const [a, b] of [
      ['night', 'light'],
      ['time', 'rhyme'],
      ['flow', 'go'],
      ['money', 'honey'],
      ['paper', 'later'],
      ['cash', 'stash'],
      ['grind', 'mind'],
      ['stack', 'back'],
      ['real', 'deal'],
      ['flats', 'stats'],
      ['nation', 'station'],
    ])
      expect(rhymes(a, b), `${a}/${b}`).toBeGreaterThanOrEqual(0.9)
  })
  it('scores slant rhymes lower but above zero', () => {
    for (const [a, b] of [
      ['flats', 'stacks'],
      ['mum', 'run'],
      ['home', 'alone'],
      ['bread', 'left'],
    ]) {
      const s = rhymes(a, b)
      expect(s, `${a}/${b}`).toBeGreaterThan(0.4)
      expect(s, `${a}/${b}`).toBeLessThan(0.9)
    }
  })
  it('rejects non-rhymes and identical words', () => {
    for (const [a, b] of [
      ['cat', 'dog'],
      ['money', 'house'],
      ['street', 'street'],
      ['dream', 'dreams'],
    ])
      expect(rhymes(a, b), `${a}/${b}`).toBe(0)
  })
  it('recognises multisyllabic rhymes', () => {
    expect(rhymeStrength('paper', 'later').kind).toBe('multi')
    expect(rhymeStrength('money', 'honey').kind).toBe('multi')
  })
})

describe('text', () => {
  it('stems and counts syllables', () => {
    expect(stem('dreaming')).toBe('dream')
    expect(stem('stacks')).toBe('stack')
    expect(syllables('money')).toBe(2)
    expect(syllables('time')).toBe(1)
    expect(lineSyllables('I finally made enough to get my mum out the flats')).toBeGreaterThan(10)
  })
  it('finds themes, people and topic words', () => {
    const t = themesIn('I finally made enough to get my mum out the flats')
    expect(t.has('family')).toBe(true)
    expect(t.has('city')).toBe(true)
    expect(peopleIn('Me and Jordan told my mum')).toEqual(expect.arrayContaining(['mum', 'Jordan']))
    expect(topicWords('wanting money')).toEqual(expect.arrayContaining(['wanting', 'money', 'cash', 'racks']))
  })
})
