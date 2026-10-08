import { STOPWORDS, contentWords, lastWord, stem, words } from '../lyrics/text'
import { peopleIn, themesIn } from '../lyrics/themes'
import { analyseBars, cadenceFromSketch, isCadenceSketch } from './analyse'
import { baseVowel, isVowel, lexiconEntries, sound, stressOf, type WordSound } from './lexicon'
import { compareSounds, rhymeWords, vowelName } from './phonetics'
import { branchesFrom, homophonesOf, sensesOf, wordsIn as wordsInWorld, worldLabel, worldsOf } from './semantics'
import type { ChallengeSpec, HelpLevel, HelpMode, HelpResponse, HelpSection } from './types'

/**
 * HELP — coach, don't ghostwrite.
 *
 * Six modes, three levels each (1 nudge · 2 direction · 3 deep coaching).
 * Help never hands over a finished bar: it asks questions, opens doors
 * (worlds, second meanings, rhyme families), shows the shape of a cadence
 * and diagnoses what's written. Rhyme help gives words and short phrases —
 * the line is always the player's to write.
 */
export interface HelpInput {
  mode: HelpMode
  level: HelpLevel
  challenge: { prompt: string; focus: string[]; spec?: ChallengeSpec }
  topic: string
  previous: [string, string][]
  draft: [string, string]
  /** A word the player picked to work on (rhymes / connections / flip). */
  word?: string
  /** Cadence sketch ("da-da-DA-da…") for FLOW. */
  sketch?: string
  secondsPerBar?: number
}

const q = (w: string) => `“${w}”`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The word most worth working on: picked by the player, else the draft's strongest content word, else the challenge's focus. */
export function targetWord(input: HelpInput, prefer: 'end' | 'idea' = 'idea'): string | null {
  if (input.word?.trim()) return input.word.trim().toLowerCase().split(/\s+/).pop()!
  const d = input.draft
  if (prefer === 'end') {
    const e = lastWord(d[1]) || lastWord(d[0]) || lastWord(input.previous[input.previous.length - 1]?.[1] ?? '')
    if (e && !STOPWORDS.has(e)) return e
  }
  const cws = [...contentWords(d[0]), ...contentWords(d[1])]
  const rich = cws.find((w) => sensesOf(w).length >= 2) ?? cws.find((w) => worldsOf(w).length) ?? cws.sort((a, b) => b.length - a.length)[0]
  return rich ?? input.challenge.focus.find((f) => !STOPWORDS.has(f)) ?? contentWords(input.topic)[0] ?? null
}

function songWorlds(input: HelpInput) {
  const text = [input.topic, input.challenge.prompt, ...input.previous.flatMap((p) => p), ...input.draft].join(' ')
  return new Set([...contentWords(text).flatMap(worldsOf), ...themesIn(text).keys()])
}

const response = (mode: HelpMode, level: HelpLevel, message: string, sections: HelpSection[], yourMove: string): HelpResponse => ({ mode, level, engine: 'rules', message, sections, yourMove, canGoDeeper: level < 3 })

