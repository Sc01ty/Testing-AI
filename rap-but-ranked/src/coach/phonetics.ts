import { baseVowel, isVowel, sound, alternatePron, stressOf, type WordSound } from './lexicon'

/**
 * Rhyme and rhythm from SOUND, not spelling ("flats"/"stacks", "see"/"sea",
 * "paper"/"later" are judged by how they're said).
 *
 * Rhyme kinds, strongest first:
 *   multi       2+ syllables match in a row ("money"/"honey", "station"/"patience")
 *   perfect     everything from the stressed vowel on matches ("night"/"light")
 *   slant       same stressed vowel, similar ending ("flats"/"stacks")
 *   assonance   same stressed vowel only ("home"/"stone" ok, "home"/"hope")
 *   consonance  same ending consonants, different vowel ("back"/"rock")
 *   identical   same sound, maybe different word ("see"/"sea") — a homophone, not a rhyme
 */
export type SoundRhymeKind = 'multi' | 'perfect' | 'slant' | 'assonance' | 'consonance' | 'identical' | 'none'

export interface RhymeMatch {
  kind: SoundRhymeKind
  /** 0..1 — how strongly it reads as a rhyme. */
  score: number
  /** Vowels (syllables) matched from the end. */
  syllables: number
}

const NONE: RhymeMatch = { kind: 'none', score: 0, syllables: 0 }

/** Vowels that most accents merge (cot / caught). */
const NEAR: Record<string, string> = { AO: 'AA' }
const norm = (v: string) => NEAR[baseVowel(v)] ?? baseVowel(v)

/** Index of the vowel a rhyme starts from: the last primary-stressed one (or the last stressed, or the last). */
function rhymeStart(phones: string[]) {
  let primary = -1
  let secondary = -1
  let last = -1
  phones.forEach((p, i) => {
    if (!isVowel(p)) return
    last = i
    if (stressOf(p) === 1) primary = i
    if (stressOf(p) === 2) secondary = i
  })
  // a secondary stress after the last primary (e.g. compounds) still carries the rhyme
  return Math.max(primary, secondary > primary ? secondary : -1, primary < 0 ? last : -1)
}

const vowelsOf = (phones: string[]) => phones.filter(isVowel).map(norm)
const tailOf = (phones: string[]) => phones.slice(Math.max(0, rhymeStart(phones))).map((p) => (isVowel(p) ? norm(p) : p))
const codaOf = (phones: string[]) => {
  const out: string[] = []
  for (let i = phones.length - 1; i >= 0 && !isVowel(phones[i]); i--) out.unshift(phones[i])
  return out
}

const CLASS: Record<string, string> = { P: 'stop', B: 'stop', T: 'stop', D: 'stop', K: 'stop', G: 'stop', M: 'nasal', N: 'nasal', NG: 'nasal', F: 'fric', V: 'fric', S: 'fric', Z: 'fric', TH: 'fric', DH: 'fric', SH: 'fric', ZH: 'fric', CH: 'affr', JH: 'affr', L: 'liq', R: 'liq' }
const codaClass = (c: string[]) => c.filter((p) => p !== 'S' && p !== 'Z').map((p) => CLASS[p] ?? p).join('-') || 'open'

