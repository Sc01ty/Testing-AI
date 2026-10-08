import { THEMES } from '../lyrics/themes'
import { stem } from '../lyrics/text'
import { isVowel, lexiconEntries, sound } from './lexicon'

/**
 * Semantic worlds and second meanings — the deterministic side of the
 * coach's "connections", "flip", semantic-chain and filler checks.
 *
 * WORLDS group words that belong to the same scene (money, time, the sea,
 * photography…). SENSES lists words with more than one meaning, each tied
 * to a world: when a bar's context supports two of a word's worlds, the
 * word may be doing double duty. Homophones come from the pronunciation
 * dictionary itself (same sounds, different spelling), not a fixed list.
 *
 * This is a lexicon, not understanding: it finds *candidates* and says so.
 * Judging whether a double meaning actually lands is the language model's
 * job when it's available.
 */
export interface World {
  id: string
  label: string
  words: string[]
}

const EXTRA_WORLDS: World[] = [
  { id: 'money', label: 'money', words: ['wage', 'wages', 'hourly', 'interest', 'value', 'change', 'coins', 'notes', 'note', 'bills', 'cheque', 'check', 'invoice', 'tax', 'rent', 'mortgage', 'savings', 'invest', 'stocks', 'shares', 'profit', 'loss', 'worth', 'fortune', 'capital', 'tender', 'vault', 'safe', 'mint', 'currency', 'budget', 'overdraft', 'owe', 'debt', 'loan', 'pay', 'payday', 'tip', 'pennies', 'penny', 'cent', 'cents', 'grand', 'bands', 'racks', 'guap', 'dough', 'bread', 'paper', 'cheddar', 'rich', 'broke', 'spent', 'afford', 'expensive', 'cheap', 'price', 'cost'] },
  { id: 'time', label: 'time', words: ['time', 'clock', 'hours', 'hour', 'minute', 'minutes', 'seconds', 'second', 'watch', 'late', 'early', 'deadline', 'tick', 'ticking', 'alarm', 'calendar', 'years', 'days', 'nights', 'forever', 'past', 'present', 'future', 'history', 'age', 'hands', 'face', 'overtime', 'countdown', 'wait', 'waiting', 'timing', 'rolex', 'yesterday', 'tomorrow', 'tonight'] },
  { id: 'music', label: 'music', words: ['music', 'beat', 'beats', 'bars', 'verse', 'hook', 'chorus', 'track', 'tracks', 'record', 'album', 'single', 'mic', 'stage', 'notes', 'note', 'key', 'scale', 'tempo', 'flow', 'rhythm', 'melody', 'sample', 'studio', 'booth', 'bass', 'drums', 'snare', 'kick', 'spit', 'rap', 'rhyme', 'rhymes', 'song', 'tune', 'pitch', 'sharp', 'flat', 'minor', 'major', 'rest', 'feature', 'tour', 'charts', 'hit', 'hits', 'drop', 'plays', 'stream', 'streams', 'playlist', 'vinyl', 'band', 'bands', 'measure', 'cadence'] },
  { id: 'visual', label: 'photos & film', words: ['picture', 'pic', 'pics', 'photo', 'frame', 'framed', 'shot', 'shots', 'snap', 'flash', 'focus', 'lens', 'camera', 'film', 'negative', 'exposure', 'zoom', 'filter', 'scene', 'screen', 'clip', 'clips', 'cut', 'reel', 'print', 'prints', 'portrait', 'blur', 'blurry', 'gallery', 'paint', 'painting', 'canvas', 'brush', 'colour', 'color', 'view', 'image'] },
  { id: 'sea', label: 'the sea', words: ['sea', 'ocean', 'waves', 'wave', 'tide', 'current', 'deep', 'shore', 'beach', 'sand', 'boat', 'ship', 'sail', 'anchor', 'float', 'sink', 'sinking', 'drown', 'drowning', 'swim', 'fish', 'shark', 'sharks', 'whale', 'squid', 'ink', 'salt', 'salty', 'island', 'harbour', 'harbor', 'surf', 'splash', 'water', 'pier', 'bay', 'coral', 'net'] },
  { id: 'writing', label: 'writing', words: ['pen', 'ink', 'pad', 'paper', 'page', 'pages', 'write', 'wrote', 'written', 'letter', 'letters', 'line', 'lines', 'sentence', 'chapter', 'story', 'book', 'books', 'note', 'notes', 'sign', 'signed', 'signature', 'print', 'cover', 'title', 'author', 'diary', 'journal', 'draft', 'verse', 'word', 'words', 'spell', 'read', 'script', 'plot', 'character', 'ending'] },
  { id: 'chess', label: 'chess & games', words: ['chess', 'check', 'mate', 'checkmate', 'king', 'queen', 'pawn', 'pawns', 'rook', 'knight', 'bishop', 'board', 'move', 'moves', 'play', 'player', 'game', 'games', 'strategy', 'sacrifice', 'castle', 'piece', 'pieces', 'level', 'boss', 'controller', 'lives', 'respawn'] },
  { id: 'food', label: 'food', words: ['bread', 'dough', 'cheese', 'cheddar', 'beef', 'salt', 'spice', 'sauce', 'pepper', 'sugar', 'sweet', 'sour', 'bitter', 'plate', 'table', 'kitchen', 'cook', 'cooking', 'chef', 'oven', 'bake', 'baked', 'fries', 'chips', 'chicken', 'rice', 'eat', 'eating', 'hungry', 'starving', 'feast', 'meal', 'dinner', 'breakfast', 'crumbs', 'slice', 'pie', 'cake', 'juice', 'milk', 'honey', 'pizza', 'lunch', 'snack', 'bowl', 'spoon', 'knife', 'fork', 'fridge', 'microwave'] },
  { id: 'law', label: 'law & prison', words: ['bars', 'cell', 'prison', 'jail', 'locked', 'sentence', 'court', 'judge', 'jury', 'case', 'trial', 'charge', 'charged', 'guilty', 'innocent', 'lawyer', 'police', 'cops', 'arrest', 'arrested', 'record', 'free', 'freedom', 'time', 'bail', 'warrant', 'witness', 'evidence', 'framed', 'convict', 'parole', 'cuffs', 'handcuffs', 'law', 'crime', 'verdict', 'appeal'] },
  { id: 'sport', label: 'sport', words: ['goal', 'goals', 'net', 'score', 'scored', 'court', 'pitch', 'ball', 'team', 'coach', 'match', 'league', 'trophy', 'champion', 'win', 'won', 'lose', 'lost', 'race', 'run', 'running', 'sprint', 'finish', 'line', 'penalty', 'shot', 'kick', 'referee', 'whistle', 'field', 'stadium', 'football', 'boxing', 'ring', 'round', 'knockout', 'punch', 'jab', 'gloves', 'training', 'season', 'medal', 'gold'] },
  { id: 'cards', label: 'cards & gambling', words: ['deal', 'dealt', 'dealer', 'hand', 'cards', 'card', 'deck', 'ace', 'aces', 'chips', 'stake', 'stakes', 'bet', 'betting', 'odds', 'gamble', 'casino', 'poker', 'bluff', 'fold', 'all-in', 'jackpot', 'dice', 'luck', 'lucky', 'house', 'table', 'joker', 'spade', 'spades', 'heart', 'hearts', 'diamond', 'diamonds', 'club', 'clubs'] },
  { id: 'sight', label: 'seeing', words: ['see', 'seen', 'saw', 'eyes', 'eye', 'look', 'looking', 'watch', 'watching', 'vision', 'sight', 'view', 'blind', 'glasses', 'stare', 'glance', 'focus', 'clear', 'blur', 'light', 'dark', 'shine', 'shining', 'bright', 'visible', 'invisible', 'mirror', 'reflection', 'show', 'appear'] },
  { id: 'hearing', label: 'hearing & sound', words: ['hear', 'heard', 'ears', 'ear', 'listen', 'listening', 'sound', 'loud', 'quiet', 'silence', 'silent', 'noise', 'volume', 'speaker', 'speakers', 'headphones', 'voice', 'echo', 'whisper', 'scream', 'shout', 'ring', 'ringing', 'deaf', 'tone', 'mute'] },
  { id: 'growth', label: 'growth & nature', words: ['roots', 'root', 'grow', 'growing', 'grew', 'seed', 'seeds', 'plant', 'planted', 'tree', 'trees', 'branch', 'branches', 'leaves', 'leaf', 'bloom', 'flower', 'flowers', 'rose', 'garden', 'soil', 'dirt', 'rain', 'sun', 'season', 'harvest', 'weeds', 'concrete', 'stem', 'thorns', 'forest', 'grass', 'green'] },
  { id: 'fire', label: 'fire & heat', words: ['fire', 'flame', 'flames', 'burn', 'burning', 'burnt', 'smoke', 'ash', 'ashes', 'heat', 'hot', 'spark', 'sparks', 'lit', 'light', 'match', 'matches', 'blaze', 'ember', 'embers', 'torch', 'candle', 'cold', 'ice', 'freeze', 'frozen', 'frost', 'melt', 'warm', 'chill', 'cool'] },
  { id: 'weather', label: 'weather', words: ['winter', 'summer', 'autumn', 'spring', 'coat', 'scarf', 'gloves', 'umbrella', 'heating', 'rain', 'storm', 'thunder', 'lightning', 'cloud', 'clouds', 'sun', 'sunshine', 'snow', 'wind', 'fog', 'grey', 'gray', 'rainbow', 'forecast', 'pour', 'pouring', 'flood', 'drought', 'hurricane', 'cold', 'warm', 'weather', 'climate'] },
  { id: 'body', label: 'body & health', words: ['heart', 'head', 'mind', 'brain', 'hands', 'hand', 'eyes', 'face', 'feet', 'back', 'bones', 'blood', 'veins', 'skin', 'scars', 'chest', 'lungs', 'breath', 'breathe', 'sick', 'ill', 'pain', 'hurt', 'wound', 'bleed', 'heal', 'healing', 'doctor', 'hospital', 'pills', 'medicine', 'cure', 'fever', 'pulse', 'sweat', 'tears', 'tired', 'sleep', 'cough', 'sneeze', 'alive', 'born', 'die', 'dying', 'breathing'] },
  { id: 'fight', label: 'fights & war', words: ['war', 'battle', 'fight', 'fighting', 'soldier', 'army', 'weapon', 'gun', 'guns', 'clip', 'clips', 'shot', 'shots', 'shoot', 'shooting', 'trigger', 'barrel', 'bullet', 'bullets', 'aim', 'target', 'armour', 'armor', 'shield', 'sword', 'blade', 'knife', 'enemy', 'enemies', 'opps', 'beef', 'attack', 'defend', 'wounded', 'scars', 'kill', 'dead', 'grave'] },
  { id: 'cars', label: 'cars & driving', words: ['car', 'cars', 'whip', 'wheel', 'wheels', 'drive', 'driving', 'drove', 'road', 'roads', 'lane', 'engine', 'gas', 'petrol', 'brake', 'brakes', 'speed', 'fast', 'race', 'crash', 'park', 'parked', 'keys', 'ride', 'riding', 'license', 'licence', 'traffic', 'mirror', 'seat', 'passenger', 'gear', 'reverse', 'motor', 'tyres', 'tires'] },
  { id: 'clothes', label: 'clothes & style', words: ['drip', 'fit', 'fits', 'outfit', 'shoes', 'trainers', 'sneakers', 'jacket', 'coat', 'hoodie', 'jeans', 'chain', 'chains', 'ring', 'rings', 'watch', 'designer', 'brand', 'label', 'gucci', 'fresh', 'clean', 'style', 'wear', 'wore', 'cap', 'hat', 'suit', 'tie', 'dress', 'thread', 'threads'] },
  { id: 'mind', label: 'the mind', words: ['mind', 'brain', 'head', 'think', 'thinking', 'thought', 'thoughts', 'idea', 'ideas', 'memory', 'memories', 'remember', 'forget', 'dream', 'dreams', 'curious', 'wonder', 'racking', 'focus', 'doubt', 'believe', 'know', 'knowledge', 'wise', 'genius', 'crazy', 'sane', 'mental', 'conscience', 'soul', 'understand', 'learn', 'lesson', 'question', 'answer'] },
  { id: 'home', label: 'home', words: ['home', 'house', 'room', 'bedroom', 'door', 'doors', 'window', 'windows', 'wall', 'walls', 'roof', 'floor', 'stairs', 'shelf', 'shelves', 'kitchen', 'bed', 'sofa', 'couch', 'keys', 'lock', 'rent', 'landlord', 'flat', 'flats', 'garden', 'gate', 'lights', 'tv', 'table'] },
  { id: 'fame', label: 'fame', words: ['clout', 'feature', 'famous', 'celebrity', 'paparazzi', 'autograph', 'fans', 'hype', 'buzz', 'name', 'known', 'believer', 'believers', 'haters', 'doubters'] },
  { id: 'tech', label: 'phones & tech', words: ['phone', 'screen', 'text', 'texts', 'call', 'calls', 'message', 'dm', 'post', 'posted', 'likes', 'followers', 'online', 'offline', 'wifi', 'signal', 'battery', 'charge', 'charger', 'app', 'download', 'upload', 'profile', 'block', 'blocked', 'scroll', 'feed', 'stream', 'streaming', 'viral', 'views', 'comment', 'comments', 'password', 'network', 'cell'] },
]

