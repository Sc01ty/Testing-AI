import type { CategoryScore, Challenge } from '../domain/types'
import { STOPWORDS, contentWords, lastWord, rhymeStrength, stem, words, type RhymeKind } from '../lyrics/text'
import { peopleIn, THEMES, themesIn, themesOfWord, topicWords } from '../lyrics/themes'

/**
 * Lyric scores — computed from the text only, so they're explainable:
 * every number comes with the reasons that produced it.
 */
export interface LyricContext {
  lyrics: [string, string]
  challenge: Challenge
  topic: string
  previous: { lyrics: [string, string]; challenge: Challenge }[]
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const pct = (v: number) => Math.round(clamp(v))
const quote = (w: string) => `“${w}”`
const KIND_LABEL: Record<RhymeKind, string> = { multi: 'multisyllabic rhyme', perfect: 'perfect rhyme', slant: 'slant rhyme', assonance: 'vowel rhyme', none: 'no rhyme' }

function empty(lines: [string, string]) {
  return words(lines[0]).length === 0 || words(lines[1]).length === 0
}

// ── RHYME ────────────────────────────────────────────────────────────
export function scoreRhyme(lines: [string, string]): CategoryScore {
  const reasons: string[] = []
  if (empty(lines)) return { category: 'rhyme', label: 'Rhyme', score: 0, basis: 'lyrics', reasons: ['Both bars need words.'] }
  const end1 = lastWord(lines[0])
  const end2 = lastWord(lines[1])
  const end = rhymeStrength(end1, end2)
  if (end.score > 0) reasons.push(`${quote(end1)} / ${quote(end2)} — ${KIND_LABEL[end.kind]}`)
  else if (end1 === end2) reasons.push(`Both bars end on ${quote(end1)} — repeating a word isn't a rhyme`)
  else reasons.push(`${quote(end1)} and ${quote(end2)} don't rhyme`)

  // internal rhymes: pairs of content words across both bars (excluding the end pair)
  // (filler words don't count: "the" / "she" isn't an internal rhyme anyone hears)
  const all = [...words(lines[0]), ...words(lines[1])].filter((w) => w.length > 2 && !STOPWORDS.has(w))
  const pairs: string[] = []
  let internal = 0
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if ((a === end1 && b === end2) || (a === end2 && b === end1)) continue
      const r = rhymeStrength(a, b)
      if (r.score >= 0.7) {
        internal += r.score
        if (pairs.length < 2) pairs.push(`${quote(a)}/${quote(b)}`)
      }
    }
  const density = internal / Math.max(4, all.length)
  if (internal >= 0.7) reasons.push(`Internal rhymes: ${pairs.join(', ')}${internal >= 2.5 ? ' and more' : ''}`)
  else reasons.push('No internal rhymes')

  const score = 22 + end.score * 48 + Math.min(30, density * 160)
  return { category: 'rhyme', label: 'Rhyme', score: pct(score), basis: 'lyrics', reasons }
}

// ── PROMPT RELEVANCE ─────────────────────────────────────────────────
/** Concepts the challenge asks for: each focus word plus the themes it belongs to. */
function concepts(challenge: Challenge, topic: string) {
  const focus = challenge.focus.length ? challenge.focus : contentWords(challenge.prompt)
  return focus.map((f) => {
    const fs = stem(f)
    const themes = new Set([...themesOfWord(f), ...themesOfWord(fs), ...themesIn(f).keys()])
    if (!themes.size && topicWords(topic).includes(f)) themesIn(topic).forEach((_, k) => themes.add(k))
    return { word: f, stem: fs, themes }
  })
}

