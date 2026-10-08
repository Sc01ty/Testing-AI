import { beforeEach, describe, expect, it, vi } from 'vitest'

const reply = { text: '' }
vi.mock('./localModel', () => ({
  localModel: { ready: true, chat: vi.fn(async () => reply.text) },
}))

const { llmDirector } = await import('./llmDirector')

const ctx = {
  topic: 'wanting money',
  totalRounds: 8,
  storyDirection: 'wanting money',
  rounds: [{ challenge: { prompt: 'Write 2 bars about wanting money.', focus: [], storyBeat: '', source: 'basic' as const }, lyrics: ['I finally made enough to get my mum out the flats', 'Every bill paid now we never looking back'] as [string, string] }],
}

describe('AI director safety net', () => {
  beforeEach(() => {
    reply.text = ''
  })

  it('uses a good, on-focus challenge from the model', async () => {
    reply.text = JSON.stringify({ reaction: 'Getting your mum out is the real win here.', next_challenge: "Write 2 bars about the first night your mum slept in the new place.", story_direction: 'money for family' })
    const out = await llmDirector.afterRound(ctx)
    expect(out.next?.source).toBe('local-ai')
    expect(out.next?.prompt).toContain('mum')
    expect(out.analysis).toContain('mum')
  })

  it('rejects an off-focus challenge and falls back to the rules (labelled basic)', async () => {
    reply.text = JSON.stringify({ reaction: 'Nice.', next_challenge: "Write 2 bars about finding a wallet in the trash.", story_direction: 'x' })
    const out = await llmDirector.afterRound(ctx)
    expect(out.next?.source).toBe('basic')
    expect(out.next?.prompt.toLowerCase()).toContain('mum')
  })

  it('rejects lyrics and garbage', async () => {
    reply.text = JSON.stringify({ reaction: 'ok', next_challenge: 'My mum is the queen of the flats\nI bought her a crown and some fancy hats', story_direction: 'x' })
    expect((await llmDirector.afterRound(ctx)).next?.source).toBe('basic')
    reply.text = JSON.stringify({ reaction: 'ok', next_challenge: 'My mum is the queen of the flats I bought her a crown', story_direction: 'x' })
    expect((await llmDirector.afterRound(ctx)).next?.source).toBe('basic')
    reply.text = 'not json at all'
    const out = await llmDirector.afterRound(ctx)
    expect(out.next?.source).toBe('basic')
    expect(out.analysis.length).toBeGreaterThan(5)
  })
})
