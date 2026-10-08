import { describe, expect, it } from 'vitest'
import { rhymeWords } from './phonetics'
import { asksForBars, coachHelp, ghostwrites, rhymeFamilies, type HelpInput } from './help'
import type { HelpLevel, HelpMode } from './types'
import { words } from '../lyrics/text'

const base: Omit<HelpInput, 'mode' | 'level'> = {
  challenge: { prompt: 'Write 2 bars about wanting money.', focus: ['money'] },
  topic: 'wanting money',
  previous: [['I want the money so my mum can rest', 'She works the night shift and she does her best']],
  draft: ['Counting every penny that I saved up in the jar', ''],
  secondsPerBar: 2.6,
}
const MODES: HelpMode[] = ['thought', 'connections', 'rhymes', 'flip', 'flow', 'critique']
const all = (r: ReturnType<typeof coachHelp>) => [r.message, r.yourMove, ...r.sections.flatMap((s) => [...s.items, ...(s.groups ?? []).flatMap((g) => g.items)])]

describe('help never writes the bar', () => {
  for (const mode of MODES)
    for (const level of [1, 2, 3] as HelpLevel[])
      it(`${mode} L${level}: no ready-made bar two`, () => {
        const r = coachHelp({ ...base, mode, level })
        const end = 'jar'
        for (const t of all(r)) {
          const ws = words(t)
          // a 6+ word line that lands on a rhyme for bar one's ending would be a finished bar 2
          // (numbered steps and lines addressed to "you" are instructions, not bars)
          if (ws.length >= 6 && !/[?:]$/.test(t.trim()) && !/^\d\./.test(t) && !/\byou(r)?\b/i.test(t)) expect(rhymeWords(ws[ws.length - 1], end).score).toBeLessThan(0.7)
        }
        expect(ghostwrites([r.message, r.yourMove].join('\n'), [...base.draft, base.challenge.prompt])).toBe(false)
      })
})

describe('progressive help', () => {
  it('level 1 is a single nudge; levels 2 and 3 open up more', () => {
    for (const mode of MODES) {
      const n = (l: HelpLevel) => all(coachHelp({ ...base, mode, level: l })).join(' ').length
      const l1 = coachHelp({ ...base, mode, level: 1 })
      expect(l1.sections).toEqual([])
      expect(words(l1.message).length).toBeLessThanOrEqual(45)
      expect(n(2)).toBeGreaterThan(n(1))
      expect(n(3)).toBeGreaterThanOrEqual(n(2))
    }
  })
})

describe('modes', () => {
  it('THOUGHT asks questions about why, what changes and what stops you', () => {
    const r = coachHelp({ ...base, draft: ['', ''], mode: 'thought', level: 2 })
    expect(r.sections[0].items.join(' ')).toMatch(/why/i)
    expect(r.sections[0].items.every((x) => x.includes('?'))).toBe(true)
  })
  it('CONNECTIONS shows worlds and where they collide (hours ↔ hourly in a money song)', () => {
    const r = coachHelp({ ...base, word: 'time', mode: 'connections', level: 2 })
    const coll = r.sections.find((s) => /Collisions/.test(s.title))
    expect(coll?.items.join(' ')).toMatch(/hour/)
  })
  it('RHYMES gives multis and slants, words not lines, with on-topic ones first', () => {
    const fam = rhymeFamilies('money', new Set(['money', 'family']))!
    expect(fam.multi).toContain('honey')
    const r = coachHelp({ ...base, word: 'money', mode: 'rhymes', level: 2 })
    const items = r.sections.flatMap((s) => (s.groups ?? []).flatMap((g) => g.items))
    expect(items.length).toBeGreaterThan(5)
    expect(items.every((x) => words(x).length <= 3)).toBe(true)
  })
  it('FLIP asks first, then shows other meanings — and never solves it', () => {
    expect(coachHelp({ ...base, word: 'change', mode: 'flip', level: 1 }).message).toMatch(/What else can “change” mean/)
    const r = coachHelp({ ...base, word: 'change', mode: 'flip', level: 2 })
    expect(r.sections[0].items.join(' ')).toMatch(/grow|transform/)
    expect(r.yourMove).toMatch(/Write the line yourself/)
  })
  it('FLOW reads a cadence sketch as rhythm and keeps the shape', () => {
    const r = coachHelp({ ...base, sketch: 'da-da-DA-da-da-da-AY-in', mode: 'flow', level: 2 })
    expect(r.message).toMatch(/8 syllables/)
    expect(r.message).toMatch(/da-da-DA/)
  })
  it('CRITIQUE names the strongest part, the weakest, and one next action — diagnosis, not a rewrite', () => {
    const r = coachHelp({ ...base, draft: ['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'], mode: 'critique', level: 3 })
    const text = all(r).join(' ')
    expect(text).toMatch(/fright/)
    expect(text).toMatch(/rhyme-first|If the rhyme disappeared/)
    expect(r.yourMove.length).toBeGreaterThan(10)
  })
})

describe('guards', () => {
  it('spots a model trying to hand over bars', () => {
    expect(ghostwrites('Try: "counting all my money while my mama sleeping sound"')).toBe(true)
    expect(ghostwrites('Late nights on the block with my hand on the clock\nEvery dollar that I stack is a brick I can lock')).toBe(true)
    expect(ghostwrites('Your strongest idea is the jar of pennies — it is specific. Think about who filled it, and why. Try the line again.')).toBe(false)
  })
  it('recognises "write it for me" requests', () => {
    expect(asksForBars('help me finish this')).toBe(true)
    expect(asksForBars('can you write my bars for me')).toBe(true)
    expect(asksForBars('what is a slant rhyme')).toBe(false)
  })
})