export function scorePrompt(ctx: LyricContext): CategoryScore {
  const { lyrics, challenge, topic } = ctx
  if (empty(lyrics)) return { category: 'prompt', label: 'Prompt', score: 0, basis: 'lyrics', reasons: ['Both bars need words.'] }
  const text = `${lyrics[0]} ${lyrics[1]}`
  const want = concepts(challenge, topic)
  const hit: string[] = []
  const missed: string[] = []
  /** The player's own words that answered the brief (what we quote back). */
  const evidence: string[] = []
  const lyricWords = words(text)
  for (const c of want) {
    const direct = lyricWords.filter((w) => stem(w) === c.stem)
    const viaTheme = lyricWords.filter((w) => themesOfWord(w).some((t) => c.themes.has(t)) || [...themesIn(w).keys()].some((t) => c.themes.has(t)))
    if (direct.length || viaTheme.length) {
      hit.push(c.word)
      evidence.push(...direct, ...viaTheme)
    } else missed.push(c.word)
  }
  const unique = (xs: string[]) => [...new Set(xs)]
  const perLine = lyrics.map((l) => {
    const s = new Set(words(l).map(stem))
    const th = themesIn(l)
    return want.some((c) => s.has(c.stem) || [...c.themes].some((t) => th.has(t)))
  })
  const reasons: string[] = []
  if (hit.length) reasons.push(`On the brief: ${unique(evidence).slice(0, 3).map(quote).join(', ')}`)
  if (missed.length && hit.length < 2) reasons.push(`Didn't touch: ${unique(missed).slice(0, 3).map(quote).join(', ')}`)
  if (hit.length && perLine.every(Boolean)) reasons.push('Both bars stay on the prompt')
  else if (hit.length) reasons.push(`Only bar ${perLine[0] ? 1 : 2} is about the prompt`)
  const coverage = want.length ? new Set(hit).size / Math.min(want.length, 3) : 0
  const score = hit.length === 0 ? 18 : 48 + Math.min(1, coverage) * 32 + (perLine.every(Boolean) ? 20 : 6)
  return { category: 'prompt', label: 'Prompt', score: pct(score), basis: 'lyrics', reasons }
}

// ── STORY ────────────────────────────────────────────────────────────
export function concreteness(text: string) {
  const ws = contentWords(text)
  const specific = ws.filter((w) => w.length >= 6 || /\d/.test(w)).length + peopleIn(text).length
  return Math.min(1, specific / 3)
}

export function scoreStory(ctx: LyricContext): CategoryScore {
  const { lyrics, previous, topic, challenge } = ctx
  if (empty(lyrics)) return { category: 'story', label: 'Story', score: 0, basis: 'lyrics', reasons: ['Both bars need words.'] }
  const text = `${lyrics[0]} ${lyrics[1]}`
  const reasons: string[] = []
  const concrete = concreteness(text)
  if (concrete >= 0.66) reasons.push('Specific details paint a picture')
  else reasons.push('Quite general — specific details (names, places, objects) make it a story')

  if (!previous.length) {
    const topicStems = new Set(topicWords(topic).map(stem))
    const onTopic = words(text).some((w) => topicStems.has(stem(w))) || [...themesIn(topic).keys()].some((t) => themesIn(text).has(t))
    reasons.unshift(onTopic ? `Opens the song on ${quote(topic)}` : `Doesn't set up ${quote(topic)} yet`)
    return { category: 'story', label: 'Story', score: pct(30 + (onTopic ? 40 : 5) + concrete * 30), basis: 'lyrics', reasons }
  }

  const prevText = previous.map((p) => `${p.lyrics[0]} ${p.lyrics[1]}`).join(' ')
  const prevStems = new Set(contentWords(prevText).map(stem))
  const nowStems = contentWords(text).map(stem)
  const prevThemes = themesIn(prevText)
  const nowThemes = themesIn(text)
  const sharedThemes = [...nowThemes.keys()].filter((t) => prevThemes.has(t))
  const callbacks = peopleIn(text).filter((p) => peopleIn(prevText).includes(p))
  const continuity = Math.min(1, sharedThemes.length * 0.45 + callbacks.length * 0.5 + (nowStems.some((s) => prevStems.has(s)) ? 0.2 : 0))
  const fresh = nowStems.length ? nowStems.filter((s) => !prevStems.has(s)).length / nowStems.length : 0
  const beatHit = challenge.focus.some((f) => nowStems.includes(stem(f)) || themesOfWord(f).some((t) => nowThemes.has(t)))

  if (callbacks.length) reasons.unshift(`Calls back to ${callbacks.map(quote).join(', ')} from earlier`)
  else if (sharedThemes.length) reasons.unshift(`Keeps the thread: ${sharedThemes.slice(0, 2).map((t) => THEMES.find((x) => x.id === t)?.label ?? t).join(', ')}`)
  else reasons.unshift('Feels disconnected from the earlier bars')
  if (fresh < 0.35) reasons.push('Mostly repeats what was already said — move the story on')
  else if (beatHit) reasons.push(`Moves the story to ${quote(challenge.storyBeat)}`)

  const score = 20 + continuity * 34 + Math.min(1, fresh / 0.6) * 26 + concrete * 12 + (beatHit ? 8 : 0)
  return { category: 'story', label: 'Story', score: pct(score), basis: 'lyrics', reasons }
}

