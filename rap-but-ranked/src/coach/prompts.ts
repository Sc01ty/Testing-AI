/**
 * Prompt templates for the local model, versioned and kept out of the UI.
 * Bump a version when its wording changes, so stored analyses can be told
 * apart and prompts can be compared.
 */
export const PROMPT_VERSION = { analysis: 'coach.analysis.v1', help: 'coach.help.v1' } as const

const PRINCIPLES = `You are a rap writing coach inside a game. The player writes every lyric themselves.
Principles you coach by:
- Meaning before rhyme. A word that only exists because it rhymes is filler, even if the rhyme is good.
- Hidden but discoverable: the best double meanings sound like a normal sentence; if the rapper explains the joke it loses impact; if the leap is huge, nobody gets it.
- Mechanisms: double-duty words (one word, two meanings at once), compressed semantic chains (A leads to B leads to C, the listener fills the gap), two-line flips (bar 2 makes a word mean something new).
- Not every bar needs wordplay. A plain line that moves the story or sounds natural is good writing.
- Naturalness matters: wording bent to fit a rhyme is a flaw.
- Be specific: name the exact word or mechanism. No generic praise.
- NEVER write lyrics, example lines, rewrites or "try this" bars. Ask, point, diagnose.`

export const ANALYSIS_SYSTEM = `${PRINCIPLES}
Read the player's two bars in the context of their song and reply with JSON only.`

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    meaning_clear: { type: 'boolean' },
    says: { type: 'string' },
    forced_words: { type: 'array', items: { type: 'object', properties: { word: { type: 'string' }, why: { type: 'string' } }, required: ['word', 'why'] } },
    double_meanings: {
      type: 'array',
      items: { type: 'object', properties: { word: { type: 'string' }, meanings: { type: 'array', items: { type: 'string' } }, explained: { type: 'boolean' } }, required: ['word', 'meanings', 'explained'] },
    },
    strongest: { type: 'string' },
    next_step: { type: 'string' },
  },
  required: ['meaning_clear', 'says', 'forced_words', 'double_meanings', 'strongest', 'next_step'],
}

export function analysisUser(context: string, bars: [string, string], ruleNotes: string[]) {
  return `${context}

The player's bars:
1: ${bars[0]}
2: ${bars[1]}
${ruleNotes.length ? `\nThe rule checker flagged (confirm or reject each):\n${ruleNotes.map((n) => `- ${n}`).join('\n')}\n` : ''}
Reply with JSON:
- "meaning_clear": do the bars say one coherent thing?
- "says": what the bars say, in under 14 words, in your own words.
- "forced_words": words that seem to exist only to rhyme (word + why, max 2). Empty if none.
- "double_meanings": real double meanings in the bars (word, its two meanings, and whether the bars explain it). Empty if none — do not invent any.
- "strongest": the strongest specific thing, quoting one word from the bars (under 18 words).
- "next_step": one specific instruction for the next attempt (under 22 words). No lyrics.`
}

export const HELP_SYSTEM = `${PRINCIPLES}
The player asked for help while writing. Help them find THEIR line. Reply with JSON only.`

export const HELP_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    directions: { type: 'array', items: { type: 'string' } },
    your_move: { type: 'string' },
  },
  required: ['message', 'questions', 'directions', 'your_move'],
}

const HELP_ASK: Record<string, string> = {
  thought: 'Help them find what they actually want to say: ask targeted questions about the challenge and their song.',
  critique: 'Diagnose their draft: strongest part, weakest part, whether meaning or rhyme is driving it, forced wording, missed opportunities, and ONE next action. Do not rewrite anything.',
  flip: 'Help them find a second meaning in an important word of their draft: name the word, list its other meanings or sound-alikes as directions, and ask them to make the line.',
  connections: 'Show conceptual directions from the key word of their idea (related worlds and where two worlds collide), without writing a line.',
  ask: 'Answer their question as a coach.',
}

export function helpUser(context: string, mode: string, level: number, draft: [string, string], extra: string) {
  const depth = level === 1 ? 'one short nudge' : level === 2 ? 'a few directions' : 'a deeper walk-through of the thought process'
  return `${context}

Their draft so far:
1: ${draft[0] || '(empty)'}
2: ${draft[1] || '(empty)'}
${extra}
Task: ${HELP_ASK[mode] ?? HELP_ASK.ask} Give ${depth}.
Reply with JSON:
- "message": the main coaching line (under 45 words).
- "questions": 0-3 questions that make them think (each ends with "?").
- "directions": 0-4 short directions or semantic doors (each under 12 words; words or ideas, never a lyric line).
- "your_move": what they should do now (under 20 words).
Never write lyrics or example lines.`
}
