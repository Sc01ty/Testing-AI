import { phonetic } from '../lyrics/spelling'

/**
 * Pronunciations. ~43k common English words with CMU dictionary phones
 * (ARPAbet, vowels carry stress: 1 primary, 2 secondary, 0 none), built by
 * scripts/build-lexicon.mjs and loaded lazily (~370 KB gzipped).
 *
 * Anything not in it — slang, names, typos, mumble syllables — gets a
 * spelling-based guess in the same format, flagged `known: false`, so the
 * rest of the system never has to care where a pronunciation came from.
 */
interface Lex {
  w: Record<string, [string, number]>
  alt: Record<string, string>
}

let lex: Lex | null = null
let loading: Promise<void> | null = null

export function ensureLexicon(): Promise<void> {
  loading ??= import('./data/lexicon.json').then((m) => {
    lex = (m as unknown as { default: Lex }).default ?? (m as unknown as Lex)
  })
  return loading
}

export const lexiconReady = () => !!lex

export interface WordSound {
  word: string
  phones: string[]
  /** From the dictionary (true) or guessed from spelling (false). */
  known: boolean
  /** 1 = very common … 5 = less common; 9 = not in the list. */
  tier: number
}

const clean = (w: string) => w.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '')

function lookup(w: string): [string[], number] | null {
  const e = lex?.w[w]
  return e ? [e[0].split(' '), e[1]] : null
}

/** Dictionary lookup with the usual rap spellings folded in (grindin' → grinding, mans → man+z…). */
function fromLexicon(w: string): [string[], number] | null {
  const direct = lookup(w)
  if (direct) return direct
  // g-dropping: "grindin" / "grindin'"
  const g = w.replace(/in'?$/, 'ing')
  if (g !== w) {
    const r = lookup(g)
    if (r) return [[...r[0].slice(0, -1), 'N'], r[1]]
  }
  // possessive / plural / 3rd person
  if (/'s$/.test(w)) {
    const r = lookup(w.slice(0, -2))
    if (r) return [[...r[0], 'Z'], r[1]]
  }
  if (/[^s]s$/.test(w)) {
    const r = lookup(w.slice(0, -1))
    if (r) return [[...r[0], /[PTKF]$|TH$/.test(r[0][r[0].length - 1]) ? 'S' : 'Z'], r[1]]
  }
  return null
}

// spelling guess → ARPAbet-like phones (vowel symbols from lyrics/text.ts phonetic())
const V: Record<string, string> = { a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH', y: 'IH', A: 'EY', E: 'IY', I: 'AY', O: 'OW', U: 'UW', R: 'ER' }
const C: Record<string, string> = { b: 'B', c: 'K', d: 'D', f: 'F', g: 'G', h: 'HH', j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', q: 'K', r: 'R', s: 'S', t: 'T', v: 'V', w: 'W', x: 'K', z: 'Z' }

function guess(w: string): string[] {
  const p = phonetic(w)
  const out: string[] = []
  let first = true
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]
    if (ch === 'a' && p[i + 1] === 'w') {
      out.push(first ? 'AW1' : 'AW0')
      first = false
      i++
    } else if (V[ch]) {
      out.push(V[ch] + (first ? '1' : '0'))
      first = false
    } else if (ch === 's' && p[i + 1] === 'h') {
      out.push('SH')
      i++
    } else if (ch === 't' && p[i + 1] === 'h') {
      out.push('TH')
      i++
    } else if (ch === 'c' && p[i + 1] === 'h') {
      out.push('CH')
      i++
    } else if (ch === 'n' && p[i + 1] === 'g') {
      out.push('NG')
      i++
    } else if (C[ch]) out.push(C[ch])
  }
  return out
}

const cache = new Map<string, WordSound>()

export function sound(word: string): WordSound | null {
  const w = clean(word)
  if (!w) return null
  const hit = cache.get(w)
  if (hit && (hit.known || !lex)) return hit
  const r = lex ? fromLexicon(w) : null
  const s: WordSound = r ? { word: w, phones: r[0], known: true, tier: r[1] } : { word: w, phones: guess(w), known: false, tier: 9 }
  if (!s.phones.some(isVowel)) return null
  cache.set(w, s)
  return s
}

/** Words the lexicon knows (for rhyme / homophone search), most common first. */
export function lexiconEntries(maxTier = 5): [string, string[], number][] {
  if (!lex) return []
  const out: [string, string[], number][] = []
  for (const [w, [p, t]] of Object.entries(lex.w)) if (t <= maxTier) out.push([w, p.split(' '), t])
  return out
}

export function alternatePron(word: string): string[] | null {
  const a = lex?.alt[clean(word)]
  return a ? a.split(' ') : null
}

export const isVowel = (ph: string) => /^[AEIOU]/.test(ph)
export const baseVowel = (ph: string) => ph.replace(/\d$/, '')
export const stressOf = (ph: string) => Number(ph.slice(-1)) || 0
