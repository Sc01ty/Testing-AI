/**
 * Theme lexicon — what rap bars are usually *about*, with the slang that
 * signals each theme. Used by prompt-relevance scoring and by the basic
 * (rule-based) director to follow the story.
 */
export interface Theme {
  id: string
  label: string
  words: string[]
}

export const THEMES: Theme[] = [
  { id: 'money', label: 'money', words: ['money', 'cash', 'bread', 'paper', 'racks', 'rack', 'bands', 'band', 'stack', 'stacks', 'bag', 'rich', 'broke', 'bills', 'bill', 'pay', 'paid', 'dollar', 'dollars', 'pound', 'pounds', 'quid', 'grand', 'bank', 'wealth', 'cheque', 'check', 'salary', 'wage', 'income', 'debt', 'loan', 'price', 'cost', 'afford', 'buy', 'bought', 'spend', 'save', 'savings', 'gold', 'diamond', 'diamonds', 'chain', 'rolex', 'whip', 'benz', 'mansion', 'profit', 'hustle', 'earn', 'earned', 'income', 'poor', 'poverty', 'lottery'] },
  { id: 'family', label: 'family', words: ['mum', 'mom', 'mother', 'mama', 'mummy', 'dad', 'father', 'pops', 'papa', 'brother', 'bro', 'sister', 'sis', 'son', 'daughter', 'kids', 'kid', 'child', 'children', 'family', 'fam', 'nan', 'nana', 'gran', 'grandma', 'grandad', 'grandpa', 'uncle', 'auntie', 'aunt', 'cousin', 'parents'] },
  { id: 'struggle', label: 'struggle', words: ['struggle', 'pain', 'hurt', 'broke', 'hunger', 'hungry', 'starving', 'suffer', 'tears', 'cry', 'cried', 'fight', 'fighting', 'survive', 'pressure', 'stress', 'storm', 'darkness', 'trapped', 'stuck', 'scars', 'bruises', 'flats', 'estate', 'block', 'hood', 'trenches', 'ends'] },
  { id: 'success', label: 'success', words: ['success', 'winning', 'rise', 'rising', 'king', 'crown', 'throne', 'fame', 'famous', 'legend', 'goat', 'champion', 'victory', 'glory', 'summit', 'growth', 'achieve', 'dream', 'dreams', 'goal', 'goals', 'blessed'] },
  { id: 'ambition', label: 'ambition', words: ['ambition', 'grind', 'grinding', 'hustle', 'hustling', 'focus', 'goal', 'goals', 'vision', 'chase', 'chasing', 'hungry', 'motivated', 'driven', 'determined', 'someday', 'one day', 'climb', 'climbing'] },
  { id: 'love', label: 'love', words: ['love', 'heart', 'girl', 'boy', 'babe', 'kiss', 'romance', 'ex', 'together', 'relationship', 'feelings', 'miss', 'missing', 'loving', 'lover', 'darling', 'crush', 'wife', 'husband', 'ring', 'marry'] },
  { id: 'betrayal', label: 'betrayal', words: ['betray', 'betrayed', 'snake', 'snakes', 'fake', 'fraud', 'traitor', 'switched', 'switch', 'backstab', 'backstabbed', 'lied', 'lie', 'lies', 'liar', 'trust', 'loyal', 'loyalty', 'disloyal', 'turned', 'opps', 'enemy', 'enemies', 'hater', 'haters', 'jealous', 'envy'] },
  { id: 'friends', label: 'friends', words: ['friend', 'friends', 'mate', 'mates', 'bro', 'bros', 'gang', 'squad', 'crew', 'team', 'homie', 'homies', 'brothers', 'guys', 'circle', 'day ones', 'bredren', 'fam', 'brudda'] },
  { id: 'regret', label: 'regret', words: ['regret', 'regrets', 'sorry', 'mistake', 'mistakes', 'wrong', 'should', 'wish', 'past', 'back then', 'used', 'remember', 'memories', 'forgive', 'guilt', 'shame', 'blame', 'apologise', 'apologize', 'change', 'changed'] },
  { id: 'city', label: 'home & city', words: ['city', 'streets', 'street', 'road', 'roads', 'block', 'hood', 'ends', 'estate', 'flats', 'town', 'london', 'manchester', 'birmingham', 'north', 'south', 'east', 'west', 'bus', 'train', 'corner', 'postcode', 'area', 'neighbourhood', 'neighborhood', 'concrete', 'tower', 'council'] },
  { id: 'school', label: 'school', words: ['school', 'teacher', 'teachers', 'class', 'classroom', 'exam', 'exams', 'grades', 'homework', 'detention', 'college', 'uni', 'university', 'study', 'studying', 'lesson', 'lessons', 'head', 'headteacher', 'principal', 'expelled', 'suspended', 'learn', 'learned', 'learnt'] },
  { id: 'fame', label: 'fame', words: ['fame', 'famous', 'stage', 'crowd', 'fans', 'fan', 'spotlight', 'camera', 'cameras', 'views', 'streams', 'charts', 'radio', 'tour', 'mic', 'microphone', 'record', 'album', 'label', 'deal', 'interview', 'red carpet', 'celebrity', 'viral'] },
  { id: 'time', label: 'time', words: ['clock', 'years', 'tonight', 'morning', 'yesterday', 'tomorrow', 'forever', 'moment', 'minute', 'hour', 'age'] },
  { id: 'faith', label: 'faith', words: ['god', 'pray', 'prayer', 'prayers', 'praying', 'faith', 'believe', 'heaven', 'angel', 'angels', 'church', 'blessed', 'blessing', 'blessings', 'soul', 'spirit', 'devil', 'hell', 'sin', 'sins', 'lord'] },
  { id: 'confidence', label: 'confidence', words: ['best', 'greatest', 'goat', 'king', 'boss', 'untouchable', 'unstoppable', 'bars', 'flow', 'competition', 'elite'] },
  { id: 'space', label: 'space', words: ['space', 'moon', 'stars', 'star', 'planet', 'planets', 'mars', 'rocket', 'galaxy', 'orbit', 'astronaut', 'universe', 'sky', 'comet', 'alien', 'gravity', 'nasa', 'launch'] },
]