/** Theme lexicon + the extra worlds, merged by id. */
export const WORLDS: World[] = (() => {
  const map = new Map<string, World>()
  for (const t of [...THEMES, ...EXTRA_WORLDS]) {
    const w = map.get(t.id)
    if (w) w.words = [...new Set([...w.words, ...t.words])]
    else map.set(t.id, { id: t.id, label: t.label, words: [...new Set(t.words)] })
  }
  return [...map.values()]
})()

const worldIndex = new Map<string, Set<string>>()
for (const w of WORLDS)
  for (const word of w.words) {
    for (const key of [word, stem(word)]) {
      if (!worldIndex.has(key)) worldIndex.set(key, new Set())
      worldIndex.get(key)!.add(w.id)
    }
  }

export function worldsOf(word: string): string[] {
  const w = word.toLowerCase()
  return [...new Set([...(worldIndex.get(w) ?? []), ...(worldIndex.get(stem(w)) ?? [])])]
}

export const worldLabel = (id: string) => WORLDS.find((w) => w.id === id)?.label ?? id

/** Words in a world, most useful first (as listed). */
export const wordsIn = (id: string) => WORLDS.find((w) => w.id === id)?.words ?? []

// ── second meanings ───────────────────────────────────────────────────
export interface Sense {
  gloss: string
  world: string
}