/** Trailing vowels the two sequences share, counting from the end. */
function sharedTrailingVowels(a: string[], b: string[]) {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

export function compareSounds(a: WordSound, b: WordSound): RhymeMatch {
  if (a.word === b.word) return NONE
  const pa = a.phones.map((p) => (isVowel(p) ? norm(p) : p)).join(' ')
  const pb = b.phones.map((p) => (isVowel(p) ? norm(p) : p)).join(' ')
  if (pa === pb) return { kind: 'identical', score: 0, syllables: vowelsOf(a.phones).length }

  const ta = tailOf(a.phones)
  const tb = tailOf(b.phones)
  const va = vowelsOf(a.phones)
  const vb = vowelsOf(b.phones)
  const shared = sharedTrailingVowels(va, vb)
  const tailVowels = Math.max(ta.filter(isVowel).length, tb.filter(isVowel).length)

  if (ta.join(' ') === tb.join(' ')) {
    // same sound from the stressed vowel on; extra matching vowels before it make it a multi
    return shared >= 2 ? { kind: 'multi', score: 1, syllables: shared } : { kind: 'perfect', score: 0.9, syllables: 1 }
  }
  const sa = ta.find(isVowel)
  const sb = tb.find(isVowel)
  // a slant / vowel rhyme also needs the same number of syllables after the stress
  // ("jar" / "unSTOPpable" share a vowel but don't rhyme)
  const sameShape = ta.filter(isVowel).length === tb.filter(isVowel).length
  if (sa && sa === sb && !sameShape) return { kind: 'assonance', score: 0.4, syllables: 1 }
  if (sa && sa === sb) {
    if (shared >= 2 && shared >= tailVowels) {
      // every vowel from the stress on matches, only consonants differ ("paper"/"later")
      return codaClass(codaOf(a.phones)) === codaClass(codaOf(b.phones)) ? { kind: 'multi', score: 0.9, syllables: shared } : { kind: 'slant', score: 0.75, syllables: shared }
    }
    if (codaClass(codaOf(a.phones)) === codaClass(codaOf(b.phones))) return { kind: 'slant', score: 0.7, syllables: 1 }
    const ca = codaOf(a.phones).at(-1), cb = codaOf(b.phones).at(-1)
    const near = [['D','Z'],['T','S'],['T','SH'],['S','SH'],['M','P'],['M','B'],['N','D'],['N','T']].some(pair => pair.includes(ca ?? '') && pair.includes(cb ?? ''))
    return { kind: near ? 'slant' : 'assonance', score: near ? 0.68 : 0.5, syllables: 1 }
  }
  const ca = codaOf(a.phones).join(' ')
  if (ca && ca === codaOf(b.phones).join(' ')) return { kind: 'consonance', score: 0.25, syllables: 0 }
  return NONE
}

export function rhymeWords(a: string, b: string): RhymeMatch {
  const sa = sound(a)
  const sb = sound(b)
  if (!sa || !sb) return NONE
  const variants = (s: WordSound) => {
    const alt = alternatePron(s.word)
    return alt ? [s, { ...s, phones: alt }] : [s]
  }
  return variants(sa).flatMap(x => variants(sb).map(y => compareSounds(x, y))).sort((x, y) => y.score - x.score)[0]
}

// ── lines: syllables, stress, rhyme across word boundaries ──────────────
/** Function words are unstressed in running speech even when the dictionary says otherwise. */
const WEAK = new Set(
  `a an the and or but so if of to in on at by for from with as is am are was were be been i me my you your he him his she her it its we us our they them their that this than then do does did have has had will would can could should not no just like up out off`.split(' '),
)

export interface LineSyllable {
  word: string
  /** 0 weak, 1 strong (as it would likely fall when rapped). */
  stress: 0 | 1
  vowel: string
}

/** The line as a run of syllables with likely stresses — the written cadence. */
export function lineSyllables(line: string): LineSyllable[] {
  const words = line.toLowerCase().match(/[a-z']+/g) ?? []
  const out: LineSyllable[] = []
  words.forEach((w, wi) => {
    const s = sound(w)
    if (!s) return
    const vs = s.phones.filter(isVowel)
    const lastWord = wi === words.length - 1
    vs.forEach((v) => {
      let stress: 0 | 1 = stressOf(v) >= 1 ? 1 : 0
      if (vs.length === 1) stress = WEAK.has(s.word) && !lastWord ? 0 : 1
      out.push({ word: s.word, stress, vowel: norm(v) })
    })
  })
  return out
}

/** Stress pattern like "da-DA-da-da-DA" (for showing a cadence back to the player). */
export function stressString(syl: LineSyllable[]) {
  return syl.map((s) => (s.stress ? 'DA' : 'da')).join('-')
}

/**
 * How many syllables at the end of two lines share vowel sounds — across
 * word boundaries ("out the flats" / "now the stacks"). This is what makes
 * a multisyllabic rhyme in rap, and spelling can't see it.
 */
export function lineEndMatch(a: string, b: string): { syllables: number; vowels: string[] } {
  const sa = lineSyllables(a)
  const sb = lineSyllables(b)
  // stressed syllables must share a vowel; weak ones ("for" / "to") can differ, as rappers bend them
  let n = 0
  let lastExact = 0
  while (n < sa.length && n < sb.length) {
    const x = sa[sa.length - 1 - n]
    const y = sb[sb.length - 1 - n]
    if (x.vowel === y.vowel) lastExact = n + 1
    else if (x.stress || y.stress) break
    n++
  }
  const m = lastExact // don't count loose syllables beyond the last real match
  return { syllables: m, vowels: sa.slice(sa.length - m).map((s) => s.vowel) }
}

/** Vowel sound of the last stressed syllable — the line's "rhyme pocket". */
export function rhymePocket(line: string): { vowel: string; word: string } | null {
  const syl = lineSyllables(line)
  for (let i = syl.length - 1; i >= 0; i--) if (syl[i].stress) return { vowel: syl[i].vowel, word: syl[i].word }
  return syl.length ? { vowel: syl[syl.length - 1].vowel, word: syl[syl.length - 1].word } : null
}

const VOWEL_NAMES: Record<string, string> = { AA: 'ah', AE: 'a (cat)', AH: 'uh', AW: 'ow', AY: 'eye', EH: 'e (bed)', ER: 'er', EY: 'ay', IH: 'i (sit)', IY: 'ee', OW: 'oh', OY: 'oy', UH: 'oo (book)', UW: 'oo' }
export const vowelName = (v: string) => VOWEL_NAMES[v] ?? v.toLowerCase()
