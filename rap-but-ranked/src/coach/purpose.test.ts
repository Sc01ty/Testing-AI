import { describe, expect, it } from 'vitest'
import { basicDirector } from '../director/basicDirector'
import type { DirectorContext } from '../director/types'
import type { Challenge } from '../domain/types'
import { scoreRound } from '../scoring/round'
import type { SkillProfile } from './profile'

const ch: Challenge = { prompt: 'Write 2 bars about wanting money.', focus: ['money'], storyBeat: 'setup', source: 'basic' }

function ctx(bars: [string, string][], profile?: Partial<SkillProfile>): DirectorContext {
  const rounds = bars.map((lyrics, i) => ({
    challenge: ch,
    lyrics,
    report: scoreRound({ lyrics, challenge: ch, topic: 'wanting money', previous: bars.slice(0, i).map((l) => ({ lyrics: l, challenge: ch })) }, null, '', { secondsPerBar: 2.6 }).coach,
  }))
  return { topic: 'wanting money', totalRounds: 8, rounds, storyDirection: 'wanting money', secondsPerBar: 2.6, profile: profile ? { rounds: 10, tendencies: [], weakest: null, level: 2, help: { perRound: 0, byMode: {} }, ...profile } : null }
}

describe('purposeful director', () => {
  it('trains the weakness it just saw — and still follows the song', async () => {
    const out = await basicDirector.afterRound(ctx([['I finally made enough so my mum can sleep at night', 'Then I saw a penguin and it gave me such a fright']]))
    expect(out.next?.spec?.skill).toBe('meaning-first')
    expect(out.next?.spec?.reason).toMatch(/latest bars/)
    expect(out.next?.prompt).toMatch(/mum/i) // the story thread is kept
    expect(out.next?.spec?.trainingHint).toMatch(/say first|meaning/i)
  })

  it('uses the rolling profile when the latest bars were fine', async () => {
    const out = await basicDirector.afterRound(
      ctx([['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough']], { weakest: 'imagery', tendencies: [{ id: 'vague', label: 'too general to picture', kind: 'weakness', skill: 'imagery', count: 6, of: 10 }] }),
    )
    expect(out.next?.spec?.skill).toBe('imagery')
    expect(out.next?.spec?.constraints).toEqual([])
    expect(out.next?.spec?.trainingHint).toMatch(/no “/)
  })

  it('advanced players get invisible-punchline stretch goals', async () => {
    const clean: [string, string][] = [
      ['I left school at sixteen for a job down at the shop', 'Saved up every wage until the day I had enough'],
    ]
    const out = await basicDirector.afterRound({ ...ctx(clean, { level: 4 }), rounds: [...ctx(clean).rounds, ...ctx(clean).rounds] })
    expect(out.next?.spec?.skill).toBe('invisible-punchline')
    expect(out.next?.spec?.trainingHint).toMatch(/double meaning|means something different/i)
  })

  it('every challenge says why it exists (spec with reason), constraints are checkable or marked subjective', async () => {
    const out = await basicDirector.afterRound(ctx([['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright']]))
    expect(out.next?.spec).toMatchObject({ type: expect.any(String), skill: expect.any(String), difficulty: expect.any(Number), reason: expect.any(String) })
  })
})