const S = (gloss: string, world: string): Sense => ({ gloss, world })

/** Words that commonly carry two meanings in rap. Senses tie each meaning to a world. */
export const SENSES: Record<string, Sense[]> = {
  change: [S('coins / money back', 'money'), S('to transform, grow up', 'growth')],
  notes: [S('banknotes', 'money'), S('musical notes', 'music'), S('written notes', 'writing')],
  note: [S('a banknote', 'money'), S('a musical note', 'music'), S('a written note', 'writing')],
  bars: [S('rap lines', 'music'), S('prison bars', 'law'), S('gold bars', 'money')],
  bread: [S('money', 'money'), S('food', 'food')],
  dough: [S('money', 'money'), S('pastry', 'food')],
  paper: [S('money', 'money'), S('something to write on', 'writing')],
  cheddar: [S('money', 'money'), S('cheese', 'food')],
  interest: [S('what a bank pays', 'money'), S('curiosity', 'mind')],
  bills: [S('payments due', 'money'), S('banknotes', 'money'), S('beaks', 'growth')],
  check: [S('a cheque', 'money'), S('chess check', 'chess'), S('to look over', 'sight')],
  cheque: [S('a payment', 'money'), S('sounds like "check" (chess)', 'chess')],
  racks: [S('stacks of money', 'money'), S('racking your brain', 'mind'), S('shelves', 'home')],
  frame: [S('picture frame', 'visual'), S('to set someone up', 'law'), S('your build', 'body')],
  framed: [S('in a picture frame', 'visual'), S('set up for a crime', 'law')],
  shot: [S('a photo', 'visual'), S('an attempt / chance', 'ambition'), S('a gunshot', 'fight'), S('a drink', 'food')],
  shots: [S('photos', 'visual'), S('attempts', 'ambition'), S('gunshots', 'fight'), S('drinks', 'food')],
  clip: [S('a video clip', 'visual'), S('a magazine', 'fight'), S('to clip / cut', 'clothes')],
  record: [S('a song / vinyl', 'music'), S('a criminal record', 'law'), S('a world record', 'sport'), S('to record', 'music')],
  track: [S('a song', 'music'), S('a running track', 'sport'), S('to follow', 'sight')],
  sentence: [S('words in a line', 'writing'), S('jail time', 'law')],
  time: [S('the clock', 'time'), S('prison time', 'law'), S('tempo / timing', 'music')],
  court: [S('law court', 'law'), S('basketball / tennis court', 'sport'), S('to date someone', 'love')],
  case: [S('a legal case', 'law'), S('a container', 'home'), S('a situation', 'mind')],
  pound: [S('money (£)', 'money'), S('to hit', 'fight'), S('weight', 'body')],
  cell: [S('a prison cell', 'law'), S('a phone', 'tech'), S('a body cell', 'body')],
  drop: [S('release a song', 'music'), S('to fall', 'growth'), S('a drop of water', 'sea')],
  hook: [S('a chorus', 'music'), S('a fish hook', 'sea'), S('a punch', 'fight')],
  key: [S('a musical key', 'music'), S('a door key', 'home'), S('the important thing', 'mind')],
  keys: [S('car / house keys', 'cars'), S('musical keys', 'music'), S('piano keys', 'music')],
  scale: [S('musical scale', 'music'), S('to climb', 'ambition'), S('weighing scale', 'money'), S('fish scale', 'sea')],
  plot: [S('a story', 'writing'), S('a scheme', 'betrayal'), S('a patch of land', 'growth')],
  pressure: [S('stress', 'struggle'), S('force / pressing', 'body')],
  current: [S('right now', 'time'), S('a water current', 'sea'), S('electric current', 'tech')],
  waves: [S('sea waves', 'sea'), S('trends / hype', 'fame'), S('waving hello', 'body'), S('sound waves', 'hearing')],
  wave: [S('a sea wave', 'sea'), S('a trend', 'fame'), S('a hand wave', 'body')],
  deep: [S('deep water', 'sea'), S('profound', 'mind')],
  bank: [S('where money lives', 'money'), S('a river bank', 'sea'), S('to rely on', 'mind')],
  board: [S('a chess board', 'chess'), S('to get on (a plane)', 'cars'), S('a company board', 'money'), S('a plank', 'home')],
  mate: [S('a friend', 'friends'), S('checkmate', 'chess')],
  chips: [S('casino chips', 'cards'), S('food', 'food'), S('computer chips', 'tech')],
  hand: [S('your hand', 'body'), S('a hand of cards', 'cards'), S('help', 'friends'), S('a clock hand', 'time')],
  hands: [S('your hands', 'body'), S('clock hands', 'time'), S('help', 'friends')],
  deal: [S('to deal cards', 'cards'), S('an agreement / contract', 'money'), S('to cope with', 'struggle')],
  vision: [S('eyesight', 'sight'), S('a goal / dream', 'ambition')],
  blind: [S("can't see", 'sight'), S('a window blind', 'home'), S('a blind bet', 'cards')],
  stack: [S('a pile of money', 'money'), S('a pile', 'home')],
  cold: [S('temperature', 'fire'), S('ruthless', 'betrayal'), S('ill (a cold)', 'body')],
  heat: [S('temperature', 'fire'), S('pressure / trouble', 'law'), S('a gun', 'fight')],
  fire: [S('flames', 'fire'), S('to sack someone', 'money'), S('excellent', 'confidence'), S('to shoot', 'fight')],
  grave: [S('a burial place', 'fight'), S('serious', 'mind')],
  net: [S('a goal net', 'sport'), S('net income', 'money'), S('the internet', 'tech'), S('a fishing net', 'sea')],
  light: [S('brightness', 'sight'), S('not heavy', 'body'), S('to set alight', 'fire')],
  line: [S('a lyric', 'writing'), S('the finish line', 'sport'), S('a queue', 'city'), S('a phone line', 'tech')],
  lines: [S('lyrics', 'writing'), S('queues', 'city'), S('phone lines', 'tech')],
  beat: [S('the instrumental', 'music'), S('to win against', 'sport'), S('to hit', 'fight'), S('exhausted', 'body')],
  flow: [S('your rap delivery', 'music'), S('water flowing', 'sea'), S('money flowing in', 'money')],
  verse: [S('a rap verse', 'music'), S('a Bible verse', 'faith')],
  sick: [S('ill', 'body'), S('amazing', 'confidence')],
  ill: [S('sick', 'body'), S('amazing (slang)', 'confidence')],
  sharp: [S('a blade edge', 'fight'), S('smart / well dressed', 'clothes'), S('a musical sharp', 'music')],
  flat: [S('an apartment', 'city'), S('level / dull', 'mind'), S('a musical flat', 'music'), S('a flat tyre', 'cars')],
  flats: [S('apartments / estate', 'city'), S('musical flats', 'music'), S('flat shoes', 'clothes')],
  rest: [S('to relax', 'body'), S('a musical rest', 'music'), S('the remainder', 'money')],
  pitch: [S('a football pitch', 'sport'), S('a sales pitch', 'money'), S('musical pitch', 'music'), S('pitch black', 'sight')],
  run: [S('to sprint', 'sport'), S('a run of luck', 'cards'), S('to manage', 'money'), S('to flee', 'law')],
  charge: [S('a criminal charge', 'law'), S('a battery charge', 'tech'), S('a price', 'money'), S('to attack', 'fight')],
  chain: [S('jewellery', 'clothes'), S('shackles', 'law'), S('a chain of events', 'time')],
  chains: [S('jewellery', 'clothes'), S('shackles', 'law')],
  crown: [S("a king's crown", 'success'), S('the top of the head', 'body')],
  ring: [S('jewellery', 'clothes'), S('a boxing ring', 'sport'), S('a phone ringing', 'tech')],
  watch: [S('a wristwatch', 'time'), S('to look at', 'sight')],
  face: [S('your face', 'body'), S('a clock face', 'time'), S('to confront', 'fight')],
  second: [S('a moment', 'time'), S('second place', 'sport')],
  seconds: [S('moments', 'time'), S('second helpings', 'food')],
  present: [S('now', 'time'), S('a gift', 'family')],
  past: [S('back then', 'time'), S('going by', 'cars')],
  tense: [S('stressed', 'struggle'), S('verb tense (past/present)', 'writing')],
  letter: [S('a written letter', 'writing'), S('a letter of the alphabet', 'writing')],
  character: [S('a story character', 'writing'), S('your personality', 'mind')],
  cover: [S('a book / album cover', 'writing'), S('to protect', 'fight'), S('a cover song', 'music')],
  press: [S('the media', 'fame'), S('to push', 'body'), S('pressing vinyl', 'music')],
  star: [S('a celebrity', 'fame'), S('a star in the sky', 'space')],
  stars: [S('celebrities', 'fame'), S('stars in the sky', 'space')],
  single: [S('a released song', 'music'), S('not in a relationship', 'love')],
  hit: [S('a hit song', 'music'), S('to strike', 'fight')],
  hits: [S('hit songs', 'music'), S('strikes', 'fight')],
  feature: [S('a guest verse', 'music'), S('a face feature', 'body')],
  broke: [S('no money', 'money'), S('broken', 'struggle')],
  rich: [S('wealthy', 'money'), S('full of flavour', 'food')],
  spent: [S('money gone', 'money'), S('exhausted', 'body')],
  worth: [S('price / value', 'money'), S('self-worth', 'mind')],
  value: [S('price', 'money'), S('what matters to you', 'mind')],
  tender: [S('legal tender (money)', 'money'), S('gentle', 'love'), S('sore', 'body')],
  capital: [S('money to invest', 'money'), S('a capital city', 'city')],
  safe: [S('a money safe', 'money'), S('not in danger', 'struggle')],
  beef: [S('a feud', 'fight'), S('meat', 'food')],
  ice: [S('diamonds', 'clothes'), S('frozen water', 'fire')],
  rocks: [S('diamonds', 'clothes'), S('stones', 'growth'), S('drinks on the rocks', 'food')],
  drip: [S('style', 'clothes'), S('dripping water', 'sea')],
  lit: [S('on fire / lit up', 'fire'), S('exciting', 'confidence')],
  smoke: [S('from a fire', 'fire'), S('to beat someone easily', 'fight')],
  number: [S('a song', 'music'), S('a figure / count', 'money'), S('a phone number', 'tech')],
  game: [S('a sport / video game', 'chess'), S('the industry / hustle', 'ambition')],
  play: [S('to play a game', 'chess'), S('to play music', 'music'), S('a stage play', 'fame')],
  stage: [S('a performance stage', 'fame'), S('a phase of life', 'time')],
  sign: [S('a road sign / omen', 'faith'), S('to sign a contract', 'money'), S('a star sign', 'space')],
  signed: [S('signed to a label', 'music'), S('signed a contract', 'money')],
  label: [S('a record label', 'music'), S('a clothing label', 'clothes'), S('a name you get called', 'mind')],
  roots: [S('plant roots', 'growth'), S('where you come from', 'family')],
  grind: [S('hard work', 'ambition'), S('to crush', 'food')],
  bust: [S('broke', 'money'), S('arrested', 'law'), S('a statue', 'visual')],
  loaded: [S('rich', 'money'), S('a loaded gun', 'fight'), S('drunk', 'food')],
  sole: [S('the only one', 'mind'), S('the bottom of a shoe', 'clothes')],
  spit: [S('to rap', 'music'), S('saliva', 'body')],
  raw: [S('uncooked', 'food'), S('honest / unfiltered', 'mind')],
  fresh: [S('new / clean', 'clothes'), S('food just made', 'food')],
  heavy: [S('weighty', 'body'), S('emotionally serious', 'struggle')],
  wait: [S('to wait', 'time'), S('sounds like "weight"', 'body')],
  bars_: [],
}
delete SENSES.bars_

