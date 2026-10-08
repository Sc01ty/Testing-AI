import { describe, expect, it } from 'vitest'
import type { Challenge, Round, Session } from '../domain/types'
import { scoreRound } from '../scoring/round'
import { computeProfile, profileSummary } from './profile'

const ch: Challenge = { prompt: 'Write 2 bars about wanting money.', focus: ['money'], storyBeat: 'setup', source: 'basic' }

function session(bars: [string, string][], id = 's', updatedAt = 1, help = 0): Session {
  const rounds: Round[] = []
  bars.forEach((lyrics, index) => {
    const result = scoreRound({ lyrics, challenge: ch, topic: 'wanting money', previous: rounds.map((r) => ({ lyrics: r.lyrics, challenge: ch })) }, null, '', { secondsPerBar: 2.6 })
    rounds.push({ index, challenge: ch, lyrics, take: null, result, assistance: Array.from({ length: help }, (_, k) => ({ mode: 'rhymes' as const, level: 1 as const, at: k })) })
  })
  return { id, trackName: 'T', beatId: 'b', beatName: 'B', startingTopic: 'wanting money', length: 8, rounds, storyDirection: '', status: 'complete', createdAt: 0, updatedAt }
}

const rhymeFirst: [string, string][] = [
  ['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'],
  ['Chasing all the paper till the morning comes around', 'Like a purple dolphin making noises in the town'],
  ['I just want the money and the cars and the gold', 'Like a happy pickle sitting in the cold'],
  ['Counting every penny that I never got to keep', 'Like a little teapot floating in the deep'],
]

describe('skill profile', () => {
  it('needs enough evidence before labelling anyone', () => {
    const p = computeProfile([session(rhymeFirst.slice(0, 2))])
    expect(p.tendencies).toEqual([])
    expect(p.weakest).toBeNull()
    expect(profileSummary(p)).toMatch(/not enough/)
  })
  it('spots a repeated rhyme-first habit and makes it the thing to train', () => {
    const p = computeProfile([session(rhymeFirst)])
    expect(p.tendencies.map((t) => t.id)).toContain('rhyme-first')
    expect(p.weakest).toBe('meaning-first')
  })
  it('notices heavy Help use, without it being the only signal', () => {
    const p = computeProfile([session(rhymeFirst, 's', 1, 2)])
    expect(p.tendencies.some((t) => t.id === 'help')).toBe(true)
    expect(p.help.byMode.rhymes).toBe(8)
  })
  it('uses recent rounds: newer clean tracks outweigh an old habit', () => {
    const clean: [string, string][] = [
      ['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough'],
      ['Mum worked two jobs just to keep the heating on', 'I counted every coin she left me on the table'],
      ['Bought my mum a house with a garden and a gate', 'She cried at the keys and said I was worth the wait'],
      ['Now the bills are paid and the fridge is never bare', 'Every sunday dinner there is food for everyone there'],
    ]
    const many = Array.from({ length: 6 }, (_, i) => session(clean, `c${i}`, 10 + i))
    const p = computeProfile([session(rhymeFirst, 'old', 1), ...many])
    expect(p.tendencies.map((t) => t.id)).not.toContain('rhyme-first')
  })
})
