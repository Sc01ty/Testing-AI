import { STOPWORDS, contentWords, lastWord, stem, words } from '../lyrics/text'
import { peopleIn, themesIn } from '../lyrics/themes'
import { rhymeEvidence } from './rhymeEvidence'
import { isVowel, sound } from './lexicon'
import { lineSyllables, rhymePocket, rhymeWords, stressString, type SoundRhymeKind } from './phonetics'
import { SENSES, homophonesOf, linkBetween, sensesOf, worldLabel, worldsOf } from './semantics'
import type { BarAnalysis, ChainLink, Constraint, ConstraintResult, FillerFlag, NaturalnessFlag, WordplayCandidate } from './types'

/**
 * Deterministic analysis of one round (two bars). Everything here is
 * measurable or lexicon-based and explainable. It finds CANDIDATES for the
 * things only a reader can really judge (filler, double meanings) and
 * labels them as such.
 */
export interface AnalyseInput {
  lines: [string, string]
  topic: string
  /** Earlier rounds' bars, oldest first. */
  previous: [string, string][]
  /** The challenge's focus words. */
  focus: string[]
  constraints?: Constraint[]
  /** Seconds per bar, if the beat is known. */
  secondsPerBar?: number
}

const SENSORY = new Set(
  `red blue green black white gold silver grey gray purple pink orange yellow bright dark shadow glow neon loud quiet silent whisper echo bang crash buzz hum ring sirens smell smoke perfume sweet sour bitter salty cold warm hot freezing burning wet dry rough smooth sharp soft heavy sticky cracked broken shiny dusty rusty taste tasted`.split(
    /\s+/,
  ),
)
const ABSTRACT = new Set(['life', 'love', 'time', 'thing', 'things', 'way', 'stuff', 'feeling', 'feelings', 'success', 'struggle', 'dream', 'dreams', 'pain', 'hate', 'hope', 'fear', 'world', 'everything', 'nothing', 'something', 'anything', 'real', 'truth', 'game', 'grind', 'hustle'])

/** Polysemous words so common that a second meaning is usually accidental. */
const COMMON_POLY = new Set(['time', 'back', 'broke', 'flat', 'line', 'lines', 'play', 'game', 'run', 'light', 'hand', 'hands', 'face', 'rest', 'second', 'present', 'past', 'beat', 'case', 'deal', 'check', 'hit', 'cold', 'stage', 'sign', 'watch', 'deep', 'heavy', 'fresh', 'safe', 'value', 'worth', 'spent', 'rich', 'key', 'track', 'record'])

/** So common that the rules never suggest them as double meanings (the model still can). */
const NEVER_DOUBLE = new Set(['time', 'line', 'lines', 'game', 'play', 'back', 'run', 'hand', 'hands'])