// ── THOUGHT ───────────────────────────────────────────────────────────
function thought(input: HelpInput): HelpResponse {
  const subject = input.challenge.focus.find((f) => !STOPWORDS.has(f)) ?? contentWords(input.topic)[0] ?? 'this'
  const people = peopleIn([...input.previous.flatMap((p) => p), ...input.draft].join(' '))
  const person = people[people.length - 1]
  const qs = [
    `Why do you actually want ${subject}? Not the obvious answer — the one you'd only tell a friend.`,
    `What changes the day you get it? Name one thing you'd see, touch or do differently.`,
    `What's stopping you right now — a person, a place, a habit, a fear?`,
  ]
  if (person) qs.unshift(`You mentioned ${person}. What does ${person.toLowerCase() === 'i' ? 'it' : person} not know about why you're doing this?`)
  if (input.previous.length) qs.push(`What did your last two bars leave unanswered? Start there.`)
  if (input.level === 1) return response('thought', 1, qs[0], [], 'Answer it in one plain sentence — not a bar. The bar comes from that sentence.')
  if (input.level === 2) return response('thought', 2, 'Three doors in. Pick the one with the most specific answer.', [{ title: 'Ask yourself', items: qs.slice(0, 3) }], 'Write your answer to one of them as a normal sentence, then turn THAT into bar one.')
  return response(
    'thought',
    3,
    'Find the thought before the rhyme. Walk it through:',
    [
      { title: 'Ask yourself', items: qs.slice(0, 4) },
      {
        title: 'Then',
        items: [
          '1. Say the answer out loud as a sentence — plain words, no rhyme.',
          '2. Circle the most specific word in it (a name, a place, an object beats "success" or "pain").',
          '3. Open CONNECTIONS on that word — see what it touches.',
          '4. Only now pick the rhyme pocket for bar two (RHYMES).',
        ],
      },
    ],
    'Do step 1 now. The best bars usually start as a sentence you could say to someone.',
  )
}

// ── CONNECTIONS ───────────────────────────────────────────────────────
function collisions(branches: ReturnType<typeof branchesFrom>) {
  const out: string[] = []
  // the same root in two worlds (hours ↔ hourly): searched over the full world lists
  for (let i = 0; i < branches.length; i++)
    for (let j = i + 1; j < branches.length; j++)
      for (const a of branches[i].all)
        for (const b of branches[j].all) {
          const sa = stem(a)
          const sb = stem(b)
          if (a !== b && sa.length >= 4 && sb.length >= 4 && (sa === sb || sb.startsWith(sa) || sa.startsWith(sb))) out.push(`${a} ↔ ${b} (${branches[i].label} meets ${branches[j].label})`)
        }
  // a word in one branch whose second meaning lives in another branch
  for (const br of branches)
    for (const w of br.all)
      for (const s of sensesOf(w)) {
        const other = branches.find((b) => b.world === s.world && b !== br)
        if (other) out.push(`${w}: ${br.label} — and ${s.gloss} (${other.label})`)
      }
  return [...new Set(out)]
}

function connections(input: HelpInput): HelpResponse {
  const w = targetWord(input)
  if (!w) return response('connections', input.level, 'Write a word or a first bar, and I will open up where it can lead.', [], 'Type a word you care about into the box above, then ask again.')
  const branches = branchesFrom(w)
  // the song's own world goes on the board too — that's where the best collisions are (hours ↔ hourly)
  const own = new Set(branches.map((b) => b.world))
  const topicWorlds = [...new Set([...contentWords(`${input.topic} ${input.challenge.focus.join(' ')}`).flatMap(worldsOf)])].filter((id) => !own.has(id) && !['mind', 'body', 'time'].includes(id) || (id === 'time' && !own.has(id)))
  for (const id of topicWorlds.slice(0, 2)) {
    const b = branchesFrom(wordsInWorld(id)[0] ?? id).find((x) => x.world === id)
    if (b) branches.push({ ...b, label: `your song: ${b.label}`, via: 'the song' })
  }
  if (!branches.length) {
    const hs = homophonesOf(w)
    return response(
      'connections',
      input.level,
      `I don't have much on ${q(w)} yet. Ask yourself what world it belongs to — a place, a job, a sport, a sense?`,
      hs.length ? [{ title: `${cap(w)} sounds like`, items: hs }] : [],
      'Pick a more concrete word from your idea and try again.',
    )
  }
  const coll = collisions(branches)
  if (input.level === 1) {
    const b = branches[0]
    const msg = coll.length ? `Look at ${coll[0].split(' (')[0]} — two worlds meet there. What could that mean in your song?` : `${cap(w)} → ${b.label}: ${b.words.slice(0, 5).join(', ')}. Which of these is closest to YOUR story?`
    return response('connections', 1, msg, [], 'Pick one door and write bar one through it.')
  }
  const sections: HelpSection[] = [{ title: `${cap(w)} connects to`, items: [], groups: branches.slice(0, input.level === 2 ? 4 : 6).map((b) => ({ label: `${b.label}${b.via !== 'same world' ? ` (${b.via})` : ''}`, items: b.words })) }]
  if (coll.length) sections.push({ title: 'Collisions — where two worlds touch', items: coll.slice(0, input.level === 2 ? 3 : 6) })
  if (input.level === 3) {
    const steps = branches
      .flatMap((b) => b.words.slice(0, 3).map((x) => ({ x, other: sensesOf(x).filter((s) => s.world !== b.world)[0] })))
      .filter((p) => p.other)
      .slice(0, 4)
      .map((p) => `${w} → ${p.x} → ${p.other!.gloss} (${worldLabel(p.other!.world)})`)
    if (steps.length) sections.push({ title: 'Two-step chains (the listener fills the middle)', items: steps })
  }
  return response('connections', input.level, `${cap(w)} isn't one idea — it's a doorway. Good bars move through connected worlds instead of jumping randomly.`, sections, coll.length ? 'Pick a collision and make both meanings true in one plain sentence — without explaining either.' : 'Pick two words from different branches and find the sentence that holds both.')
}

