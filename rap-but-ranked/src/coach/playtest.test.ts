import { beforeAll, describe, expect, it } from 'vitest'
import { ensureLexicon } from './lexicon'
import { endingEvidence, rhymeEvidence } from './rhymeEvidence'
import { scoreRound } from '../scoring/round'
import { promptHits } from '../freestyle/score'
import { planPrompts } from '../freestyle/prompts'
import { validChallenge } from '../director/llmDirector'

beforeAll(ensureLexicon)
const category = (lyrics: [string, string]) =>
  scoreRound(
    {
      lyrics,
      topic: 'money',
      challenge: {
        prompt: 'Rap about money.',
        focus: ['money'],
        storyBeat: 'opening',
        source: 'basic',
      },
      previous: [],
    },
    null,
    '',
  ).categories.find((c) => c.category === 'rhyme')!

describe('messy playtest material', () => {
  it.each([
    ['I been grinding, max speed', 'still paying these fees, yeah'],
    ['Dad said nah, out the flats', 'cash in the bag, counting stacks'],
    ['still grindin, man, finding my feet', 'late nights finding something to eat'],
  ])('credits audible slant landings: %s / %s', (a, b) => {
    const e = endingEvidence(a, b)
    expect(e.strength).toBeGreaterThanOrEqual(0.65)
    expect(category([a, b]).reasons.join(' ')).toContain(e.a)
  })
  it('shows phrase evidence instead of calling two single written words a multi', () => {
    const e = endingEvidence('Kid in the backseat', 'tryna get max speed')
    expect(e.syllables).toBeGreaterThanOrEqual(2)
    expect(e.b).toBe('max speed')
    expect(e.kind).toContain('multisyllabic')
  })
  it('does not confuse shared unstressed endings with real rhymes', () => {
    expect(endingEvidence('I want money', 'doing it for family').strength).toBeLessThan(0.5)
    expect(category(['I count the money', 'I count the money']).score).toBeLessThan(
      category(['Fast cash, out the flats', 'Back with a bag full of stacks']).score,
    )
    expect(endingEvidence('look at the sea', 'all I can see').strength).toBe(0)
  })
  it('deduplicates internal rhyme spam and reports repeated families', () => {
    const e = rhymeEvidence([
      'fast cash fast cash',
      'cash fast cash fast',
      'dash back to the stash',
    ])
    expect(e.internal.filter((p) => [p.a, p.b].sort().join('/') === 'cash/fast')).toHaveLength(1)
    expect(e.families.length).toBeGreaterThan(0)
  })
  it('labels pronunciation guesses honestly', () => {
    expect(endingEvidence('got my blorple', 'still chasing shmorple').confidence).toBe('low')
    expect(category(['got my blorple', 'still chasing shmorple']).confidence).toBe('low')
  })
  it('rhyme-run hits require two different spoken words, with an excerpt', () => {
    const prompts = [{ word: '-AY', target: 'day', bar: 0 }]
    const timed = (s: string) =>
      s.split(' ').map((text, i) => ({ text, start: i * 0.25, end: (i + 1) * 0.25 }))
    expect(promptHits(prompts, timed('day day day'), 4, 2)[0].hit).toBe(false)
    const hit = promptHits(prompts, timed('one day I found my way'), 4, 2)[0]
    expect(hit.hit).toBe(true)
    expect(hit.evidence[0]).toContain('way')
    expect(promptHits(prompts, timed('money car school'), 4, 2)[0].hit).toBe(false)
  })
  it('creates reproducible rhyme plans and fresh sequences for a new seed', () => {
    const a = planPrompts('medium', 16, 17, null, 'personal', 'rhyme')
    expect(a.every((p) => p.target)).toBe(true)
    expect(a).toEqual(planPrompts('medium', 16, 17, null, 'personal', 'rhyme'))
    expect(a).not.toEqual(planPrompts('medium', 16, 18, null, 'personal', 'rhyme'))
  })
  it('rejects wordy multi-task AI challenges', () => {
    const ctx = { topic: 'money', rounds: [], totalRounds: 4, storyDirection: 'money' }
    expect(validChallenge('Write 2 bars about a bill draining your money.', ctx)).toBeTruthy()
    expect(validChallenge('Write 2 bars about money. Then add a complex multi.', ctx)).toBeNull()
    expect(
      validChallenge(
        'Write 2 bars about a recurring expense or debt that is costing your family more than they can afford while showing its emotional consequences.',
        ctx,
      ),
    ).toBeNull()
  })
})