const MUMBLE = /^(?:(?:da|duh|dum|ba|na|la|ta|ah|ay|ayy|uh|yeah|eh|oh|ooh|in|on|um|dee|di|do|doo|ha|hm|mm)[-']?)+$/i

function isMumbleToken(t: string) {
  const w = t.toLowerCase()
  return MUMBLE.test(w.replace(/-/g, '')) || /^([a-z]{1,3}-){2,}[a-z]{1,3}$/i.test(t)
}

/** "da-da-DA-da-da-da-AY-in" or "na na na" — the player is sketching a cadence, not writing words. */
export function isCadenceSketch(line: string) {
  const toks = line.split(/\s+/).filter(Boolean)
  if (!toks.length) return false
  const mumble = toks.filter(isMumbleToken).length
  return mumble / toks.length >= 0.5
}

/** Syllables + stresses from a sketch: capitals = stressed ("da-da-DA"). */
export function cadenceFromSketch(line: string) {
  const parts = line.split(/[\s-]+/).filter(Boolean)
  const syl = parts.map((p) => ({ text: p, stress: p === p.toUpperCase() && /[A-Z]/.test(p) ? 1 : 0 }))
  const last = parts[parts.length - 1] ?? ''
  const vowel = sound(last)?.phones.filter(isVowel).pop()?.replace(/\d/, '') ?? null
  return { syllables: syl.length, pattern: syl.map((s) => (s.stress ? 'DA' : 'da')).join('-'), landing: last, landingVowel: vowel }
}

function lineInfo(text: string) {
  const syl = lineSyllables(text)
  return { text, syllables: syl.length, stress: stressString(syl), endWord: lastWord(text), pocket: rhymePocket(text)?.vowel ?? null }
}

/** Does the end rhyme only work if a normally-unstressed syllable is stressed? ("DOC-TOR" / "car") */
function stretchedRhyme(a: string, b: string): string | null {
  const sa = sound(a)
  const sb = sound(b)
  if (!sa?.known || !sb?.known) return null
  if (rhymeWords(a, b).score >= 0.5) return null
  const va = sa.phones.filter(isVowel)
  const vb = sb.phones.filter(isVowel)
  const la = va[va.length - 1]
  const lb = vb[vb.length - 1]
  if (!la || !lb || la.replace(/\d/, '') !== lb.replace(/\d/, '')) return null
  const unstressed = (v: string, all: string[]) => all.length > 1 && v.endsWith('0')
  if (unstressed(la, va) || unstressed(lb, vb)) return unstressed(la, va) ? a : b
  return null
}

function naturalnessFlags(lines: [string, string], end: [string, string]): NaturalnessFlag[] {
  const flags: NaturalnessFlag[] = []
  lines.forEach((l) => {
    const t = l.toLowerCase().trim()
    if (/\b(i|you|we|they|he|she)\s+(do|did|does|shall|will)\s+[a-z']+[.!?]?$/.test(t) || /\b(the|my|your|this|that|a)\s+[a-z']+\s+(i|we|they|you)\s+[a-z']+[.!?]?$/.test(t))
      flags.push({ kind: 'inversion', text: l, note: 'The word order is bent so the rhyme lands last — nobody says it that way.' })
    if (/\b(thee|thou|thy|doth|hath|'tis|whence|ye|shall|upon)\b/.test(t)) flags.push({ kind: 'archaic', text: l, note: 'Old-fashioned wording ("thou", "shall", "upon") usually reads as forced in a rap bar.' })
    const yeahs = (t.match(/\b(yeah|uh|you know|for real|and that|and stuff)\b/g) ?? []).length
    if (yeahs >= 2 || /\b(so very|indeed|and all that|and such)\b/.test(t)) flags.push({ kind: 'padding', text: l, note: 'Padding words are filling the bar rather than saying something.' })
  })
  const st = stretchedRhyme(end[0], end[1])
  if (st) flags.push({ kind: 'stretched-rhyme', text: `${end[0]} / ${end[1]}`, note: `The rhyme only works if you stress the end of “${st}”. Rappers do this on purpose — it works if the delivery commits to it.` })
  return flags
}

/** Content words in order, with which line they're in. */
function sequence(lines: [string, string]) {
  return lines.flatMap((l, li) => contentWords(l).map((w) => ({ w, li })))
}

function chainsIn(lines: [string, string]): ChainLink[][] {
  const seq = sequence(lines)
  const chains: ChainLink[][] = []
  let cur: ChainLink[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    let link: ChainLink | null = null
    // look up to three words ahead (a listener bridges small gaps like "went everywhere")
    for (let j = i + 1; j <= Math.min(seq.length - 1, i + 3) && !link; j++) {
      const l = linkBetween(seq[i].w, seq[j].w)
      if (l) link = { from: seq[i].w, to: seq[j].w, via: l.via, label: l.label }
    }
    if (link && (!cur.length || cur[cur.length - 1].to === link.from)) cur.push(link)
    else {
      if (cur.length >= 2) chains.push(cur)
      cur = link ? [link] : []
    }
  }
  if (cur.length >= 2) chains.push(cur)
  return chains
}

/** Worlds supported by words other than `except`. */
function contextWorlds(texts: string[], except: string) {
  const ws = new Map<string, string[]>()
  for (const t of texts)
    for (const w of contentWords(t)) {
      if (w === except || stem(w) === stem(except)) continue
      for (const id of worldsOf(w)) ws.set(id, [...(ws.get(id) ?? []), w])
    }
  return ws
}

function wordplayCandidates(lines: [string, string], song: string[], topic: string): WordplayCandidate[] {
  const out: WordplayCandidate[] = []
  const bars = `${lines[0]} ${lines[1]}`
  const seen = new Set<string>()
  for (const w of contentWords(bars)) {
    if (seen.has(w)) continue
    seen.add(w)
    const ctx = contextWorlds([lines[0], lines[1], topic, ...song.slice(-2)], w)
    // double duty: two of the word's meanings are both supported by what's around it
    // very common words (time, back, broke…) and stem-only matches need two supporting words per meaning
    if (NEVER_DOUBLE.has(w)) continue
    const strict = COMMON_POLY.has(w) || !(w in SENSES)
    const senses = sensesOf(w).filter((s) => (ctx.get(s.world)?.length ?? 0) >= (strict ? 2 : 1))
    const distinct = [...new Map(senses.map((s) => [s.world, s])).values()]
    if (distinct.length >= 2) {
      out.push({
        kind: 'double-duty',
        word: w,
        senses: distinct.slice(0, 2).map((s) => s.gloss),
        support: distinct.slice(0, 2).map((s) => `${worldLabel(s.world)}: ${[...new Set(ctx.get(s.world))].slice(0, 2).join(', ')}`),
        note: `“${w}” can mean ${distinct[0].gloss} and ${distinct[1].gloss} — and both fit what's around it.`,
        engine: 'rules',
        confirmed: false,
      })
      continue
    }
    // homophone: the word sounds like another word whose world is in play
    const own = new Set(worldsOf(w))
    for (const h of homophonesOf(w).slice(0, 4)) {
      const hw = worldsOf(h).filter((id) => ctx.has(id) && !own.has(id))
      if (hw.length) {
        out.push({
          kind: 'homophone',
          word: w,
          senses: [w, h],
          support: [`${worldLabel(hw[0])}: ${[...new Set(ctx.get(hw[0]))].slice(0, 2).join(', ')}`],
          note: `“${w}” sounds like “${h}”, and “${h}” fits the ${worldLabel(hw[0])} words around it.`,
          engine: 'rules',
          confirmed: false,
        })
        break
      }
    }
  }
  // two-line flip: a word from bar 1 comes back in bar 2 carrying a different meaning
  const l1 = new Set(contentWords(lines[0]).map(stem))
  for (const w of contentWords(lines[1])) {
    if (!l1.has(stem(w))) continue
    const s = sensesOf(w)
    if (s.length < 2) continue
    const c1 = contextWorlds([lines[0]], w)
    const c2 = contextWorlds([lines[1]], w)
    const a = s.find((x) => c1.has(x.world))
    const b = s.find((x) => c2.has(x.world) && x.world !== a?.world)
    if (a && b) out.push({ kind: 'two-line-flip', word: w, senses: [a.gloss, b.gloss], support: [], note: `“${w}” reads as ${a.gloss} in bar 1 and ${b.gloss} in bar 2.`, engine: 'rules', confirmed: false })
  }
  return out
}

/**
 * Possible rhyme-first filler: a rhyming end word that nothing else in the
 * bars, the challenge or the song connects to. The test is the one a coach
 * would use — if the rhyme disappeared, would this word still have a
 * reason to be here?
 */
function fillerFlags(input: AnalyseInput, endMatch: number): FillerFlag[] {
  const flags: FillerFlag[] = []
  const [l1, l2] = input.lines
  const prevEnd = input.previous.length ? lastWord(input.previous[input.previous.length - 1][1]) : null
  const candidates: { word: string; line: 0 | 1; rhymes: boolean }[] = [
    { word: lastWord(l2), line: 1, rhymes: endMatch >= 0.5 },
    { word: lastWord(l1), line: 0, rhymes: !!prevEnd && rhymeWords(lastWord(l1), prevEnd).score >= 0.5 && endMatch < 0.5 },
  ]
  for (const c of candidates) {
    const w = c.word
    if (!c.rhymes || !w || STOPWORDS.has(w) || w.length < 3 || peopleIn(w).length) continue
    const line = c.line === 0 ? l1 : l2
    const otherLine = c.line === 0 ? l2 : l1
    const context = [...contentWords(otherLine), ...input.focus, ...contentWords(input.topic), ...input.previous.flatMap((p) => contentWords(`${p[0]} ${p[1]}`))]
    const sameLine = contentWords(line).filter((x) => x !== w)
    if ([...context, ...sameLine].some((x) => linkBetween(w, x) || stem(x) === stem(w))) continue
    const songWorlds = new Set([...themesIn(`${input.topic} ${otherLine}`).keys(), ...context.flatMap(worldsOf)])
    const own = worldsOf(w)
    if (own.some((id) => songWorlds.has(id))) continue
    // evidence the rhyme chose the word: the whole line is cut off from the song,
    // or the word ends a tacked-on simile / afterthought (", like a …")
    const lineCutOff = !sameLine.some((x) => context.some((y) => linkBetween(x, y) || stem(x) === stem(y)) || worldsOf(x).some((id) => songWorlds.has(id)))
    const tacked = /(,|\blike\b|\bas\b)\s*(a |an |the |my )?\S+\s*\S*$/i.test(line.trim()) || /^(like|as)\s+(a|an|the|some)\b/i.test(line.trim())
    if (!lineCutOff && !tacked) continue
    flags.push({
      word: w,
      line: c.line,
      reason: lineCutOff
        ? `“${w}” rhymes, but nothing else in the bars or the song connects to it yet — it may be there for the rhyme.`
        : `“${w}” rhymes, but it arrives as an afterthought at the end of the line — check it earns its place and isn’t just there for the rhyme.`,
      confidence: lineCutOff && tacked ? 'likely' : 'possible',
      engine: 'rules',
    })
  }
  return flags
}

function checkConstraints(cs: Constraint[], lines: [string, string], end: { score: number }, internalCount: number, lineMulti: number, syll: [number, number]): ConstraintResult[] {
  const text = `${lines[0]} ${lines[1]}`
  const ws = words(text).map(stem)
  return cs.map((c): ConstraintResult => {
    switch (c.kind) {
      case 'avoid-words': {
        const used = c.words.filter((x) => ws.includes(stem(x.toLowerCase())))
        return { constraint: c, met: !used.length, note: used.length ? `Used ${used.map((u) => `“${u}”`).join(', ')}` : `Avoided ${c.words.map((u) => `“${u}”`).join(', ')}` }
      }
      case 'internal-rhyme':
        return { constraint: c, met: internalCount > 0, note: internalCount ? 'Internal rhyme present' : 'No internal rhyme yet' }
      case 'multi-end':
        return { constraint: c, met: lineMulti >= c.syllables, note: `${lineMulti}-syllable rhyme at the line ends` }
      case 'syllables':
        return { constraint: c, met: syll.every((n) => n >= c.min && n <= c.max), note: `${syll[0]} and ${syll[1]} syllables (aim ${c.min}–${c.max})` }
      case 'callback':
        return { constraint: c, met: ws.includes(stem(c.word)), note: ws.includes(stem(c.word)) ? `Called back “${c.word}”` : `No callback to “${c.word}”` }
      case 'one-end-rhyme':
        return { constraint: c, met: end.score >= 0.5, note: end.score >= 0.5 ? 'The two bars end on a rhyme' : "The bars don't end on a rhyme" }
      default:
        return { constraint: c, met: null, note: "The rules can't judge this one — it needs a reader" }
    }
  })
}

export function analyseBars(input: AnalyseInput): BarAnalysis {
  const lines = input.lines.map((l) => l.trim()) as [string, string]
  const sketch = isCadenceSketch(lines[0]) || isCadenceSketch(lines[1])
  const info = [lineInfo(lines[0]), lineInfo(lines[1])] as [ReturnType<typeof lineInfo>, ReturnType<typeof lineInfo>]
  const endWords: [string, string] = [info[0].endWord, info[1].endWord]
  const end = rhymeWords(endWords[0], endWords[1])
  const evidence = rhymeEvidence(lines)
  const landing = evidence.ends[0]
  const multi = landing.syllables
  const internal = evidence.internal.map(e=>({a:e.a,b:e.b,kind:e.kind as SoundRhymeKind}))
  const prevPocket = input.previous.length ? rhymePocket(input.previous[input.previous.length - 1][1])?.vowel : null

  // cadence vs the bar length: ~3–5 syllables a second is comfortable rapping
  const syll: [number, number] = [info[0].syllables, info[1].syllables]
  const target = input.secondsPerBar ? { min: Math.max(5, Math.round(input.secondsPerBar * 2.6)), max: Math.round(input.secondsPerBar * 5.6) } : null
  const mean = (syll[0] + syll[1]) / 2
  const verdict = !target || sketch ? 'unknown' : mean > target.max ? 'crowded' : mean < target.min ? 'underwritten' : 'fits'
  const imbalance = Math.max(...syll) ? Math.abs(syll[0] - syll[1]) / Math.max(...syll) : 0

  const songTexts = input.previous.map((p) => `${p[0]} ${p[1]}`)
  const before = new Set(songTexts.flatMap((t) => contentWords(t)).map(stem))
  const cws = [...contentWords(lines[0]), ...contentWords(lines[1])]
  const fresh = [...new Set(cws.filter((w) => !before.has(stem(w))))]
  const worlds = [...new Set(cws.flatMap(worldsOf))]
  const prevWorlds = new Set([...songTexts, input.topic].flatMap((t) => contentWords(t).flatMap(worldsOf)))
  const people = peopleIn(lines.join(' ')).map((p) => p.toLowerCase())
  const prevPeople = new Set(peopleIn(songTexts.join(' ')).map((p) => p.toLowerCase()))
  const connectsToSong = !input.previous.length || worlds.some((w) => prevWorlds.has(w)) || people.some((p) => prevPeople.has(p)) || cws.some((w) => before.has(stem(w)))

  const concrete = cws.filter((w) => !ABSTRACT.has(w) && (worldsOf(w).length > 0 || /\d/.test(w)) && !worldsOf(w).every((id) => id === 'mind' || id === 'time'))
  const sensory = cws.filter((w) => SENSORY.has(w))
  const imageryScore = Math.min(1, (new Set(concrete).size * 0.25 + sensory.length * 0.35 + people.length * 0.2) / 1.2)

  const wordplay = sketch ? [] : wordplayCandidates(lines, songTexts, input.topic)
  const filler = sketch ? [] : fillerFlags({ ...input, lines }, end.score)
  const naturalness = sketch ? [] : naturalnessFlags(lines, endWords)
  const chains = sketch ? [] : chainsIn(lines)

  return {
    version: 1,
    lines: [
      { ...info[0], pocket: info[0].pocket },
      { ...info[1], pocket: info[1].pocket },
    ],
    cadenceSketch: sketch,
    rhyme: {
      end: { kind: (landing.kind === 'multisyllabic' ? 'multi' : landing.kind === 'partial multisyllabic' ? 'slant' : landing.kind === 'repeated sound' ? 'identical' : landing.kind) as SoundRhymeKind, score: landing.strength, words: [landing.a, landing.b] },
      evidence: [...evidence.ends, ...evidence.internal],
      confidence: [...evidence.ends, ...evidence.internal].some(e => e.confidence === 'low') ? 'low' : 'medium',
      lineMulti: multi,
      internal,
      density: evidence.internal.length / Math.max(1, cws.length),
      continuesPocket: !!prevPocket && info[1].pocket === prevPocket,
      stretched: naturalness.find((n) => n.kind === 'stretched-rhyme')?.text ?? null,
    },
    cadence: { syllables: syll, target, verdict, imbalance, stress: [info[0].stress, info[1].stress] },
    meaning: { contentWords: cws, fresh, connectsToSong, worlds },
    chains,
    wordplay,
    filler,
    naturalness,
    imagery: { concrete: [...new Set(concrete)], sensory, score: imageryScore },
    connector: !sketch && !wordplay.length && !filler.length && !naturalness.some((n) => n.kind !== 'stretched-rhyme') && fresh.length >= 2 && connectsToSong,
    constraints: checkConstraints(input.constraints ?? [], lines, end, internal.length, multi, syll),
  }
}
