import { describe, expect, it } from 'vitest'
import type { CategoryScore, Round, Session } from '../domain/types'
import { analyseTrack, barTwoTurns, fillTheBar, internalRhyme, sameRhymeFourLines, withoutWords } from './analyse'

function cat(category: CategoryScore['category'], score: number, reasons: string[] = ['—']): CategoryScore {
  return { category, label: category, score, basis: category === 'flow' ? 'audio' : 'lyrics', reasons }
}

function track(bars: [string, string][], scores: Partial<Record<string, number>> = {}, topic = 'wanting money'): Session {
  const rounds: Round[] = bars.map((lyrics, index) => ({
    index,
    challenge: { prompt: `Write 2 bars about ${topic}.`, focus: ['money'], storyBeat: 'open', source: 'basic' },
    lyrics,
    take: null,
    result: {
      categories: [cat('rhyme', scores.rhyme ?? 70), cat('prompt', scores.prompt ?? 70), cat('story', scores.story ?? 70), cat('flow', scores.flow ?? 65), cat('originality', scores.originality ?? 65)],
      score: 70,
      rank: 'B',
      feedback: [],
      analysis: '',
      scoredAt: 0,
    },
  }))
  return {
    id: 's',
    trackName: 'T',
    beatId: 'b',
    beatName: 'B',
    beatGrid: { bpm: 90, introOffset: 0, durationSec: 120, beatsPerBar: 4 },
    startingTopic: topic,
    length: (bars.length * 2) as Session['length'],
    rounds,
    storyDirection: '',
    status: 'complete',
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('analyseTrack', () => {
  it('spots bar two repeating bar one, and sets an exercise for it', () => {
    const r = analyseTrack(
      track([
        ['I want the money and the money want me', 'Yeah I want the money, the money want me'],
        ['Money on the table, money in the bank', 'Money in the bank and money on the table'],
        ['Chasing paper every single day', 'Every single day I am chasing paper'],
        ['Mum in the flats with the lights cut off', 'Lights cut off for mum in the flats'],
      ]),
    )
    expect(r.weaknesses.map((w) => w.id)).toContain('echo')
    expect(r.exercises.map((e) => e.id)).toContain('bar-two-turns')
    expect(r.weaknesses.find((w) => w.id === 'echo')!.evidence).toMatch(/→/)
  })

  it('tells end-only rhymers to rhyme inside the bar', () => {
    const r = analyseTrack(
      track([
        ['I wake up early and I go to the station', 'Working all day for a little bit of patience'],
        ['My mum never had it, she worked for the night', 'I promised her one day we would be alright'],
        ['They told me give up, I was never the one', 'Now look at me shining as bright as the sun'],
        ['A bus pass, a dream and a pen in my hand', 'Writing the future the way that I planned'],
      ]),
    )
    expect(r.strengths.map((s) => s.id)).toContain('end-rhymes')
    expect(r.weaknesses.map((w) => w.id)).toContain('end-only')
    expect(r.exercises.map((e) => e.id)).toContain('internal-rhyme')
  })

  it('credits internal rhymes when they are there', () => {
    const r = analyseTrack(
      track([
        ['Cash in a flash, I dash to the stash', 'Mum on the bus with a pass and a bag'],
        ['Late for the date, I wait at the gate', 'Fate on my plate, I celebrate'],
        ['Night in the light, I fight with my might', 'Bright like a kite in the height of the night'],
      ]),
    )
    expect(r.strengths.map((s) => s.id)).toContain('internal')
  })

  it('flags short bars for the tempo (the "gappy" cause)', () => {
    const r = analyseTrack(
      track([
        ['I want cash', 'not trash'],
        ['Mum smiles', 'for miles'],
        ['We grind', 'all the time'],
      ]),
    )
    expect(r.weaknesses.map((w) => w.id)).toContain('airy')
  })

  it('always gives something to work on and some stats', () => {
    const r = analyseTrack(track([['One line here for me', 'Another line I see']]))
    expect(r.exercises.length).toBeGreaterThanOrEqual(2)
    expect(r.thinkAbout.length).toBeGreaterThan(0)
    expect(r.stats.length).toBeGreaterThan(3)
  })
})

describe('exercise checks', () => {
  it('without-words catches the banned words', () => {
    const e = withoutWords('wanting money', ['cash'])
    expect(e.check(['I got cash in my pocket today', 'Spending it all on the way']).pass).toBe(false)
    expect(e.check(['Bills on the table, rent is due again', 'Counting coins at the bank till ten']).notes.join(' ')).toMatch(/No banned words/)
  })
  it('internal-rhyme needs a rhyme inside each bar', () => {
    const e = internalRhyme('money')
    expect(e.check(['Cash in a flash and I dash to the stash', 'Late for the date and I wait at the gate']).pass).toBe(true)
    expect(e.check(['I went to the shop today', 'And then I walked back home']).pass).toBe(false)
  })
  it('bar-two-turns rejects reused words', () => {
    const e = barTwoTurns('money')
    expect(e.check(['Rent is due and the fridge is bare', 'Rent is due so I sit and stare']).pass).toBe(false)
    expect(e.check(['Rent is due and the fridge is bare', 'Next year mum gets a house with stairs']).pass).toBe(true)
  })
  it('same-rhyme-4 wants four distinct rhyming endings', () => {
    const e = sameRhymeFourLines('night')
    expect(e.check(['Woke up late on a Monday night', 'Mum on the phone said it be alright', 'Bus pulled up in the fading light', 'Ticket in hand and the future bright']).pass).toBe(true)
    expect(e.check(['Woke up late on a Monday night', 'Woke up late on a Monday night', 'Bus pulled up and I took a seat', 'Then I went home']).pass).toBe(false)
  })
  it('fill-the-bar counts syllables', () => {
    const e = fillTheBar(10)
    expect(e.check(['I got up early and I caught the bus to town', 'My mum was waving from the window looking down']).pass).toBe(true)
    expect(e.check(['Cash now', 'Go wow']).pass).toBe(false)
  })
})
