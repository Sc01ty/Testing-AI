import type { Challenge } from '../domain/types'
import { contentWords, stem, words } from '../lyrics/text'
import { peopleIn, themesIn, topicWords } from '../lyrics/themes'
import { STAGE_LABEL, stageFor } from './arc'
import { basicAnalysis, basicHelp, basicNextChallenge, chooseFocus, storyDirectionFor } from './basicDirector'
import { localModel } from './localModel'
import type { Director, DirectorContext, DirectorOutput, HelpContext, HelpKind } from './types'

/**
 * Director backed by the in-browser model. The model only does the
 * creative bit — read the song, point it somewhere specific. Everything
 * it returns is validated; anything off-brief (writes lyrics, ignores the
 * song, too long, repeats) falls back to the rule-based director, and
 * the challenge is labelled with whichever actually produced it.
 */
/** Tunable at runtime (tests on slow emulated GPUs need longer). */
export const aiConfig = { timeoutMs: 45_000, helpTimeoutMs: 30_000 }

const SYSTEM = `You direct a rap game. The player writes a song 2 bars at a time. You never write lyrics for them.
Reply with JSON:
- "reaction": one short sentence to the player about their latest bars (say "you"/"your").
- "next_challenge": one sentence telling them what their NEXT 2 bars should be about. It must be about the FOCUS you are given and push the story on. Start with "Write 2 bars".
- "story_direction": 3-8 words, where the song is heading.

Example 1
Latest bars: "Dad's old Corsa still parked outside / Haven't touched the keys since the day he died"
FOCUS: their dad (just mentioned). Stage: go deeper.
{"reaction": "That parked car says everything about losing him.", "next_challenge": "Write 2 bars about the last drive you took with your dad.", "story_direction": "chasing money while grieving dad"}

Example 2
Latest bars: "Rent's late again, landlord banging on the door / Counting coins on the kitchen floor"
FOCUS: something that could stop them. Stage: the obstacle.
{"reaction": "You made the pressure feel real.", "next_challenge": "Write 2 bars about the day the eviction letter landed.", "story_direction": "from broke to nearly homeless"}`

const SCHEMA = {
  type: 'object',
  properties: {
    reaction: { type: 'string' },
    next_challenge: { type: 'string' },
    story_direction: { type: 'string' },
  },
  required: ['reaction', 'next_challenge', 'story_direction'],
}

const FAMILY_ALIASES: Record<string, string[]> = {
  mum: ['mum', 'mom', 'mother', 'mama', 'her'],
  mom: ['mum', 'mom', 'mother', 'mama', 'her'],
  dad: ['dad', 'father', 'pops', 'him'],
  brother: ['brother', 'bro', 'him'],
  sister: ['sister', 'sis', 'her'],
}

