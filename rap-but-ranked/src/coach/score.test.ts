import { describe, expect, it } from 'vitest'
import type { Challenge } from '../domain/types'
import { analyseBars } from './analyse'
import { assistanceSummary, scoreBars } from './score'

const challenge: Challenge = { prompt: 'Write 2 bars about wanting money.', focus: ['money'], storyBeat: 'setup', source: 'basic' }
const prev: [string, string][] = [['I want the money so my mum can rest', 'She works the night shift and she does her best']]

function score(lines: [string, string], previous = prev, extra: Partial<Parameters<typeof scoreBars>[0]> = {}) {
  const analysis = analyseBars({ lines, topic: 'wanting money', previous, focus: challenge.focus, secondsPerBar: 2.6 })
  return scoreBars({ ctx: { lyrics: lines, challenge, topic: 'wanting money', previous: previous.map((l) => ({ lyrics: l, challenge })) }, analysis, ...extra })
}

describe('writing score principles', () => {
  it('a plain connector bar is not punished for having no wordplay', () => {
    const r = score(['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough'])
    expect(r.categories.some((c) => c.category === 'wordplay')).toBe(false)
    expect(r.coach.strengths.join(' ')).toMatch(/connector/)
    expect(r.writingScore).toBeGreaterThanOrEqual(60)
  })

  it('wordplay can lift the writing score but never lower it', () => {
    const r = score(['I got interest in the money that the bank keeps', "And I'm curious who's watching while the city sleeps"])
    const wp = r.categories.find((c) => c.category === 'wordplay')
    expect(wp).toBeDefined()
    const without = r.categories.filter((c) => !['wordplay', 'performance'].includes(c.category))
    expect(r.writingScore).toBeGreaterThanOrEqual(Math.min(...without.map((c) => c.score)))
  })

  it('more rhymes is not automatically better: internal rhyme has diminishing returns', () => {
    const one = score(['Money in the morning, I been grinding every night', 'Mum still working but the future looking bright']).categories.find((c) => c.category === 'rhyme')!
    const lots = score(['Cash in a flash, I dash to the stash with the cash', 'The way that I play, I pay for the day every day']).categories.find((c) => c.category === 'rhyme')!
    expect(lots.score - one.score).toBeLessThanOrEqual(25)
  })

  it('rhyme-first filler becomes the coaching focus, explained — not replaced with a bar', () => {
    const r = score(['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'])
    expect(r.coach.focus?.skill).toBe('meaning-first')
    expect(r.coach.focus?.note).toMatch(/fright/)
    expect(r.coach.focus?.note).not.toMatch(/\btry: |replace it with/i)
  })

  it('a cadence sketch is not judged as bad lyrics', () => {
    const r = score(['da-da-DA-da-da-da-AY-in', 'na na NA na na na DAY-in'])
    expect(r.coach.analysis.cadenceSketch).toBe(true)
    expect(r.coach.focus?.skill).not.toBe('meaning-first')
    expect(r.categories.find((c) => c.category === 'meaning')!.reasons[0]).toMatch(/cadence sketch/)
  })
})

describe('performance honesty', () => {
  it('without a recording there is no performance score at all', () => {
    const r = score(['Mum worked two jobs just to keep the heating on', 'I counted every coin she left me on the table'])
    expect(r.performanceScore).toBeNull()
    expect(r.categories.some((c) => c.basis === 'audio')).toBe(false)
    expect(r.score).toBe(r.writingScore)
  })

  it('never claims things a mic signal cannot measure', () => {
    const sr = 8000
    const spb = 0.65
    const samples = new Float32Array(sr * 6)
    for (let i = 0; i < samples.length; i++) samples[i] = (i / sr) % spb < 0.2 ? 0.3 * Math.sin(i * 0.4) : 0
    const r = score(['Mum worked two jobs just to keep the heating on', 'I counted every coin she left me on the table'], prev, {
      performance: { samples, sampleRate: sr, beatTimeSec: 0, sectionStart: 0.65, sectionEnd: 5.85, secondsPerBeat: spb },
    })
    const perf = r.categories.find((c) => c.category === 'performance')!
    expect(perf.basis).toBe('audio')
    expect(perf.reasons.join(' ')).not.toMatch(/breath|tone|charisma|emotion|confiden|voice quality/i)
  })
})

describe('assistance', () => {
  it('is reported as context, not a penalty', () => {
    expect(assistanceSummary([{ mode: 'connections', level: 1, at: 0 }])).toBe('Completed with one semantic nudge.')
    expect(assistanceSummary([
      { mode: 'rhymes', level: 1, at: 0 },
      { mode: 'rhymes', level: 2, at: 1 },
      { mode: 'flip', level: 1, at: 2 },
    ])).toBe('Completed with 3 help requests (rhyme ×2, flip).')
    const lines: [string, string] = ['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough']
    const a = score(lines)
    const b = score(lines, prev, { assistance: [{ mode: 'rhymes', level: 3, at: 0 }] })
    expect(b.score).toBe(a.score)
    expect(b.feedback.join(' ')).toMatch(/help/)
  })
})
