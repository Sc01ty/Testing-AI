/**
 * Builds src/coach/data/lexicon.json: common English words (SCOWL tiers,
 * MIT-style licence) with their CMU pronunciations (ISC / BSD).
 *
 *   { v: 1, w: { word: [phones, tier] } }   tier: 1 = most common … 5
 *
 * Run: node scripts/build-lexicon.mjs   (output is committed; the app never
 * needs these packages at runtime)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dictionary } from 'cmu-pronouncing-dictionary'

const require = createRequire(import.meta.url)
const tiers = [10, 20, 35, 40, 50]
const tierOf = new Map()
tiers.forEach((t, i) => {
  for (const dialect of ['english', 'british', 'american']) {
    const list = JSON.parse(readFileSync(require.resolve(`wordlist-english/${dialect}-words-${t}.json`), 'utf8'))
    for (const w of list) {
      const k = w.toLowerCase()
      if (!/^[a-z']+$/.test(k)) continue
      if (!tierOf.has(k)) tierOf.set(k, i + 1)
    }
  }
})
// rap / UK slang the word lists miss but CMU knows (or close enough)
const extra = ['innit', 'bruv', 'bro', 'fam', 'mandem', 'ting', 'peng', 'gang', 'opps', 'bando', 'drip', 'flex', 'lit', 'racks', 'bands', 'guap', 'dough', 'cheddar', 'whip', 'ends', 'trenches', 'mic', 'beat', 'flow', 'bars', 'diss', 'hood', 'homie', 'homies', 'yo', 'ya', "y'all", 'gonna', 'wanna', 'gotta', 'tryna', "ain't", 'mum', 'nan']
for (const w of extra) if (!tierOf.has(w)) tierOf.set(w, 3)

const out = {}
let n = 0
for (const [w, tier] of tierOf) {
  const p = dictionary[w]
  if (!p) continue
  out[w] = [p, tier]
  n++
}
// keep a few heavy-use variants as alternates ("read" past, "live" adjective…)
const alt = {}
for (const w of Object.keys(out)) {
  const p2 = dictionary[`${w}(2)`]
  if (p2 && tierOf.get(w) <= 2) alt[w] = p2
}
writeFileSync(new URL('../src/coach/data/lexicon.json', import.meta.url), JSON.stringify({ v: 1, w: out, alt }))
console.log('words', n, 'alts', Object.keys(alt).length)
