/**
 * Spelling → rough sound symbols, for words the pronunciation dictionary
 * doesn't know (slang, names, mumble syllables). Capitals = long vowels;
 * R = "er". Heuristic, tuned for words that turn up in rap verses.
 */
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