// ── RHYMES ────────────────────────────────────────────────────────────
interface RhymeHit {
  word: string
  kind: string
  score: number
  tier: number
  relevant: boolean
}

let byVowel: Map<string, [string, string[], number][]> | null = null
function candidatesFor(target: WordSound) {
  if (!byVowel) {
    byVowel = new Map()
    for (const e of lexiconEntries(5)) {
      const vs = e[1].filter(isVowel)
      let v = vs[vs.length - 1]
      for (let i = vs.length - 1; i >= 0; i--)
        if (stressOf(vs[i]) >= 1) {
          v = vs[i]
          break
        }
      const k = baseVowel(v ?? '')
      if (!byVowel.has(k)) byVowel.set(k, [])
      byVowel.get(k)!.push(e)
    }
  }
  const vs = target.phones.filter(isVowel)
  let v = vs[vs.length - 1]
  for (let i = vs.length - 1; i >= 0; i--)
    if (stressOf(vs[i]) >= 1) {
      v = vs[i]
      break
    }
  return byVowel.get(baseVowel(v ?? '')) ?? []
}

export function rhymeFamilies(word: string, worldsInPlay: Set<string>, limit = 8) {
  const t = sound(word)
  if (!t) return null
  const hits: RhymeHit[] = []
  for (const [w, phones, tier] of candidatesFor(t)) {
    if (w === t.word || stem(w) === stem(t.word) || w.includes("'")) continue
    const m = compareSounds(t, { word: w, phones, known: true, tier })
    if (m.score < 0.5) continue
    hits.push({ word: w, kind: m.kind, score: m.score, tier, relevant: worldsOf(w).some((id) => worldsInPlay.has(id)) })
  }
  const rank = (a: RhymeHit, b: RhymeHit) => Number(b.relevant) - Number(a.relevant) || b.score - a.score || a.tier - b.tier || a.word.length - b.word.length
  const pick = (f: (h: RhymeHit) => boolean, n = limit) => hits.filter(f).sort(rank).slice(0, n).map((h) => h.word)
  const tails = t.phones.filter(isVowel).length
  return {
    multi: tails >= 2 ? pick((h) => h.kind === 'multi' && h.tier <= 3) : [],
    perfect: pick((h) => h.kind === 'perfect' && h.tier <= 3),
    slant: pick((h) => h.kind === 'slant' && h.tier <= 3),
    vowel: pick((h) => h.kind === 'assonance' && h.tier <= 2, 6),
    onTopic: pick((h) => h.relevant && h.score >= 0.7, 8),
    rare: pick((h) => h.tier >= 4 && h.score >= 0.9, 5),
  }
}