const index = new Map<string, string[]>()
for (const t of THEMES) for (const w of t.words) index.set(w, [...(index.get(w) ?? []), t.id])

export function themesOfWord(word: string): string[] {
  return index.get(word.toLowerCase()) ?? []
}

/** Theme weights in a text (counts of signalling words). */
export function themesIn(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  const lower = text.toLowerCase()
  for (const t of THEMES) {
    let n = 0
    for (const w of t.words) {
      if (w.includes(' ')) {
        if (lower.includes(w)) n++
      } else if (new RegExp(`\\b${w}\\b`).test(lower)) n++
    }
    if (n) counts.set(t.id, n)
  }
  return counts
}

export function themeLabel(id: string) {
  return THEMES.find((t) => t.id === id)?.label ?? id
}

/** Words that stand for a topic the user typed ("wanting money" → money theme words). */
export function topicWords(topic: string): string[] {
  const own = topic
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length > 2)
  const themes = themesIn(topic)
  const extra = [...themes.keys()].flatMap((id) => THEMES.find((t) => t.id === id)!.words)
  return [...new Set([...own, ...extra])]
}

/** People and things worth calling back to later in the song. */
const PEOPLE = new Set(['mum', 'mom', 'mother', 'mama', 'dad', 'father', 'pops', 'brother', 'bro', 'sister', 'sis', 'son', 'daughter', 'nan', 'nana', 'gran', 'grandma', 'grandad', 'uncle', 'auntie', 'cousin', 'girl', 'wife', 'kids', 'teacher', 'friend', 'friends', 'mates', 'boss', 'ex', 'baby'])

export function peopleIn(text: string): string[] {
  const found = new Set<string>()
  for (const w of text.toLowerCase().match(/[a-z']+/g) ?? []) if (PEOPLE.has(w)) found.add(w)
  // Names: a capitalised word right after a cue ("me and Jordan", "told Kayla", "with Marcus").
  // Sentence-initial capitals ("Smiled like…") are not names.
  for (const m of text.matchAll(/\b(?:and|with|told|for|called|named|tell|ask|asked|call|text|texted|me|to|from|like)\s+([A-Z][a-z]{2,})\b/g)) found.add(m[1])
  return [...found]
}
