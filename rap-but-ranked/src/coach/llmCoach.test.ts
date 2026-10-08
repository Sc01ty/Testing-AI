import { beforeEach, describe, expect, it, vi } from 'vitest'

const model = { ready: true, text: '', calls: 0 }
vi.mock('../director/localModel', () => ({
  localModel: {
    get ready() {
      return model.ready
    },
    chat: vi.fn(async () => {
      model.calls++
      return model.text
    }),
  },
}))

const { coachHelpWithModel, mergeAnalysis, parseJson, refineWithModel, validateAnalysis } = await import('./llmCoach')
const { analyseBars } = await import('./analyse')
const { scoreBars } = await import('./score')
const { buildCoachContext } = await import('./context')

const challenge = { prompt: 'Write 2 bars about wanting money.', focus: ['money'], storyBeat: 'setup', source: 'basic' as const }
function setup(lines: [string, string]) {
  const ctx = { lyrics: lines, challenge, topic: 'wanting money', previous: [] }
  const analysis = analyseBars({ lines, topic: 'wanting money', previous: [], focus: ['money'], secondsPerBar: 2.6 })
  const rules = scoreBars({ ctx, analysis })
  const context = buildCoachContext({ topic: 'wanting money', barsTotal: 8, barsDone: 0, storyDirection: 'wanting money', previous: [], challenge, bars: lines })
  return { ctx, rules, context }
}

beforeEach(() => {
  model.ready = true
  model.text = ''
  model.calls = 0
})

describe('parsing and repair', () => {
  it('repairs code fences, trailing commas and single quotes; gives up on garbage', () => {
    expect(parseJson('```json\n{"a": 1,}\n```')).toEqual({ a: 1 })
    expect(parseJson("{'a': 'b'}")).toEqual({ a: 'b' })
    expect(parseJson('the bars are good')).toBeNull()
  })
})

describe('grounding', () => {
  it('drops claims about words that are not in the bars', () => {
    const v = validateAnalysis(
      { meaning_clear: true, says: 'wants money for mum', forced_words: [{ word: 'banana', why: 'random' }], double_meanings: [{ word: 'squid', meanings: ['a', 'b'], explained: false }], strongest: 'the word moonlight', next_step: 'Cut a word.' },
      ['I want the money for my mum', 'She worked so hard to keep us fed'],
    )!
    expect(v.forced).toEqual([])
    expect(v.doubles).toEqual([])
    expect(v.strongest).toBeNull() // talks about a word that isn't there
  })
  it('rejects a reply missing the required shape', () => {
    expect(validateAnalysis({ says: 'x' }, ['a', 'b'])).toBeNull()
  })
})

describe('refining a round', () => {
  it('model confirms a double meaning → wordplay confirmed, engine local-ai, score not lower', async () => {
    const s = setup(['I got interest in the money that the bank keeps', "And I'm curious who's watching while the city sleeps"])
    model.text = JSON.stringify({ meaning_clear: true, says: 'curious about money and the bank', forced_words: [], double_meanings: [{ word: 'interest', meanings: ['bank interest', 'curiosity'], explained: false }], strongest: 'interest works as money and curiosity', next_step: 'Keep the double meaning hidden like this.' })
    const r = await refineWithModel(s.rules, s)
    expect(r.coach.engine).toBe('local-ai')
    expect(r.coach.analysis.wordplay.find((w) => w.word === 'interest')?.confirmed).toBe(true)
    expect(r.writingScore).toBeGreaterThanOrEqual(s.rules.writingScore)
  })
  it('model says a flagged word is meaningful → the filler flag is dropped', async () => {
    const s = setup(['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'])
    expect(s.rules.coach.analysis.filler.length).toBe(1)
    model.text = JSON.stringify({ meaning_clear: true, says: 'a surreal scare while grinding', forced_words: [], double_meanings: [], strongest: 'the penguin is absurd and memorable', next_step: 'Tie the penguin back to money.' })
    const r = await refineWithModel(s.rules, s)
    expect(r.coach.analysis.filler).toEqual([])
  })
  it('malformed model output → the rules result stands, labelled rules', async () => {
    const s = setup(['Money on my mind, I been grinding every night', 'Then I saw a penguin and it gave me such a fright'])
    model.text = 'Great bars! 10/10'
    const r = await refineWithModel(s.rules, s)
    expect(r).toBe(s.rules)
    expect(r.coach.engine).toBe('rules')
  })
  it('no local AI → rules only, the model is never called', async () => {
    model.ready = false
    const s = setup(['Money on my mind', 'Grinding every night'])
    expect(await refineWithModel(s.rules, s)).toBe(s.rules)
    expect(model.calls).toBe(0)
  })
  it('mergeAnalysis keeps measurements from the rules', () => {
    const s = setup(['Money on my mind', 'Grinding every night'])
    const merged = mergeAnalysis(s.rules.coach.analysis, { meaningClear: true, says: null, forced: [], doubles: [], strongest: null, nextStep: null })
    expect(merged.rhyme).toEqual(s.rules.coach.analysis.rhyme)
    expect(merged.cadence).toEqual(s.rules.coach.analysis.cadence)
  })
})

describe('help with the model', () => {
  const draft: [string, string] = ['Counting every penny that I saved up in the jar', '']
  const input = (extra: object = {}) => ({ mode: 'thought' as const, level: 2 as const, challenge, topic: 'wanting money', previous: [], draft, context: setup(draft).context, ...extra })

  it('a model reply that slips in bars is rejected — rules help is used instead', async () => {
    model.text = JSON.stringify({ message: 'Here you go:\nCounting every penny that I saved up in the jar\nOne day I will drive away in a shiny car', questions: [], directions: [], your_move: 'Use it.' })
    const r = await coachHelpWithModel(input())
    expect(r.engine).toBe('rules')
  })
  it('a good coaching reply is used, labelled Rap AI, on top of the rules sections', async () => {
    model.text = JSON.stringify({ message: 'The jar is a strong, specific image — who filled it, and what is it for?', questions: ['Who taught you to save like that?'], directions: ['the jar as a promise', 'the jar vs a bank'], your_move: 'Answer one question in plain words first.' })
    const r = await coachHelpWithModel(input())
    expect(r.engine).toBe('local-ai')
    expect(r.sections[0].title).toBe('Rap AI')
  })
  it('"help me finish this" never gets bars — it gets the strongest idea and directions', async () => {
    const r = await coachHelpWithModel(input({ question: 'help me finish this' }))
    expect(r.message).toMatch(/won't write it/)
    expect(r.yourMove).toMatch(/Try the line again/)
    expect(model.calls).toBe(0)
  })
})