/** Two-word phrases that carry a 2-syllable rhyme ("money" → "run free"-style shapes). */
function phraseMultis(word: string, limit = 5): string[] {
  const t = sound(word)
  if (!t) return []
  const vs = t.phones.filter(isVowel).map(baseVowel)
  if (vs.length < 2) return []
  const [v1, v2] = vs.slice(-2)
  const mono = lexiconEntries(1).filter(([, p]) => p.filter(isVowel).length === 1)
  const first = mono.filter(([w, p]) => !STOPWORDS.has(w) && baseVowel(p.find(isVowel)!) === v1).slice(0, 40)
  const second = mono.filter(([w, p]) => baseVowel(p.find(isVowel)!) === v2 && ['me', 'free', 'see', 'be', 'it', 'up', 'out', 'now', 'through', 'go', 'though', 'way', 'day', 'right', 'night', 'time', 'mine', 'down', 'round', 'home', 'known', 'back'].includes(w))
  const out: string[] = []
  for (const [a] of first)
    for (const [b] of second) {
      if (out.length >= limit) return out
      if (a !== b && a !== t.word) out.push(`${a} ${b}`)
    }
  return out
}

function rhymes(input: HelpInput): HelpResponse {
  const w = targetWord(input, 'end')
  if (!w) return response('rhymes', input.level, 'Write bar one (or type a word above) and I will find rhyme families for it.', [], 'Decide what bar one SAYS first — then we find how bar two can land.')
  const fam = rhymeFamilies(w, songWorlds(input))
  if (!fam || ![fam.multi, fam.perfect, fam.slant].some((x) => x.length)) {
    const s = sound(w)
    const v = s?.phones.filter(isVowel).pop()
    return response('rhymes', input.level, `${q(w)} is hard to rhyme cleanly${v ? ` — but anything with the ${vowelName(baseVowel(v))} sound will slant-rhyme` : ''}.`, [], 'Try ending bar one on a different word that says the same thing — or let bar two slant-rhyme.')
  }
  const near = fam.onTopic.length ? fam.onTopic : [...fam.multi, ...fam.perfect].slice(0, 6)
  if (input.level === 1)
    return response('rhymes', 1, `Rhymes for ${q(w)} that fit your song: ${near.slice(0, 6).join(', ')}.`, [], "Don't drop one on the end — pick the one that moves the story, then write the bar toward it.")
  const groups = [
    { label: 'Multisyllabic', items: fam.multi },
    { label: 'Perfect', items: fam.perfect },
    { label: 'Slant (same vowel, looser ending)', items: fam.slant },
    { label: 'Fits your song', items: fam.onTopic },
  ]
    .filter((g) => g.items.length)
    // a group that repeats another one exactly adds nothing
    .filter((g, i, all) => !all.slice(0, i).some((o) => o.items.join() === g.items.join()))
  const sections: HelpSection[] = [{ title: `Rhyme families for ${q(w)}`, items: [], groups }]
  if (input.level === 3) {
    const phrases = phraseMultis(w)
    if (phrases.length) sections.push({ title: 'Phrase shapes that carry the same vowels (multis across words)', items: phrases })
    if (fam.vowel.length) sections.push({ title: 'Same vowel only — for internal rhymes mid-bar', items: fam.vowel })
    sections.push({ title: 'How to use them', items: ['Choose by meaning, not by sound: which of these does your story actually need?', 'Put one of the slant rhymes mid-bar for an internal rhyme, keep a stronger one for the end.', 'If none fit the thought, change the end of bar one — the thought comes first.'] })
  }
  return response('rhymes', input.level, `Grouped by how strongly they rhyme with ${q(w)}${fam.onTopic.length ? ', with the ones that fit your song pulled out' : ''}.`, sections, 'Pick the one your story needs, then write bar two toward it.')
}

