/**
 * Small English text toolkit for bars: tokens, syllables, and a
 * spelling-to-sound rhyme key. Heuristic (no pronunciation dictionary),
 * tuned for the kind of words that turn up in rap verses.
 */

export const STOPWORDS = new Set(
  `a an the and or but so if then than that this these those to of in on at by for with from up down out over under into onto off
   i me my mine im i'm ive i've id i'd ill i'll you your youre you're ya yall y'all he him his she her hers it its it's we us our they them their
   is am are was were be been being do does did done have has had having get got gotta gonna wanna will would should could can cant can't
   dont don't didnt didn't wont won't aint ain't not no yes yeah yea uh oh ooh ay ayy yo like just really very all some any every each
   what when where who why how which there here now then too also only even still ever never always again more most much many lot
   one two`.split(/\s+/),
)

export function words(line: string): string[] {
  return (line.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).map((w) => w.replace(/'/g, "'"))
}

export function contentWords(line: string): string[] {
  return words(line).filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/** Rough stem for matching ("dreaming" → "dream", "stacks" → "stack"). */
export function stem(w: string): string {
  let s = w.toLowerCase().replace(/'s$/, '')
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('in') && !s.endsWith('ain')) s = s.slice(0, -2) // grindin'
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y'
  else if (s.length > 3 && s.endsWith('es') && /(sh|ch|x|ss)es$/.test(s)) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (/(.)\1$/.test(s) && s.length > 3) s = s.slice(0, -1) // "grinn" → "grin"
  return s
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  let s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = s.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export function lineSyllables(line: string) {
  return words(line).reduce((n, w) => n + syllables(w), 0)
}

// ── rhyme ────────────────────────────────────────────────────────────
const IRREGULAR: Record<string, string> = {
  now: 'naw', how: 'haw', wow: 'waw', cow: 'kaw', allow: 'alaw', vow: 'vaw', down: 'dawn', town: 'tawn', crown: 'krawn', clown: 'klawn',
  you: 'yU', through: 'thrU', who: 'hU', do: 'dU', to: 'tU', two: 'tU', true: 'trU', crew: 'krU', new: 'nU', knew: 'nU',
  love: 'luv', above: 'abuv', of: 'uv', come: 'kum', some: 'sum', done: 'dun', one: 'wun', none: 'nun', won: 'wun', son: 'sun',
  gone: 'gon', give: 'giv', live: 'liv', have: 'hav', move: 'mUv', prove: 'prUv', lose: 'lUz', whose: 'hUz',
  said: 'sed', says: 'sez', been: 'bin', again: 'agen', friend: 'frend', friends: 'frendz', heart: 'hARt', heard: 'hRd', word: 'wRd',
  world: 'wRld', work: 'wRk', worth: 'wRth', worse: 'wRs', first: 'fRst', girl: 'gRl', blood: 'blud', flood: 'flud', good: 'gud',
  could: 'kud', would: 'wud', should: 'shud', though: 'thO', dough: 'dO', tough: 'tuf', rough: 'ruf', enough: 'enuf', thought: 'thot',
  bought: 'bot', caught: 'kot', taught: 'tot', fought: 'fot', brought: 'brot', mum: 'mum', mom: 'mom', eye: 'I', eyes: 'Iz', buy: 'bI', guy: 'gI',
  money: 'munE', honey: 'hunE', what: 'wot', want: 'wont', war: 'wOR', door: 'dOR', floor: 'flOR', four: 'fOR', more: 'mOR', your: 'yOR', bread: 'bred',
  dead: 'ded', head: 'hed', said_: 'sed', ready: 'redE', heavy: 'hevE', people: 'pEpl', mind: 'mInd', find: 'fInd', kind: 'kInd', grind: 'grInd', behind: 'bihInd', blind: 'blInd',
}

/** Rewrite spelling into rough sound symbols. Capitals = long vowels; R = "er". */
export function phonetic(word: string): string {
  const w0 = word.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '')
  if (!w0) return ''
  if (IRREGULAR[w0]) return IRREGULAR[w0]
  // keep plural/verb -s off the core and re-attach as z
  let w = w0
  let suffix = ''
  if (w.length > 3 && /[^s]s$/.test(w) && !/(us|is|ss)$/.test(w)) {
    const core = w.slice(0, -1)
    if (IRREGULAR[core]) return IRREGULAR[core] + 'z'
    w = core
    suffix = 'z'
  }
  // past tense: "planned" → plan+d, "smiled" → smile+d, "wanted" → want+id
  if (w.length > 4 && /ed$/.test(w) && !/eed$/.test(w)) {
    const core = w.slice(0, -2)
    if (/[td]$/.test(core)) return phonetic(core) + 'id' + suffix
    if (/([b-df-hj-np-tv-z])\1$/.test(core)) return phonetic(core.slice(0, -1)) + 'd' + suffix
    if (/[aeiou][b-df-hj-np-tv-z]$/.test(core) && !/[aeiou]{2}[b-df-hj-np-tv-z]$/.test(core)) return phonetic(core + 'e') + 'd' + suffix
    return phonetic(core) + 'd' + suffix
  }
  // g-dropping: "grindin" ≈ "grinding"
  if (/in$/.test(w) && w.length > 4 && /[^aeiou]in$/.test(w)) w = w + 'g'
  w = w
    .replace(/tion$|sion$/, 'shun')
    .replace(/tience$|cience$/, 'shuns')
    .replace(/ild$/, 'Ild') // wild, child, mild
    .replace(/tient$|cient$/, 'shunt')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks')
    .replace(/igh/g, 'I')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/ough/g, 'O')
    .replace(/augh/g, 'o')
    .replace(/(ee|ea|ie(?=[^aeiou]|$)|ei)/g, 'E')
    .replace(/oo/g, 'U')
    .replace(/(ou|ow(?=[^aeiou]|$))(?=[^aeiou]*$)/g, (m) => (m === 'ow' ? 'O' : 'aw'))
    .replace(/ou/g, 'aw')
    .replace(/(ai|ay|ey$)/g, 'A')
    .replace(/(oa|oe$)/g, 'O')
    .replace(/(ue|ew)$/g, 'U')
    .replace(/ar(?![aeiouy])/g, 'AR')
    .replace(/or(?![aeiouy])/g, 'OR')
    .replace(/(er|ir|ur|ear(?=[^aeiou]))(?![aeiouy])/g, 'R')
  // magic e: vowel + consonant(s) + e at the end → long vowel
  w = w.replace(/([aeiouy])([^aeiouyAEIOUR]{1,2})e$/, (_m, v: string, c: string) => (v === 'y' ? 'I' : v.toUpperCase()) + c)
  // final y: "money" → E (multi-syllable), "fly" → I
  if (/y$/.test(w)) w = /[aeiouAEIOUR].*[^aeiouAEIOUR]y$/.test(w) ? w.slice(0, -1) + 'E' : w.slice(0, -1) + 'I'
  // single final e after a vowel sound ("the", "be", "she")
  if (/[^aeiou]e$/.test(w) && w.length <= 3) w = w.slice(0, -1) + 'E'
  w = w.replace(/([^aeiouAEIOUR])e$/, '$1') // silent e
  // open final vowel is long: go / no / bro → O, hi → I, flu → U
  w = w.replace(/([^aeiouAEIOUR])o$/, '$1O').replace(/([^aeiouAEIOUR])i$/, '$1I').replace(/([^aeiouAEIOUR])u$/, '$1U')
  w = w.replace(/([b-df-hj-np-tv-z])\1/g, '$1') // double consonants
  w = w.replace(/y(?=[^aeiou])/g, 'i')
  return w + suffix
}

const VOWELS = /[aeiouAEIOUR]+/g

/** Vowel "nuclei" in order: e.g. "money" → ["u", "E"]. */
export function nuclei(word: string): string[] {
  return phonetic(word).match(VOWELS) ?? []
}

/** From the last vowel sound to the end: the part that has to match for a rhyme. */
export function rhymeTail(word: string, syllablesBack = 1): string {
  const p = phonetic(word)
  const idx: number[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(VOWELS.source, 'g')
  while ((m = re.exec(p))) idx.push(m.index)
  if (!idx.length) return p
  return p.slice(idx[Math.max(0, idx.length - syllablesBack)])
}

const CONS_CLASS: Record<string, string> = { p: 'stop', b: 'stop', t: 'stop', d: 'stop', k: 'stop', g: 'stop', m: 'nasal', n: 'nasal', f: 'fric', v: 'fric', s: 'fric', z: 'fric', h: 'fric' }
function codaClass(tail: string) {
  const coda = tail.replace(/^[aeiouAEIOUR]+/, '').replace(/z$/, '')
  if (!coda) return 'open'
  return [...coda].map((c) => CONS_CLASS[c] ?? c).join('-')
}

export type RhymeKind = 'perfect' | 'multi' | 'slant' | 'assonance' | 'none'

/** How well two words rhyme: 0..1 plus a label. */
export function rhymeStrength(a: string, b: string): { score: number; kind: RhymeKind } {
  const wa = a.toLowerCase().replace(/[^a-z']/g, '')
  const wb = b.toLowerCase().replace(/[^a-z']/g, '')
  if (!wa || !wb || wa === wb) return { score: 0, kind: 'none' }
  if (stem(wa) === stem(wb)) return { score: 0, kind: 'none' } // same word, different ending
  const t1 = rhymeTail(wa)
  const t2 = rhymeTail(wb)
  const n1 = nuclei(wa)
  const n2 = nuclei(wb)
  const multi = n1.length >= 2 && n2.length >= 2 && n1[n1.length - 2] === n2[n2.length - 2] && n1[n1.length - 1] === n2[n2.length - 1]
  const strip = (t: string) => t.replace(/z$/, '')
  if (strip(t1) === strip(t2)) return multi ? { score: 1, kind: 'multi' } : { score: 0.9, kind: 'perfect' }
  const v1 = t1.match(/^[aeiouAEIOUR]+/)?.[0]
  const v2 = t2.match(/^[aeiouAEIOUR]+/)?.[0]
  if (v1 && v1 === v2) {
    if (codaClass(t1) === codaClass(t2)) return { score: multi ? 0.85 : 0.7, kind: 'slant' }
    return { score: multi ? 0.65 : 0.5, kind: 'assonance' }
  }
  return { score: 0, kind: 'none' }
}

export function lastWord(line: string): string {
  const w = words(line)
  return w[w.length - 1] ?? ''
}