// ── ORIGINALITY ──────────────────────────────────────────────────────
export const CLICHES = [
  'money on my mind',
  'on my grind',
  'get money',
  'get this money',
  'stack my paper',
  'started from the bottom',
  'real recognize real',
  'haters gonna hate',
  'living the dream',
  'chasing the bag',
  'secure the bag',
  'no cap',
  'from the bottom to the top',
  'top of the game',
  'grind never stops',
  'money over everything',
  'trust nobody',
  'keep it real',
  'stay humble',
  'self made',
]
export const LAZY_PAIRS: [string, string][] = [
  ['money', 'honey'],
  ['time', 'rhyme'],
  ['flow', 'go'],
  ['real', 'deal'],
  ['me', 'free'],
  ['cash', 'fast'],
  ['fire', 'higher'],
  ['game', 'fame'],
  ['night', 'light'],
  ['mic', 'like'],
]

export function scoreOriginality(ctx: LyricContext): CategoryScore {
  const { lyrics, previous } = ctx
  if (empty(lyrics)) return { category: 'originality', label: 'Originality', score: 0, basis: 'lyrics', reasons: ['Both bars need words.'] }
  const text = `${lyrics[0]} ${lyrics[1]}`
  const lower = text.toLowerCase()
  const reasons: string[] = []
  let score = 62

  const cws = contentWords(text)
  const counts = new Map<string, number>()
  for (const w of cws.map(stem)) counts.set(w, (counts.get(w) ?? 0) + 1)
  const repeats = [...counts.entries()].filter(([, n]) => n > 1)
  if (repeats.length) {
    score -= repeats.length * 8
    reasons.push(`Repeats ${repeats.slice(0, 2).map(([w]) => quote(w)).join(', ')}`)
  }

  const cliches = CLICHES.filter((c) => lower.includes(c))
  if (cliches.length) {
    score -= cliches.length * 14
    reasons.push(`Heard it before: ${cliches.slice(0, 2).map(quote).join(', ')}`)
  }

  const e1 = lastWord(lyrics[0])
  const e2 = lastWord(lyrics[1])
  const lazy = LAZY_PAIRS.find(([a, b]) => (e1 === a && e2 === b) || (e1 === b && e2 === a))
  if (lazy) {
    score -= 10
    reasons.push(`${quote(lazy[0])}/${quote(lazy[1])} is the most obvious rhyme going`)
  }

  if (previous.length) {
    const prevStems = new Set(previous.flatMap((p) => contentWords(`${p.lyrics[0]} ${p.lyrics[1]}`)).map(stem))
    const reused = [...new Set(cws.map(stem))].filter((s) => prevStems.has(s))
    if (reused.length >= 3) {
      score -= (reused.length - 2) * 6
      reasons.push(`Reuses words from earlier bars: ${reused.slice(0, 3).map(quote).join(', ')}`)
    }
  }

  const rich = cws.filter((w) => w.length >= 7).length
  const variety = cws.length ? new Set(cws.map(stem)).size / cws.length : 0
  score += Math.min(3, rich) * 7 + (variety > 0.9 && cws.length >= 6 ? 8 : 0)
  if (rich >= 2) reasons.push('Vivid vocabulary')
  if (!reasons.length) reasons.push('Nothing overused')
  if (cws.length < 4) {
    score -= 15
    reasons.push('Very few meaningful words')
  }
  return { category: 'originality', label: 'Originality', score: pct(score), basis: 'lyrics', reasons }
}