// ── FLIP ──────────────────────────────────────────────────────────────
function flip(input: HelpInput): HelpResponse {
  const draftWords = [...contentWords(input.draft[0]), ...contentWords(input.draft[1])]
  const w = input.word?.trim().toLowerCase() || draftWords.find((x) => sensesOf(x).length >= 2) || draftWords.find((x) => homophonesOf(x).length) || targetWord(input)
  if (!w) return response('flip', input.level, 'Give me a word from your idea and I will look for its other meanings.', [], 'Type a word above.')
  const senses = sensesOf(w)
  const homs = homophonesOf(w)
  const current = worldsOf(w)[0] ?? senses[0]?.world
  const others = senses.filter((s) => s.world !== current)
  const directions = [...others.map((s) => `${w} = ${s.gloss}`), ...homs.map((h) => `${w} sounds like ${q(h)}${worldsOf(h)[0] ? ` (${worldLabel(worldsOf(h)[0])})` : ''}`)]
  if (input.level === 1) return response('flip', 1, `What else can ${q(w)} mean besides the obvious?`, [], 'Find the second meaning yourself first — then ask for more if you need it.')
  if (!directions.length)
    return response('flip', input.level, `${q(w)} doesn't have an obvious second meaning I know of. Try a word next to it — or think what it SOUNDS like when said fast.`, [], 'Say the line out loud quickly: does any phrase sound like another word?')
  const sections: HelpSection[] = [{ title: `Other doors in ${q(w)}`, items: directions.slice(0, 5) }]
  if (input.level === 3)
    sections.push({
      title: 'How a flip works',
      items: [
        'Double duty: one word, both meanings true at once — the sentence still reads as normal.',
        'Reinterpretation: bar one makes the listener hear meaning A; bar two makes meaning B suddenly true.',
        'Hidden but discoverable: no explaining ("…like ink, ‘cause squids make ink") — but no huge leap either. Would a friend get it on the second listen?',
      ],
    })
  return response('flip', input.level, `Pick a meaning the listener WON'T expect in this song — then make it true without explaining it.`, sections, 'Write the line yourself. Test it: read it to someone without explaining — do they catch it on the second listen?')
}

// ── FLOW ──────────────────────────────────────────────────────────────
function flow(input: HelpInput): HelpResponse {
  const raw = input.sketch?.trim() || (isCadenceSketch(input.draft[0]) ? input.draft[0] : '') || input.draft[0]
  if (!raw) return response('flow', input.level, 'Mumble the rhythm you hear over the loop — like "da-da-DA-da-da-da-AY-in" — and type it in. Capitals = the hits.', [], 'Type your cadence sketch in the box above.')
  const sketch = isCadenceSketch(raw)
  const c = sketch ? cadenceFromSketch(raw) : (() => {
    const a = analyseBars({ lines: [raw, ''], topic: input.topic, previous: [], focus: [] })
    return { syllables: a.lines[0].syllables, pattern: a.lines[0].stress, landing: a.lines[0].endWord, landingVowel: a.lines[0].pocket }
  })()
  const fits = input.secondsPerBar ? ` (comfortable here: ${Math.max(5, Math.round(input.secondsPerBar * 2.6))}–${Math.round(input.secondsPerBar * 5.6)} a bar)` : ''
  const shape = `${c.syllables} syllables${fits}: ${c.pattern}${c.landingVowel ? ` — it lands on an ${q(vowelName(c.landingVowel))} sound` : ''}.`
  if (input.level === 1) return response('flow', 1, `Your shape: ${shape}`, [], 'Keep that shape. Decide what the bar needs to SAY, then fit real words onto the hits (capitals).')
  // words that match the landing: same stressed vowel and a similar tail length
  const land = sound(c.landing.replace(/-/g, ''))
  const fam = land ? rhymeFamilies(land.word, songWorlds(input), 10) : null
  const pocket = fam ? [...fam.onTopic, ...fam.multi, ...fam.perfect].filter((x, i, a) => a.indexOf(x) === i).slice(0, 10) : []
  const sections: HelpSection[] = [{ title: 'Sound shape', items: [shape] }]
  if (pocket.length) sections.push({ title: 'Real words that land in that pocket', items: pocket })
  if (input.level === 3)
    sections.push({
      title: 'Cadence first, meaning second — without losing the cadence',
      items: ['1. FLOW — you have it: keep the hits where they are.', '2. SOUND SHAPE — count the syllables between the hits.', '3. RHYME POCKET — pick a landing word from the list that fits your story.', '4. MEANING — decide the one thing this bar says.', '5. REAL WORDS — fill the weak syllables with small words (a, the, my, in) and the hits with the strong ones.'],
    })
  return response('flow', input.level, `Your shape: ${shape} Now put meaning into it without breaking it.`, sections, 'Say your sketch over the loop, then swap one mumble at a time for a real word.')
}

