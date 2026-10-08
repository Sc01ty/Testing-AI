import type { Challenge } from '../domain/types'
import { contentWords, lastWord, rhymeStrength, stem, words } from '../lyrics/text'
import { peopleIn, themeLabel, themesIn, topicWords } from '../lyrics/themes'
import { STAGE_GUIDE, STAGE_LABEL, stageFor, type ArcStage } from './arc'
import { RHYME_BANK } from './rhymeBank'
import type { Director, DirectorContext, DirectorOutput, HelpContext, HelpKind } from './types'

/**
 * Rule-based director. Not an LLM, and it doesn't pretend to be: it reads
 * the bars for people, themes and concrete details, then picks a challenge
 * template that calls back to them and fits the song's arc.
 */

const FAMILY = new Set(['mum', 'mom', 'mother', 'mama', 'dad', 'father', 'pops', 'brother', 'bro', 'sister', 'sis', 'son', 'daughter', 'nan', 'nana', 'gran', 'grandma', 'grandad', 'uncle', 'auntie', 'cousin', 'kids', 'wife'])

interface Hooks {
  person: string | null
  /** The person is new this round (never mentioned before) — always worth following. */
  personIsNew: boolean
  newThemes: string[]
  themes: string[]
  detail: string | null
}

function hooksFrom(ctx: DirectorContext): Hooks {
  const latest = ctx.rounds[ctx.rounds.length - 1]
  const text = latest ? `${latest.lyrics[0]} ${latest.lyrics[1]}` : ''
  const before = ctx.rounds.slice(0, -1).map((r) => `${r.lyrics[0]} ${r.lyrics[1]}`).join(' ')
  const people = peopleIn(text)
  const prevPeople = new Set(peopleIn(before))
  const fresh = people.find((p) => !prevPeople.has(p)) ?? null
  const person = fresh ?? people[0] ?? null
  const themes = [...themesIn(text).entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  const prevThemes = themesIn(before)
  const topicThemes = themesIn(ctx.topic)
  // "new" = not already in the song and not just the topic itself
  const newThemes = themes.filter((t) => !prevThemes.has(t) && !topicThemes.has(t))
  const topic = new Set(topicWords(ctx.topic).map(stem))
  const detail =
    contentWords(text)
      .filter((w) => w.length >= 5 && !topic.has(stem(w)) && !peopleIn(w).length)
      .sort((a, b) => b.length - a.length)[0] ?? null
  return { person, personIsNew: !!fresh, newThemes, themes, detail }
}

const your = (p: string) => (FAMILY.has(p.toLowerCase()) ? `your ${p}` : p)

type Template = { id: string; text: (h: Required<Pick<Hooks, never>> & { p: string; d: string; topic: string; theme: string }) => string; needs?: 'person' | 'detail' | 'theme' }

const BY_STAGE: Record<ArcStage, Template[]> = {
  open: [{ id: 'open', text: ({ topic }) => `Write 2 bars about ${topic}.` }],
  deepen: [
    { id: 'deepen-detail', needs: 'detail', text: ({ d }) => `You mentioned “${d}”. Write 2 bars that zoom in on it — what does it look like up close?` },
    { id: 'deepen-why', text: ({ topic }) => `Go deeper: write 2 bars about why ${topic} matters so much to you.` },
    { id: 'deepen-where', text: ({ topic }) => `Write 2 bars about where you were the first time ${topic} really hit you.` },
  ],
  people: [
    { id: 'people-for', needs: 'person', text: ({ p }) => `You mentioned ${p}. Write 2 bars about what you'd do for them if you made it.` },
    { id: 'people-see', needs: 'person', text: ({ p }) => `Write 2 bars about what ${p} sees when they look at you right now.` },
    { id: 'people-who', text: ({ topic }) => `Who is all this for? Write 2 bars about the person who keeps you chasing ${topic}.` },
  ],
  obstacle: [
    { id: 'obstacle-stop', text: () => `Now introduce something that could stop you getting there.` },
    { id: 'obstacle-doubt', text: () => `Write 2 bars about the people who doubted you — and what they said.` },
    { id: 'obstacle-cost', text: ({ theme }) => `Write 2 bars about what chasing ${theme} is costing you.` },
    { id: 'obstacle-person', needs: 'person', text: ({ p }) => `What if you let ${p} down? Write 2 bars about that fear.` },
  ],
  turn: [
    { id: 'turn-moment', text: () => `Write 2 bars about the moment everything changed.` },
    { id: 'turn-lesson', text: () => `Write 2 bars about the lesson it took you too long to learn.` },
    { id: 'turn-now', text: () => `Show the glow-up: write 2 bars about who you are now compared to then.` },
  ],
  return: [
    { id: 'return-start', text: ({ topic }) => `Bring the story back to where you started: ${topic} — but show how far you've come.` },
    { id: 'return-person', needs: 'person', text: ({ p, topic }) => `Final bars: bring it back to ${topic} and give ${p} the last word.` },
  ],
}

/** Theme-specific directions, used for 'deepen' when a clear theme shows up. */
const BY_THEME: Record<string, Template[]> = {
  money: [
    { id: 'money-buy', text: () => `You've got money on your mind. Write 2 bars about the first thing you'd buy — and why.` },
    { id: 'money-earn', text: () => `Write 2 bars about how you're actually going to earn it.` },
    { id: 'money-sacrifice', text: () => `Write 2 bars about what you'd sacrifice for the money.` },
  ],
  family: [{ id: 'family-mean', text: () => `Write 2 bars about what success would mean for your family.` }],
  struggle: [{ id: 'struggle-night', text: () => `Paint the struggle: write 2 bars about the hardest night.` }],
  success: [{ id: 'success-moment', text: () => `Write 2 bars about the moment you realise you've made it.` }],
  ambition: [{ id: 'ambition-plan', text: () => `Write 2 bars about the plan — step by step, how you get there.` }],
  love: [{ id: 'love-them', text: () => `Write 2 bars about what they mean to you that you've never said out loud.` }],
  betrayal: [{ id: 'betrayal-when', text: () => `Write 2 bars about the moment you realised they switched on you.` }],
  friends: [{ id: 'friends-day-one', text: () => `Write 2 bars about who was there from day one.` }],
  regret: [{ id: 'regret-redo', text: () => `Write 2 bars about the one thing you'd do differently.` }],
  city: [{ id: 'city-paint', text: () => `Write 2 bars that put us on your street — sights, sounds, smells.` }],
  school: [{ id: 'school-teacher', text: () => `Write 2 bars about what your teachers said you'd become.` }],
  fame: [{ id: 'fame-stage', text: () => `Write 2 bars about your first time on a big stage.` }],
  faith: [{ id: 'faith-pray', text: () => `Write 2 bars about what you pray for when nobody's listening.` }],
  space: [{ id: 'space-up', text: () => `Write 2 bars about what you see from up there.` }],
}

function usedIds(ctx: DirectorContext) {
  return new Set(ctx.rounds.map((r) => (r.challenge as Challenge & { templateId?: string }).templateId).filter(Boolean) as string[])
}

/**
 * What the next challenge should be built around — the rules are reliable at
 * spotting this (a newly mentioned person, a vivid detail, the arc stage),
 * so the AI director is told the focus and only has to phrase it.
 */
export function chooseFocus(ctx: DirectorContext): { label: string; keyword: string | null } {
  const nextIndex = ctx.rounds.length
  const stage = stageFor(nextIndex, ctx.totalRounds)
  const h = hooksFrom(ctx)
  const topic = ctx.topic.trim() || 'what drives them'
  if (stage === 'return') return { label: `bring it back to the original topic, "${topic}", showing how far they've come`, keyword: null }
  if (h.person && h.personIsNew) return { label: `${FAMILY.has(h.person.toLowerCase()) ? 'their ' : ''}${h.person} (just mentioned)`, keyword: h.person.toLowerCase() }
  if (stage === 'obstacle') return { label: 'something that could stop them — a cost, a doubt or an enemy', keyword: null }
  if (stage === 'turn') return { label: 'the turning point — what changed', keyword: null }
  if (stage === 'people') return h.person ? { label: `${FAMILY.has(h.person.toLowerCase()) ? 'their ' : ''}${h.person}`, keyword: h.person.toLowerCase() } : { label: 'the people this is for', keyword: null }
  if (h.detail) return { label: `the detail "${h.detail}" from their latest bars`, keyword: h.detail.toLowerCase() }
  return { label: `why ${topic} matters to them`, keyword: null }
}

export function storyDirectionFor(ctx: DirectorContext) {
  const steps: string[] = [ctx.topic.trim() || 'the topic']
  const topicThemes = themesIn(ctx.topic)
  for (const r of ctx.rounds) {
    const t = [...themesIn(`${r.lyrics[0]} ${r.lyrics[1]}`).entries()].filter(([id]) => !topicThemes.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0]
    const label = t ? themeLabel(t) : null
    if (label && !steps.includes(label)) steps.push(label)
  }
  return steps.slice(-4).join(' → ')
}

export function basicAnalysis(ctx: DirectorContext): string {
  const h = hooksFrom(ctx)
  const isFirst = ctx.rounds.length <= 1
  if (h.person && h.newThemes.length && h.newThemes[0] !== 'family') return `You brought in ${your(h.person)} — the story is moving toward ${themeLabel(h.newThemes[0])}.`
  if (h.person && h.personIsNew) return `You brought in ${your(h.person)} — now it's personal.`
  if (h.person) return `${your(h.person)[0].toUpperCase()}${your(h.person).slice(1)} is in the story now.`
  if (h.newThemes.length) return isFirst ? `You opened on ${themeLabel(h.newThemes[0])}.` : `New thread: ${themeLabel(h.newThemes[0])}.`
  if (h.themes.length) return `Still on ${themeLabel(h.themes[0])} — time to move it forward.`
  return h.detail ? `“${h.detail}” is the image that sticks.` : 'Hard to tell where the story is going yet.'
}

export function basicNextChallenge(ctx: DirectorContext): Challenge | null {
  const nextIndex = ctx.rounds.length
  if (nextIndex >= ctx.totalRounds) return null
  const stage = stageFor(nextIndex, ctx.totalRounds)
  const h = hooksFrom(ctx)
  const used = usedIds(ctx)
  const topic = ctx.topic.trim() || 'what drives you'
  const theme = h.themes[0] ? themeLabel(h.themes[0]) : topic
  const vars = { p: h.person ? your(h.person) : '', d: h.detail ?? '', topic, theme }

  const candidates: Template[] = []
  // a newly mentioned person is the strongest hook there is — follow it (unless it's time to wrap up)
  if (h.personIsNew && stage !== 'return') candidates.push(...BY_STAGE.people.filter((t) => t.needs === 'person'))
  if (stage === 'deepen' && h.newThemes[0] && BY_THEME[h.newThemes[0]]) candidates.push(...BY_THEME[h.newThemes[0]])
  if (stage === 'people' && h.themes.includes('family')) candidates.push(...BY_THEME.family)
  candidates.push(...BY_STAGE[stage])
  if (stage === 'deepen' && h.themes[0] && BY_THEME[h.themes[0]]) candidates.push(...BY_THEME[h.themes[0]])
  const usable = candidates.filter((t) => !used.has(t.id) && (t.needs !== 'person' || h.person) && (t.needs !== 'detail' || h.detail))
  const pick = usable[0] || BY_STAGE[stage][0]

  const focus = [...new Set([h.person, pick.needs === 'detail' ? h.detail : null, ...(stage === 'return' ? topicWords(topic).slice(0, 3) : []), ...(h.themes[0] ? [themeLabel(h.themes[0])] : [])].filter(Boolean) as string[])]
  const challenge: Challenge & { templateId: string } = {
    prompt: pick.text(vars),
    focus: focus.length ? focus.map((f) => f.toLowerCase()) : contentWords(pick.text(vars)).slice(0, 3),
    storyBeat: STAGE_LABEL[stage],
    source: 'basic',
    templateId: pick.id,
  }
  return challenge
}

/** First challenge of a track — always simple and on the user's own topic. */
export function firstChallenge(topic: string): Challenge {
  const t = topic.trim() || 'what drives you'
  return { prompt: `Write 2 bars about ${t}.`, focus: topicWords(t).slice(0, 4), storyBeat: STAGE_LABEL.open, source: 'basic' }
}

// ── help ─────────────────────────────────────────────────────────────
const GLOSSARY: [RegExp, string][] = [
  [/internal rhyme/i, 'Internal rhyme = rhymes inside the bar, not just at the end. e.g. rhyming a word in the middle of bar 1 with one in the middle of bar 2. It makes a verse feel dense and skilful.'],
  [/multi|multisyll/i, 'A multisyllabic rhyme matches two or more syllables in a row ("paper" / "later", "money" / "honey"). They hit much harder than one-syllable rhymes.'],
  [/slant|near rhyme/i, 'A slant rhyme shares the vowel sound but not the exact ending ("flats" / "stacks"). Rappers use them constantly — they sound natural and open up way more word choices.'],
  [/flow|pocket/i, 'Flow is how your syllables sit on the beat. Being "in the pocket" means your stressed syllables land on the kick and snare. Try tapping the beat and saying the bar to it before you record.'],
  [/bar/i, 'A bar is one measure of the beat — four beats. Two bars ≈ two lines. Each bar usually ends on a rhyme.'],
  [/punchline/i, 'A punchline is the payoff — usually in bar 2 — that twists or lands the idea set up in bar 1.'],
  [/metaphor|simile/i, 'A simile compares with "like/as" ("cold like December"); a metaphor says one thing *is* another ("my pen is a weapon"). Both make bars more vivid.'],
  [/score|judg|rank/i, 'Scores come from your words (rhyme, prompt, story, originality) and from your recording (whether your syllables land on the beat grid and how much of the two bars you fill). Each score lists its reasons.'],
]

const HINT_QUESTIONS: Record<string, string[]> = {
  money: ['What would you buy first — and who would you show?', 'Where does the money actually come from?', "What's the most broke moment you can remember?"],
  family: ['What does the person you mentioned do every day that you notice?', "What's one thing you've promised them?"],
  struggle: ['What does a bad day actually look like — the details?', 'What sound do you hear at night where you live?'],
  success: ['What changes on the first day you make it?', 'Who do you call first?'],
  default: ['What is one specific object, place or person that fits this?', 'What would someone who was there remember?', 'Set something up in bar 1 and twist it in bar 2.'],
}

export function rhymeSuggestions(word: string, limit = 14): string[] {
  const w = word.toLowerCase()
  if (!w) return []
  const scored = RHYME_BANK.map((c) => ({ c, s: rhymeStrength(w, c) }))
    .filter((x) => x.s.score >= 0.7)
    .sort((a, b) => b.s.score - a.s.score || a.c.length - b.c.length)
  return [...new Set(scored.map((x) => x.c))].slice(0, limit)
}

export function basicHelp(kind: HelpKind, ctx: HelpContext): string {
  const stage = stageFor(ctx.rounds.length, ctx.totalRounds)
  const themes = [...themesIn(`${ctx.current.prompt} ${ctx.rounds.map((r) => r.lyrics.join(' ')).join(' ')}`).keys()]
  switch (kind) {
    case 'explain':
      return `This round is ${STAGE_LABEL[stage]}: ${STAGE_GUIDE[stage]}. Your two bars should touch ${ctx.current.focus.slice(0, 3).map((f) => `“${f}”`).join(', ') || 'the idea in the challenge'}. A simple shape: bar 1 sets up a picture, bar 2 lands it — ideally ending on rhyming words.`
    case 'hint': {
      const qs = HINT_QUESTIONS[themes.find((t) => HINT_QUESTIONS[t]) ?? 'default']
      const q = qs[(ctx.rounds.length + ctx.draft[0].length) % qs.length]
      const end = lastWord(ctx.draft[0])
      return `Ask yourself: ${q}${end ? ` Then try ending bar 2 on something that rhymes with “${end}”.` : ' Write that answer as bar 1, then make bar 2 react to it.'}`
    }
    case 'rhyme': {
      const end = lastWord(ctx.draft[0]) || lastWord(ctx.rounds[ctx.rounds.length - 1]?.lyrics[1] ?? '')
      if (!end) return 'Write bar 1 first — then I can suggest words that rhyme with how it ends. Tip: rhyme two syllables ("paper"/"later") rather than one for more impact.'
      const list = rhymeSuggestions(end)
      return list.length
        ? `Words that rhyme with “${end}”: ${list.join(', ')}. Don't just drop one on the end — pick the one that moves the story.`
        : `Nothing in my word list rhymes cleanly with “${end}”. Try a slant rhyme (same vowel sound) or end bar 1 on an easier word.`
    }
    case 'story': {
      const dir = storyDirectionFor(ctx)
      return `So far: ${dir}. Next it should ${STAGE_GUIDE[stage]}. ${ctx.rounds.length ? 'Call back to something specific from your last bars so it feels like one song.' : 'Pick one clear image to open on — the rest of the song will build from it.'}`
    }
    case 'question': {
      const q = ctx.question ?? ''
      if (/\b(write|make|do)\b.*\b(bars?|lines?|verse|lyrics|it)\b.*\bfor me\b|\bwrite (my|the|me)\b|\bgive me (bars?|lines?|lyrics)/i.test(q))
        return "I won't write your bars — that's the whole point of being ranked. But I can explain the challenge, give you a hint, or find rhymes."
      const hit = GLOSSARY.find(([re]) => re.test(q))
      if (hit) return hit[1]
      return `Good question. The basic helper only knows rap terms (internal rhyme, multis, flow, bars, punchlines) and this challenge. Try “Explain challenge” or “Give hint”${words(q).length ? '' : ''}.`
    }
  }
}

export const basicDirector: Director = {
  source: 'basic',
  async afterRound(ctx: DirectorContext): Promise<DirectorOutput> {
    return { analysis: basicAnalysis(ctx), next: basicNextChallenge(ctx), storyDirection: storyDirectionFor(ctx) }
  },
  async help(kind, ctx) {
    return basicHelp(kind, ctx)
  },
}
