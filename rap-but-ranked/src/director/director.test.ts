import { describe, expect, it } from 'vitest'
import { basicHelp, basicNextChallenge, firstChallenge, rhymeSuggestions, storyDirectionFor, basicAnalysis } from './basicDirector'
import type { DirectorContext } from './types'

const r = (lines: [string, string], prompt = 'x') => ({ challenge: { prompt, focus: [], storyBeat: '', source: 'basic' as const }, lyrics: lines })

describe('basic director', () => {
  it('opens on the topic', () => {
    expect(firstChallenge('money').prompt).toBe('Write 2 bars about money.')
  })

  it('follows a mentioned person (the mum example)', () => {
    const ctx: DirectorContext = { topic: 'money', totalRounds: 8, storyDirection: '', rounds: [r(['I finally made enough to get my mum out the flats', 'Every bill paid now we never looking back'])] }
    const next = basicNextChallenge(ctx)!
    expect(next.prompt.toLowerCase()).toContain('mum')
    expect(next.prompt).not.toMatch(/space/i)
    expect(basicAnalysis(ctx).toLowerCase()).toContain('mum')
  })

  it('moves through the arc and ends back on the topic', () => {
    const rounds = [
      r(['Broke in the bedsit counting coins for the meter', 'Dreaming of a whip and a house that is neater']),
      r(['My mum doing doubles at the hospital ward', 'I am writing every night cause I want her restored']),
      r(['They said I would never make it out of the ends', 'Lost a couple day ones, had to cut a few friends']),
      r(['Now the keys in my hand and the cheque cleared', 'Same ends, same mum, but she got no fear']),
    ]
    const prompts: string[] = []
    for (let i = 0; i < 4; i++) {
      const ctx: DirectorContext = { topic: 'money', totalRounds: 4, storyDirection: '', rounds: rounds.slice(0, i + 1) }
      const n = basicNextChallenge(ctx)
      prompts.push(n ? n.prompt : 'END')
    }
    expect(prompts[3]).toBe('END')
    expect(prompts[2].toLowerCase()).toContain('money')
    expect(new Set(prompts).size).toBe(4) // no repeats
  })

  it('builds a story direction', () => {
    const ctx: DirectorContext = { topic: 'wanting money', totalRounds: 8, storyDirection: '', rounds: [r(['Counting up the bread', 'For my mum and my brother'])] }
    expect(storyDirectionFor(ctx)).toMatch(/wanting money → (money|family)/)
  })

  it('help never writes bars, rhyme help suggests words', () => {
    const ctx = { topic: 'money', totalRounds: 8, storyDirection: '', rounds: [], current: firstChallenge('money'), draft: ['Counting all the cash', ''] as [string, string] }
    const rh = basicHelp('rhyme', ctx)
    expect(rh).toContain('“cash”')
    expect(rhymeSuggestions('cash')).toEqual(expect.arrayContaining(['stash', 'flash']))
    expect(basicHelp('question', { ...ctx, question: 'can you write my bars for me' })).toContain("won't write")
    expect(basicHelp('question', { ...ctx, question: 'what is internal rhyme?' })).toContain('Internal rhyme')
  })
})