// ── CRITIQUE ──────────────────────────────────────────────────────────
function critique(input: HelpInput): HelpResponse {
  const lines: [string, string] = input.draft[0].trim() || input.draft[1].trim() ? input.draft : (input.previous[input.previous.length - 1] ?? ['', ''])
  if (!lines[0].trim() && !lines[1].trim()) return response('critique', input.level, "Write something first — even a rough version. I'll tell you what's working and what to look at.", [], 'Get a rough bar down. It can be bad.')
  const a = analyseBars({ lines, topic: input.topic, previous: input.previous, focus: input.challenge.focus, constraints: input.challenge.spec?.constraints, secondsPerBar: input.secondsPerBar })
  if (a.cadenceSketch) return flow({ ...input, sketch: lines[0] })
  const strong: string[] = []
  if (a.rhyme.end.kind === 'multi') strong.push(`the ${q(a.rhyme.end.words[0])} / ${q(a.rhyme.end.words[1])} multi`)
  if (a.rhyme.internal.length) strong.push(`the internal rhyme ${q(a.rhyme.internal[0].a)} / ${q(a.rhyme.internal[0].b)}`)
  if (a.chains.length) strong.push(`the chain ${[a.chains[0][0].from, ...a.chains[0].map((l) => l.to)].join(' → ')}`)
  if (a.imagery.score >= 0.6) strong.push(`the detail (${a.imagery.concrete.slice(0, 2).map(q).join(', ')})`)
  if (a.connector) strong.push('it reads naturally and moves the story')
  const weak: string[] = []
  for (const f of a.filler) weak.push(f.reason)
  for (const n of a.naturalness) weak.push(n.note)
  if (a.cadence.verdict === 'crowded') weak.push('Too many syllables for the bar at this tempo.')
  if (a.cadence.verdict === 'underwritten') weak.push("The bar is short — there'll be dead air.")
  if (!a.meaning.connectsToSong && input.previous.length) weak.push("It doesn't connect to the song so far.")
  for (const c of a.constraints.filter((x) => x.met === false)) weak.push(`Challenge: ${c.note}.`)
  const driver = a.filler.length ? 'The rhyme looks like it is choosing the words right now (rhyme-first).' : a.rhyme.end.score < 0.5 ? 'Meaning is driving — the rhyme is loose.' : 'Meaning and rhyme are pulling together.'
  const missed: string[] = []
  const poly = [...contentWords(lines[0]), ...contentWords(lines[1])].filter((w) => sensesOf(w).length >= 2 && !a.wordplay.some((x) => x.word === w))
  if (poly.length) missed.push(`${q(poly[0])} has a second meaning you're not using yet (${sensesOf(poly[0]).map((s) => s.gloss).join(' / ')}).`)
  if (!a.rhyme.internal.length && a.rhyme.end.score >= 0.5) missed.push(`There's room for an internal rhyme on the ${vowelName(a.lines[1].pocket ?? '')} sound.`)
  const explains = /\b(because|cause|'cause|meaning|that means|get it)\b/i.test(lines[1])
  if (explains && a.wordplay.length) missed.push('Bar two may be explaining the wordplay — try cutting the explanation and trusting the listener.')
  const next = weak[0] ? 'Fix the first thing in "what to look at" — leave everything else as it is.' : missed[0] ? `Try the missed opportunity: ${missed[0]}` : 'Record it — then compare how it sounds against how it reads.'
  if (input.level === 1) return response('critique', 1, `${strong[0] ? `Strongest: ${strong[0]}.` : 'Getting there.'} ${weak[0] ?? missed[0] ?? 'Nothing big to fix.'}`, [], next)
  const sections: HelpSection[] = [
    { title: "What's working", items: strong.length ? strong.map(cap) : ['The idea is down — that is the hardest part.'] },
    { title: 'What to look at', items: weak.length ? weak : ['Nothing major.'] },
    { title: 'What is driving it', items: [driver] },
  ]
  if (input.level === 3) {
    if (missed.length) sections.push({ title: 'Missed opportunities', items: missed })
    if (a.filler.length) sections.push({ title: 'The test', items: [`If the rhyme disappeared, would ${q(a.filler[0].word)} still have a reason to be in this verse? If not, find the thought first and come back to the rhyme pocket.`] })
  }
  return response('critique', input.level, driver, sections, next)
}

export function coachHelp(input: HelpInput): HelpResponse {
  switch (input.mode) {
    case 'thought':
      return thought(input)
    case 'connections':
      return connections(input)
    case 'rhymes':
      return rhymes(input)
    case 'flip':
      return flip(input)
    case 'flow':
      return flow(input)
    case 'critique':
      return critique(input)
  }
}

// ── the rule every help answer follows ──────────────────────────────────
/**
 * Does a piece of help text hand the player a finished bar? Flags quoted or
 * line-broken passages of 6+ words that aren't the player's own words or the
 * challenge, and "try: / you could say: …" style suggestions.
 */
export function ghostwrites(text: string, own: string[] = []): boolean {
  const mine = new Set(own.flatMap((t) => words(t)))
  const novel = (s: string) => {
    const ws = words(s)
    return ws.length >= 6 && ws.filter((w) => !mine.has(w)).length >= 4
  }
  // a quoted line of new words
  const quoted = text.match(/["“‘][^"”’]{20,}["”’]/g) ?? []
  if (quoted.some((x) => novel(x))) return true
  // "try: …", "you could say …", "how about …" followed by a line
  if (/\b(try|example|for example|how about|something like|e\.g\.)\s*[:\-–]\s*["“]?[a-z][^.?!]{25,}/i.test(text)) return true
  if (/\b(you could (say|write|go with)|something like|how about)\s*["“][^"”]{20,}/i.test(text)) return true
  // bars come in rhyming pairs: two short new lines whose endings rhyme
  const barLike = text
    .split(/\n|\s\/\s/)
    .map((l) => l.trim())
    .filter((l) => novel(l) && words(l).length <= 16 && !/[?]$/.test(l) && !/^(\d\.|[-•])/.test(l) && !/:/.test(l) && (l.match(/,/g) ?? []).length < 2)
  // …or a new line that completes the player's own bar (rhymes with one of their line endings)
  const ownEnds = own.map((t) => lastWord(t)).filter((w) => w && !STOPWORDS.has(w))
  for (const l of barLike) {
    const ws = words(l)
    if (ownEnds.some((e) => rhymeWords(ws[ws.length - 1], e).score >= 0.7)) return true
  }
  for (let i = 0; i + 1 < barLike.length; i++) {
    const a = words(barLike[i])
    const b = words(barLike[i + 1])
    if (rhymeWords(a[a.length - 1], b[b.length - 1]).score >= 0.7) return true
  }
  return false
}

/** Is the player asking for the bar to be written for them? */
export function asksForBars(question: string) {
  return /\b(write|make|finish|do|give me)\b.*\b(bars?|lines?|verse|lyrics|rap|it|this|the rest)\b.*\b(for me)?\b/i.test(question) && /\b(write|finish|give me|for me|make me)\b/i.test(question)
}