/** Reject anything that isn't a short, original instruction about the song. */
export function validChallenge(text: string, ctx: DirectorContext): string | null {
  let t = text.replace(/\s+/g, ' ').trim().replace(/^["“']|["”']$/g, '')
  if (!t) return null
  const n = words(t).length
  if (n < 5 || n > 34) return null
  // looks like lyrics: line breaks, slashes between lines, or long quoted passages
  if (/\n|\s\/\s/.test(text) || /["“][^"”]{40,}["”]/.test(t)) return null
  // must be an instruction ("Write 2 bars about…"), optionally after a short lead-in — never bars themselves
  if (!/\b(write|rap|spit|give me)\s+(2|two)\s+bars?\b/i.test(t)) return null
  const prev = ctx.rounds.map((r) => r.challenge.prompt.toLowerCase())
  if (prev.includes(t.toLowerCase())) return null
  if (!/[.?!]$/.test(t)) t += '.'
  return t
}

/** Does the challenge actually connect to the song? (Shares a word/person/theme with the bars or topic.) */
function connected(challenge: string, ctx: DirectorContext) {
  const all = `${ctx.topic} ${ctx.rounds.map((r) => r.lyrics.join(' ')).join(' ')}`
  const songStems = new Set([...contentWords(all), ...topicWords(ctx.topic)].map(stem))
  const cs = contentWords(challenge).map(stem)
  if (cs.some((s) => songStems.has(s))) return true
  const songThemes = themesIn(all)
  return [...themesIn(challenge).keys()].some((t) => songThemes.has(t))
}

function focusFrom(challenge: string, ctx: DirectorContext) {
  const latest = ctx.rounds[ctx.rounds.length - 1]?.lyrics.join(' ') ?? ''
  const songStems = new Set([...contentWords(latest), ...topicWords(ctx.topic)].map(stem))
  const fromChallenge = contentWords(challenge).filter((w) => songStems.has(stem(w)) || themesIn(w).size)
  const people = peopleIn(challenge)
  return [...new Set([...people.map((p) => p.toLowerCase()), ...fromChallenge])].slice(0, 5)
}

function parse(raw: string): { reaction?: string; next_challenge?: string; story_direction?: string } | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch {
    return null
  }
}

export const llmDirector: Director = {
  source: 'local-ai',

  async afterRound(ctx: DirectorContext): Promise<DirectorOutput> {
    const nextIndex = ctx.rounds.length
    const fallback = (): DirectorOutput => ({ analysis: basicAnalysis(ctx), next: basicNextChallenge(ctx), storyDirection: storyDirectionFor(ctx) })
    if (!localModel.ready) return fallback()
    const done = nextIndex >= ctx.totalRounds
    const stage = stageFor(nextIndex, ctx.totalRounds)
    const focus = chooseFocus(ctx)
    const latest = ctx.rounds[ctx.rounds.length - 1]
    const earlier = ctx.rounds.slice(-3, -1).map((r) => `${r.lyrics[0]} / ${r.lyrics[1]}`)
    const user = `Song topic: ${ctx.topic}
${earlier.length ? `Earlier bars:\n${earlier.join('\n')}\n` : ''}Latest bars:
${latest.lyrics[0]}
${latest.lyrics[1]}
${done ? 'The song is finished — next_challenge can be "".' : `FOCUS: ${focus.label}. Stage: ${STAGE_LABEL[stage]}.`}
Output JSON only.`
    let out: ReturnType<typeof parse> = null
    try {
      out = parse(
        await localModel.chat(
          [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
          { maxTokens: 120, temperature: 0.5, jsonSchema: SCHEMA, timeoutMs: aiConfig.timeoutMs },
        ),
      )
    } catch {
      out = null
    }
    if (!out) return fallback()

    const reaction = (out.reaction ?? '').replace(/\s+/g, ' ').trim()
    const analysis = reaction && words(reaction).length >= 3 && words(reaction).length <= 24 && !/\n/.test(reaction) ? reaction : basicAnalysis(ctx)
    const storyDirection = (out.story_direction ?? '').trim().slice(0, 80) || storyDirectionFor(ctx)
    if (done) return { analysis, next: null, storyDirection }

    const prompt = validChallenge(out.next_challenge ?? '', ctx)
    // it must actually be about the focus (e.g. mention "mum") and connect to the song — otherwise the rules take over
    const onFocus = !prompt || !focus.keyword || words(prompt).some((w) => stem(w) === stem(focus.keyword!) || (FAMILY_ALIASES[focus.keyword!] ?? []).includes(w))
    if (!prompt || !onFocus || !connected(prompt, ctx)) return { analysis, next: basicNextChallenge(ctx), storyDirection }
    const next: Challenge = { prompt, focus: focusFrom(prompt, ctx), storyBeat: STAGE_LABEL[stage], source: 'local-ai' }
    return { analysis, next, storyDirection }
  },

  async help(kind: HelpKind, ctx: HelpContext): Promise<string> {
    // rhyme lists and hints are better from the deterministic helper (and can't leak bars)
    if (kind === 'rhyme' || !localModel.ready) return basicHelp(kind, ctx)
    const ask =
      kind === 'explain'
        ? 'Explain what this challenge is asking for and how they might approach it.'
        : kind === 'hint'
          ? 'Give a conceptual hint: a question to think about or an angle to take.'
          : kind === 'story'
            ? 'Summarise where the story is and suggest a direction for the next bars.'
            : `Answer their question: ${ctx.question}`
    const user = `Topic: ${ctx.topic}
Current challenge: ${ctx.current.prompt}
${ctx.rounds.length ? `Song so far:\n${ctx.rounds.map((r) => r.lyrics.join(' / ')).join('\n')}` : 'No bars yet.'}
${ctx.draft.some((l) => l.trim()) ? `What they've drafted: ${ctx.draft.join(' / ')}` : ''}

${ask}
Rules: do NOT write any lyrics, rhymes or example lines for them. Max 55 words. Plain sentences.`
    try {
      const text = (
        await localModel.chat(
          [
            { role: 'system', content: 'You are a supportive rap coach. You teach and give hints but you never write bars for the player.' },
            { role: 'user', content: user },
          ],
          { maxTokens: 110, temperature: 0.6, timeoutMs: aiConfig.helpTimeoutMs },
        )
      ).trim()
      // guard: anything that looks like bars (multiple short lines / quoted lines) → deterministic answer
      const lines = text.split('\n').filter((l) => l.trim())
      if (!text || lines.length > 4 || /["“].{25,}["”]/.test(text) || words(text).length > 90) return basicHelp(kind, ctx)
      return text
    } catch {
      return basicHelp(kind, ctx)
    }
  },
}
