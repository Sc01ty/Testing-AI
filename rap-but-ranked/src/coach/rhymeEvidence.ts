import { sound } from './lexicon'
import { lineEndMatch, rhymePocket, rhymeWords } from './phonetics'
import { STOPWORDS, words } from '../lyrics/text'

export interface RhymeEvidence {
  a: string
  b: string
  kind: string
  strength: number
  syllables: number
  confidence: 'medium' | 'low'
}

const endings = (line: string) => {
  const ws = words(line)
  // Ad-lib filler should not hide the intended landing.
  while (ws.length > 1 && /^(yeah|yo|uh|um|ayy|aye|oh)$/.test(ws.at(-1)!)) ws.pop()
  return ws
}

export function endingEvidence(a: string, b: string): RhymeEvidence {
  const wa = endings(a),
    wb = endings(b)
  const x = wa.at(-1) ?? '',
    y = wb.at(-1) ?? ''
  const match = rhymeWords(x, y)
  const same = !x || !y || x === y || match.kind === 'identical'
  const multi = same ? 0 : lineEndMatch(wa.join(' '), wb.join(' ')).syllables
  // A phrase multi needs a real landing; matching unstressed vowels alone is insufficient.
  const syllables = same
    ? 0
    : match.score >= 0.5
      ? Math.min(4, Math.max(match.syllables, multi))
      : match.syllables
  const span = (ws: string[]) => {
    let n = 0,
      count = 0
    for (let i = ws.length - 1; i >= 0 && n < syllables; i--) {
      n += sound(ws[i])?.phones.filter((p) => /^[AEIOU]/.test(p)).length ?? 0
      count++
    }
    return ws.slice(-Math.max(1, count)).join(' ')
  }
  const known = [
    ...words(syllables >= 2 ? span(wa) : x),
    ...words(syllables >= 2 ? span(wb) : y),
  ].every((w) => sound(w)?.known)
  return {
    a: syllables >= 2 ? span(wa) : x,
    b: syllables >= 2 ? span(wb) : y,
    kind: same
      ? 'repeated sound'
      : syllables >= 2
        ? match.kind === 'multi' && match.score >= 0.9
          ? 'multisyllabic'
          : 'partial multisyllabic'
        : match.kind,
    strength: same ? 0 : Math.min(1, match.score + Math.max(0, syllables - 1) * 0.06),
    syllables,
    confidence: known ? 'medium' : 'low',
  }
}

export function rhymeEvidence(lines: string[]) {
  const ends = lines.slice(1).map((line, i) => endingEvidence(lines[i], line))
  const internal: RhymeEvidence[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const ws = [...new Set(words(line).filter((w) => w.length > 2 && !STOPWORDS.has(w)))]
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++) {
        const m = rhymeWords(ws[i], ws[j]),
          key = [ws[i], ws[j]].sort().join('/')
        if (m.score < 0.65 || seen.has(key)) continue
        seen.add(key)
        internal.push({
          a: ws[i],
          b: ws[j],
          kind: m.kind,
          strength: m.score,
          syllables: m.syllables,
          confidence: sound(ws[i])?.known && sound(ws[j])?.known ? 'medium' : 'low',
        })
      }
  }
  const families = new Map<string, Set<string>>()
  for (const line of lines) {
    const p = rhymePocket(endings(line).join(' '))
    if (p) {
      const family = families.get(p.vowel) ?? new Set<string>()
      family.add(p.word)
      families.set(p.vowel, family)
    }
  }
  return {
    ends,
    internal,
    families: [...families]
      .filter(([, ws]) => ws.size >= 3)
      .map(([vowel, ws]) => ({ vowel, words: [...ws] })),
  }
}

export const evidenceText = (e: RhymeEvidence) =>
  `“${e.a}” / “${e.b}” — ${e.kind === 'none' ? 'weak / no clear match' : e.kind}${e.confidence === 'low' ? ' (pronunciation guessed)' : ''}`