export function sensesOf(word: string): Sense[] {
  const w = word.toLowerCase()
  return SENSES[w] ?? SENSES[stem(w)] ?? []
}

// ── homophones (from the dictionary) ──────────────────────────────────
let homIndex: Map<string, string[]> | null = null

/** Common words that sound exactly like this one (see/sea, write/right, piece/peace). */
export function homophonesOf(word: string): string[] {
  const s = sound(word)
  if (!s?.known) return []
  if (!homIndex) {
    homIndex = new Map()
    for (const [w, phones] of lexiconEntries(3)) {
      if (!phones.some(isVowel)) continue
      const key = phones.map((p) => p.replace(/\d/g, '')).join(' ')
      const list = homIndex.get(key) ?? []
      list.push(w)
      homIndex.set(key, list)
    }
  }
  const key = s.phones.map((p) => p.replace(/\d/g, '')).join(' ')
  return (homIndex.get(key) ?? []).filter((w) => w !== s.word && w.replace(/'/g, '') !== s.word.replace(/'/g, '') && stem(w) !== stem(s.word))
}

// ── connections (associations) ─────────────────────────────────────────
/** Bridges between worlds that a word-list can't infer (the chain makes sense to a listener). */
const BRIDGES: [string, string][] = [
  ['cheque', 'ink'],
  ['ink', 'squid'],
  ['ink', 'pen'],
  ['ink', 'tattoo'],
  ['hours', 'hourly'],
  ['racks', 'racking'],
  ['notes', 'keys'],
  ['frame', 'picture'],
  ['shot', 'picture'],
  ['clip', 'shot'],
  ['bars', 'cell'],
  ['sentence', 'line'],
  ['bank', 'river'],
  ['change', 'coins'],
  ['interest', 'curious'],
  ['current', 'waves'],
  ['flow', 'water'],
  ['bread', 'butter'],
  ['dough', 'oven'],
  ['check', 'mate'],
  ['king', 'crown'],
  ['vision', 'eyes'],
  ['watch', 'time'],
  ['face', 'clock'],
  ['record', 'spin'],
  ['track', 'race'],
  ['beat', 'drum'],
  ['pound', 'weight'],
  ['scale', 'weight'],
  ['net', 'goal'],
  ['deal', 'cards'],
  ['grind', 'coffee'],
  ['roots', 'family'],
  ['ice', 'cold'],
  ['heat', 'pressure'],
]

