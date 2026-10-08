import { localModel } from '../director/localModel'
import type { LyricContext } from '../scoring/lyricScore'
import type { PerformanceInput } from '../scoring/performance'
import { words } from '../lyrics/text'
import { renderContext, type CoachContext } from './context'
import { asksForBars, coachHelp, ghostwrites, type HelpInput } from './help'
import { rhymeWords } from './phonetics'
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, HELP_SCHEMA, HELP_SYSTEM, PROMPT_VERSION, analysisUser, helpUser } from './prompts'
import { scoreBars, type ScoredRound } from './score'
import type { AssistanceRecord, BarAnalysis, HelpResponse } from './types'

/**
 * The local model's half of the coach: language judgements the rules
 * can't make (is this word forced? does that double meaning land? is it
 * over-explained?). Everything it returns is parsed, repaired if it's
 * slightly broken JSON, validated and GROUNDED — any word it talks about
 * must actually be in the bars — and checked for ghostwriting. If any of
 * that fails, the rules' result stands, labelled as the rules'.
 */
export const coachConfig = { analysisTimeoutMs: 25_000, helpTimeoutMs: 25_000 }

// ── parse + repair ────────────────────────────────────────────────────
export function parseJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw) return null
  let t = raw.replace(/```(?:json)?/gi, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  t = t.slice(start, end + 1)
  const attempts = [t, t.replace(/,\s*([}\]])/g, '$1'), t.replace(/,\s*([}\]])/g, '$1').replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ': "$1"')]
  for (const a of attempts) {
    try {
      const v = JSON.parse(a)
      if (v && typeof v === 'object') return v as T
    } catch {
      /* next repair */
    }
  }
  return null
}

const str = (v: unknown, maxWords: number) => (typeof v === 'string' && v.trim() && words(v).length <= maxWords ? v.replace(/\s+/g, ' ').trim() : null)
const inBars = (word: unknown, bars: [string, string]) => typeof word === 'string' && words(`${bars[0]} ${bars[1]}`).includes(word.toLowerCase().replace(/[^a-z']/g, ''))

export interface ModelAnalysis {
  meaningClear: boolean
  says: string | null
  forced: { word: string; why: string }[]
  doubles: { word: string; meanings: [string, string]; explained: boolean }[]
  strongest: string | null
  nextStep: string | null
}

/** Validate + ground a raw model reply. Returns null if it's unusable. */
export function validateAnalysis(raw: unknown, bars: [string, string]): ModelAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.meaning_clear !== 'boolean') return null
  const own = [bars[0], bars[1]]
  const clean = (s: string | null) => (s && !ghostwrites(s, own) ? s : null)
  const forced = (Array.isArray(r.forced_words) ? r.forced_words : [])
    .map((f) => f as Record<string, unknown>)
    .filter((f) => inBars(f.word, bars) && str(f.why, 30))
    .slice(0, 2)
    .map((f) => ({ word: String(f.word).toLowerCase(), why: str(f.why, 30)! }))
  const doubles = (Array.isArray(r.double_meanings) ? r.double_meanings : [])
    .map((d) => d as Record<string, unknown>)
    .filter((d) => inBars(d.word, bars) && Array.isArray(d.meanings) && d.meanings.length >= 2 && d.meanings.every((m) => str(m, 10)) && typeof d.explained === 'boolean')
    .slice(0, 2)
    .map((d) => ({ word: String(d.word).toLowerCase(), meanings: [String((d.meanings as string[])[0]), String((d.meanings as string[])[1])] as [string, string], explained: d.explained as boolean }))
  return {
    meaningClear: r.meaning_clear,
    says: clean(str(r.says, 20)),
    forced,
    doubles,
    // the "strongest" claim must point at something actually in the bars
    strongest: (() => {
      const s = clean(str(r.strongest, 24))
      return s && words(s).some((w) => w.length > 3 && inBars(w, bars)) ? s : null
    })(),
    nextStep: clean(str(r.next_step, 28)),
  }
}

/** Fold the model's judgement into the rules' analysis. The model wins on language questions; the rules keep the measurements. */
export function mergeAnalysis(a: BarAnalysis, m: ModelAnalysis): BarAnalysis {
  const forced = new Set(m.forced.map((f) => f.word))
  // rule filler flags: confirmed → likely; contradicted (bars are clear and the model didn't flag it) → dropped
  let filler = a.filler
    .map((f) => (forced.has(f.word) ? { ...f, confidence: 'likely' as const, engine: 'local-ai' as const } : f))
    .filter((f) => forced.has(f.word) || !m.meaningClear)
  // model-only forced words: only when they sit at a rhyme position (end of a line, or rhyming with another word)
  const endWords = [a.lines[0].endWord, a.lines[1].endWord]
  for (const f of m.forced) {
    if (filler.some((x) => x.word === f.word)) continue
    const atRhyme = endWords.includes(f.word) || [...words(a.lines[0].text), ...words(a.lines[1].text)].some((w) => w !== f.word && rhymeWords(w, f.word).score >= 0.7)
    if (atRhyme) filler = [...filler, { word: f.word, line: endWords[0] === f.word ? 0 : 1, reason: `“${f.word}” — ${f.why}`, confidence: 'possible', engine: 'local-ai' }]
  }
  // double meanings: confirm rule candidates the model agrees with; add grounded new ones
  const doubles = new Map(m.doubles.map((d) => [d.word, d]))
  const wordplay = a.wordplay.map((w) => {
    const d = doubles.get(w.word)
    return d ? { ...w, confirmed: true, engine: 'local-ai' as const, note: `“${w.word}” works two ways: ${d.meanings[0]} / ${d.meanings[1]}${d.explained ? ' — but the bars explain it, which takes the sting out' : ''}.` } : w
  })
  for (const d of m.doubles)
    if (!wordplay.some((w) => w.word === d.word))
      wordplay.push({ kind: 'double-duty', word: d.word, senses: d.meanings, support: [], note: `“${d.word}” works two ways: ${d.meanings[0]} / ${d.meanings[1]}${d.explained ? ' — but the bars explain it, which takes the sting out' : ''}.`, engine: 'local-ai', confirmed: true })
  return { ...a, filler, wordplay, connector: a.connector && !wordplay.length && !filler.length }
}

/**
 * Ask the model to refine a scored round. Resolves to the rules' result
 * (unchanged) whenever the model isn't ready, times out or answers badly.
 */
export async function refineWithModel(
  rules: ScoredRound,
  input: { ctx: LyricContext; context: CoachContext; performance?: Omit<PerformanceInput, 'lyricSyllables'> | null; assistance?: AssistanceRecord[] },
): Promise<ScoredRound & { promptVersion?: string }> {
  if (!localModel.ready || rules.coach.analysis.cadenceSketch) return rules
  const a = rules.coach.analysis
  const notes = [
    ...a.filler.map((f) => `possible filler: "${f.word}" (${f.reason})`),
    ...a.wordplay.map((w) => `possible ${w.kind}: "${w.word}" — ${w.senses.join(' / ')}`),
  ]
  let model: ModelAnalysis | null = null
  try {
    const raw = await localModel.chat(
      [
        { role: 'system', content: ANALYSIS_SYSTEM },
        { role: 'user', content: analysisUser(renderContext(input.context), input.ctx.lyrics, notes) },
      ],
      { maxTokens: 260, temperature: 0.2, jsonSchema: ANALYSIS_SCHEMA, timeoutMs: coachConfig.analysisTimeoutMs },
    )
    model = validateAnalysis(parseJson(raw), input.ctx.lyrics)
  } catch {
    model = null
  }
  if (!model) return rules
  const merged = mergeAnalysis(a, model)
  const rescored = scoreBars({ ctx: input.ctx, analysis: merged, performance: input.performance, assistance: input.assistance })
  const strengths = model.strongest ? [model.strongest, ...rescored.coach.strengths.filter((s) => s !== model!.strongest)].slice(0, 3) : rescored.coach.strengths
  const focus = rescored.coach.focus && model.nextStep ? { ...rescored.coach.focus, note: `${rescored.coach.focus.note} ${model.nextStep}` } : rescored.coach.focus
  const notes2 = [...(model.says ? [`Reads as: ${model.says}`] : []), ...rescored.coach.notes]
  const feedback = [...(strengths[0] ? [`${strengths[0].replace(/\.$/, '')}.`] : []), ...(focus ? [focus.note] : []), ...(rescored.coach.assistance ? [rescored.coach.assistance] : [])]
  return { ...rescored, feedback: feedback.length ? feedback : rescored.feedback, coach: { ...rescored.coach, engine: 'local-ai', strengths, focus, notes: notes2 }, promptVersion: PROMPT_VERSION.analysis }
}

/** RoundResult in, RoundResult out: the play loop's entry point for the model refine step. */
export async function refineRoundResult(
  result: import('../domain/types').RoundResult,
  input: { ctx: LyricContext; context: CoachContext; performance?: Omit<PerformanceInput, 'lyricSyllables'> | null; assistance?: AssistanceRecord[] },
): Promise<import('../domain/types').RoundResult> {
  if (!result.coach) return result
  const rules: ScoredRound = { categories: result.categories, writingScore: result.writingScore ?? result.score, performanceScore: result.performanceScore ?? null, score: result.score, rank: result.rank, feedback: result.feedback, coach: result.coach }
  const r = await refineWithModel(rules, input)
  if (r === rules) return result
  return { ...result, categories: r.categories, writingScore: r.writingScore, performanceScore: r.performanceScore, score: r.score, rank: r.rank, feedback: r.feedback, coach: r.coach }
}

// ── help ──────────────────────────────────────────────────────────────
/**
 * Help with the model on top of the rules: the deterministic sections
 * (rhyme families, worlds, cadence shape…) always stay; the model adds a
 * coaching message, questions and directions when it's ready and its
 * answer passes the ghostwriting guard.
 */
export async function coachHelpWithModel(input: HelpInput & { context: CoachContext; question?: string }): Promise<HelpResponse> {
  const mode = input.question ? 'ask' : input.mode
  // "write it for me" → never; coach toward their strongest idea instead
  if (input.question && asksForBars(input.question)) {
    const c = coachHelp({ ...input, mode: 'critique', level: 2 })
    const strongest = c.sections.find((s) => s.title === "What's working")?.items[0]
    return {
      ...c,
      message: `I won't write it — the point is that it's yours. ${strongest ? `Your strongest idea so far: ${strongest}.` : 'Start with what you actually want to say.'}`,
      sections: [...c.sections, { title: 'Directions to explore', items: coachHelp({ ...input, mode: 'connections', level: 2 }).sections.flatMap((s) => s.groups?.map((g) => `${g.label}: ${g.items.slice(0, 4).join(', ')}`) ?? []).slice(0, 3) }],
      yourMove: 'Try the line again with one of those directions.',
    }
  }
  const rules = input.question ? null : coachHelp(input)
  const modelModes = ['thought', 'critique', 'flip', 'connections', 'ask']
  if (!localModel.ready || !modelModes.includes(mode) || (rules && input.level === 1 && mode !== 'thought')) return rules ?? fallbackAnswer(input)
  const own = [...input.draft, input.challenge.prompt]
  try {
    const raw = await localModel.chat(
      [
        { role: 'system', content: HELP_SYSTEM },
        { role: 'user', content: helpUser(renderContext(input.context), mode, input.level, input.draft, input.question ? `Their question: ${input.question}` : input.word ? `Word they picked: ${input.word}` : '') },
      ],
      { maxTokens: 220, temperature: 0.5, jsonSchema: HELP_SCHEMA, timeoutMs: coachConfig.helpTimeoutMs },
    )
    const j = parseJson<{ message?: unknown; questions?: unknown; directions?: unknown; your_move?: unknown }>(raw)
    const message = str(j?.message, 50)
    // check the raw text (line breaks intact) — that's where bars hide
    if (!j || !message || ghostwrites(String(j.message), own)) return rules ?? fallbackAnswer(input)
    const questions = (Array.isArray(j.questions) ? j.questions : []).map((x) => str(x, 25)).filter((x): x is string => !!x && x.includes('?')).slice(0, 3)
    const directions = (Array.isArray(j.directions) ? j.directions : []).map((x) => str(x, 12)).filter((x): x is string => !!x).slice(0, 4)
    const items = [...questions, ...directions]
    const rawItems = [...(Array.isArray(j.questions) ? j.questions : []), ...(Array.isArray(j.directions) ? j.directions : [])].map(String)
    if (ghostwrites(items.join('\n'), own) || rawItems.some((x) => ghostwrites(x, own))) return rules ?? fallbackAnswer(input)
    const yourMove = str(j.your_move, 22)
    const base = rules ?? fallbackAnswer(input)
    return {
      ...base,
      engine: 'local-ai',
      message,
      sections: [...(items.length ? [{ title: 'Rap AI', items }] : []), ...base.sections],
      yourMove: yourMove && !ghostwrites(yourMove, own) ? yourMove : base.yourMove,
    }
  } catch {
    return rules ?? fallbackAnswer(input)
  }
}

const GLOSSARY: [RegExp, string][] = [
  [/invisible|hidden|double meaning|double.?duty/i, 'An invisible punchline sounds like a normal sentence but holds a second meaning the listener discovers — a double-duty word (racks: money AND racking your brain), a compressed chain (cheque → ink → squid) or a flip that bar two reveals. Hidden but discoverable: never explain it, but don’t make the leap so big nobody finds it.'],
  [/chain/i, 'A semantic chain moves through connected ideas (shooting → clips → picture → frame) instead of jumping randomly. Each word comes from the world of the one before, so the verse feels inevitable.'],
  [/filler|rhyme.?first/i, 'Rhyme-first filler is when the rhyme chooses the thought: you find a word that rhymes, then invent a sentence to justify it. The test: if the rhyme disappeared, would this word still have a reason to be in the verse?'],
  [/internal rhyme/i, 'Internal rhyme = rhymes inside the bar, not just at the end. It makes a verse dense without forcing the end words.'],
  [/multi|multisyll/i, 'A multisyllabic rhyme matches two or more syllables in a row — and can cross word boundaries ("vision for me" / "mission to see").'],
  [/slant|near rhyme/i, 'A slant rhyme shares the stressed vowel with a looser ending ("flats" / "stacks"). It opens up far more word choices than perfect rhymes.'],
  [/cadence|flow|pocket|mumble/i, 'Cadence-first writing: find the rhythm first (mumble it: da-da-DA…), then the sound shape and rhyme pocket, then the meaning, then the real words — keeping the hits where they were.'],
  [/natural/i, 'Naturalness: would a person actually say it like that? Bending word order to land a rhyme ("the money I did get") reads as forced, however clever.'],
  [/setup|payoff|callback/i, 'Setup and payoff: bar one plants an image or word; a later bar pays it off with a twist. A callback brings an earlier detail back so the song feels built, not listed.'],
  [/score|rank|judg/i, 'Writing and performance are scored separately. Writing: meaning, rhyme (by sound), cadence, naturalness, structure, originality, and wordplay only when you attempt it. Performance: what the mic can measure — timing on the beat, filling the bars, dead gaps. Help you used is noted, never punished.'],
]

function fallbackAnswer(input: HelpInput & { question?: string }): HelpResponse {
  const q = input.question ?? ''
  const hit = GLOSSARY.find(([re]) => re.test(q))
  return {
    mode: 'thought',
    level: input.level,
    engine: 'rules',
    message: hit ? hit[1] : 'The rules-based coach knows rap craft terms (invisible punchlines, chains, filler, multis, slant and internal rhyme, cadence, naturalness, setup/payoff). For your bars, try THOUGHT, CRITIQUE or FLIP.',
    sections: [],
    yourMove: 'Pick a mode above for help with your actual bars.',
    canGoDeeper: false,
  }
}

export { fallbackAnswer as glossaryAnswer }