const bridgeIndex = new Map<string, Set<string>>()
for (const [a, b] of BRIDGES) {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    if (!bridgeIndex.has(x)) bridgeIndex.set(x, new Set())
    bridgeIndex.get(x)!.add(y)
  }
}

/** Are two words connected — same world, a shared second meaning, or a known bridge? */
export function linkBetween(a: string, b: string): { via: 'world' | 'sense' | 'bridge'; label: string } | null {
  const A = a.toLowerCase()
  const B = b.toLowerCase()
  if (A === B || stem(A) === stem(B)) return null
  if (bridgeIndex.get(A)?.has(B) || bridgeIndex.get(stem(A))?.has(stem(B))) return { via: 'bridge', label: `${A} → ${B}` }
  // a shared world links them; a second meaning links them only into the other word's own
  // world, and never through catch-all worlds (body / mind / time) where everything meets
  const HUBS = new Set(['body', 'mind', 'time'])
  const pa = worldsOf(A)
  const pb = worldsOf(B)
  const shared = pa.filter((w) => pb.includes(w))
  if (shared.length) return { via: 'world', label: worldLabel(shared[0]) }
  const viaSense = [...sensesOf(A).map((x) => x.world).filter((w) => pb.includes(w)), ...sensesOf(B).map((x) => x.world).filter((w) => pa.includes(w))].filter((w) => !HUBS.has(w))
  if (viaSense.length) return { via: 'sense', label: worldLabel(viaSense[0]) }
  return null
}

/**
 * Branches out from a word for CONNECTIONS: each of its worlds (and each
 * of its second meanings' worlds) with a few related words, plus
 * "collisions" — a related word that also sits in another branch
 * (hours ↔ hourly).
 */
export function branchesFrom(word: string, perBranch = 7): { world: string; label: string; via: string; words: string[]; all: string[] }[] {
  const w = word.toLowerCase()
  const out: { world: string; label: string; via: string; words: string[]; all: string[] }[] = []
  const seen = new Set<string>()
  const add = (world: string, via: string) => {
    if (seen.has(world)) return
    seen.add(world)
    const all = wordsIn(world).filter((x) => x !== w && stem(x) !== stem(w))
    if (all.length) out.push({ world, label: worldLabel(world), via, words: all.slice(0, perBranch), all })
  }
  for (const s of sensesOf(w)) add(s.world, s.gloss)
  for (const id of worldsOf(w)) add(id, 'same world')
  const bridges = [...(bridgeIndex.get(w) ?? bridgeIndex.get(stem(w)) ?? [])]
  if (bridges.length) out.push({ world: 'bridge', label: 'leaps', via: 'a step sideways', words: bridges, all: bridges })
  return out
}
