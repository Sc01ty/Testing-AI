import type { Session } from '../domain/types'
import { STOPWORDS, contentWords, lastWord, lineSyllables, rhymeStrength, stem, words } from '../lyrics/text'
import { peopleIn, themeLabel, themesIn, topicWords } from '../lyrics/themes'
import { CLICHES, LAZY_PAIRS, concreteness } from '../scoring/lyricScore'
import { finalResult } from '../scoring/round'
import { gridOf } from '../play/sessionLogic'

/**
 * IMPROVE: reads one finished track and turns it into practical coaching —
 * what's working, what's holding you back, what to think about next time,
 * and small exercises that target the weak spots.
 *
 * Everything here is computed from the track itself (lyrics, round scores,
 * timing results), so every point can quote your own bars as evidence.
 * It teaches; it never writes bars for you.
 */
export interface Insight {
  id: string
  title: string
  detail: string
  /** Your own words / numbers that show it. */
  evidence?: string
  /** How strongly this applies (0..1) — picks the top few. */
  weight: number
}

export interface Exercise {
  id: string
  title: string
  brief: string
  /** 2 or 4 lines to write. */
  lines: 2 | 4
  check: (lines: string[]) => { pass: boolean; notes: string[] }
}

export interface Report {
  strengths: Insight[]
  weaknesses: Insight[]
  thinkAbout: string[]
  exercises: Exercise[]
  stats: { label: string; value: string }[]
}

const q = (s: string) => `“${s}”`
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Internal rhyme pairs inside one line (excluding the end word). */
function internalPairs(line: string) {
  const ws = words(line).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  const end = lastWord(line)
  const out: [string, string][] = []
  for (let i = 0; i < ws.length; i++)
    for (let j = i + 1; j < ws.length; j++) {
      if (ws[i] === ws[j] || (ws[i] === end && ws[j] === end)) continue
      if (rhymeStrength(ws[i], ws[j]).score >= 0.7) out.push([ws[i], ws[j]])
    }
  return out
}

export function analyseTrack(s: Session): Report {
  const rounds = s.rounds.filter((r) => r.result)
  const lines = rounds.flatMap((r) => r.lyrics)
  const all = lines.join(' ')
  const grid = gridOf(s)
  const secPerBar = grid ? (60 / grid.bpm) * grid.beatsPerBar : 2.6
  const final = finalResult(rounds.map((r) => r.result!))
  const avg = (cat: string) => final.averages.find((c) => c.category === cat)?.score ?? 0
  const strengths: Insight[] = []
  const weaknesses: Insight[] = []

  // ── rhyme: end-only vs internal ───────────────────────────────────
  const endKinds = rounds.map((r) => rhymeStrength(lastWord(r.lyrics[0]), lastWord(r.lyrics[1])))
  const endHit = endKinds.filter((k) => k.score >= 0.55).length
  const multi = endKinds.filter((k) => k.kind === 'multi').length
  const internal = rounds.map((r) => internalPairs(r.lyrics[0]).length + internalPairs(r.lyrics[1]).length)
  const withInternal = internal.filter((n) => n > 0).length
  const bestInternal = rounds.flatMap((r) => [...internalPairs(r.lyrics[0]), ...internalPairs(r.lyrics[1])])[0]
  if (endHit >= Math.ceil(rounds.length * 0.75)) {
    const r = rounds[endKinds.findIndex((k) => k.score >= 0.55)]
    strengths.push({ id: 'end-rhymes', title: 'Your bars land on a rhyme', detail: `${endHit} of ${rounds.length} rounds close on a rhyme${multi ? `, ${multi} of them multi-syllable` : ''}.`, evidence: r ? `${q(lastWord(r.lyrics[0]))} / ${q(lastWord(r.lyrics[1]))}` : undefined, weight: 0.5 + endHit / rounds.length / 2 })
  } else if (endHit < rounds.length / 2) {
    const r = rounds[endKinds.findIndex((k) => k.score < 0.55)]
    weaknesses.push({ id: 'no-end-rhyme', title: "Half your bars don't land", detail: `Only ${endHit} of ${rounds.length} rounds end on a rhyme. Pick the landing word for bar two before you write bar one.`, evidence: r ? `${q(lastWord(r.lyrics[0]))} / ${q(lastWord(r.lyrics[1]))}` : undefined, weight: 0.9 - endHit / rounds.length })
  }
  if (withInternal >= Math.ceil(rounds.length / 2) && bestInternal) {
    strengths.push({ id: 'internal', title: 'You rhyme inside the bar, not just at the end', detail: `Internal rhymes in ${withInternal} of ${rounds.length} rounds — that's what makes bars sound dense.`, evidence: `${q(bestInternal[0])} / ${q(bestInternal[1])}`, weight: 0.75 })
  } else if (endHit >= rounds.length / 2) {
    weaknesses.push({ id: 'end-only', title: 'You only rhyme at the end of the line', detail: `${rounds.length - withInternal} of ${rounds.length} rounds have no internal rhyme. Try building a rhyme into the middle of the bar before you think about the final word.`, weight: 0.7 })
  }

  // ── bar two just repeats bar one ──────────────────────────────────
  const echoes = rounds.filter((r) => {
    const a = new Set(contentWords(r.lyrics[0]).map(stem))
    const b = contentWords(r.lyrics[1]).map(stem)
    const fresh = b.filter((w) => !a.has(w))
    return b.length > 0 && (fresh.length <= 1 || fresh.length / b.length < 0.4)
  })
  if (echoes.length >= Math.max(2, rounds.length / 3)) {
    const r = echoes[0]
    weaknesses.push({ id: 'echo', title: 'Bar two repeats bar one', detail: `In ${echoes.length} rounds the second bar mostly says the first one again. Make bar two change, answer or deepen the thought.`, evidence: `${q(clip(r.lyrics[0], 40))} → ${q(clip(r.lyrics[1], 40))}`, weight: 0.65 + echoes.length / rounds.length / 3 })
  }

  // ── story: developing vs topic-hopping ────────────────────────────
  const storyAvg = avg('story')
  const disconnected = rounds.filter((r) => r.result!.categories.find((c) => c.category === 'story')?.reasons.some((x) => /disconnected/i.test(x)))
  const themesPerRound = rounds.map((r) => new Set(themesIn(r.lyrics.join(' ')).keys()))
  const introduced = themesPerRound.map((t, i) => [...t].filter((x) => !themesPerRound.slice(0, i).some((p) => p.has(x))).length)
  const hops = introduced.slice(1).filter((n) => n >= 2).length
  if (storyAvg >= 70 && disconnected.length <= 1) {
    const people = peopleIn(all)
    strengths.push({ id: 'story', title: 'The song goes somewhere', detail: `Rounds build on each other (story avg ${storyAvg})${people.length ? ` and you bring people back, like ${people.slice(0, 2).map(q).join(' and ')}` : ''}.`, weight: 0.4 + storyAvg / 200 })
  } else if (disconnected.length >= 2 || hops >= Math.max(2, rounds.length / 3)) {
    weaknesses.push({
      id: 'hopping',
      title: 'You keep starting new topics instead of developing one',
      detail: `${Math.max(disconnected.length, hops)} rounds jump to something new. Before writing, ask: what's the next thing that happens to the person in bar one?`,
      evidence: disconnected[0] ? `Round ${disconnected[0].index + 1}: ${q(clip(disconnected[0].lyrics[0], 50))}` : undefined,
      weight: 0.75,
    })
  }

  // ── prompt relevance ──────────────────────────────────────────────
  const offBrief = rounds.filter((r) => (r.result!.categories.find((c) => c.category === 'prompt')?.score ?? 100) < 50)
  if (offBrief.length >= 2) {
    weaknesses.push({ id: 'off-brief', title: 'You drift off the challenge', detail: `Rounds ${offBrief.map((r) => r.index + 1).join(', ')} barely touch what was asked. Underline the key word in the challenge and get it (or a word that means it) into bar one.`, evidence: q(clip(offBrief[0].challenge.prompt, 70)), weight: 0.6 + offBrief.length / rounds.length / 3 })
  } else if (avg('prompt') >= 75) {
    strengths.push({ id: 'on-brief', title: 'You answer the brief', detail: `Prompt avg ${avg('prompt')} — you take the challenge and actually write to it.`, weight: 0.45 })
  }

  // ── repetition / clichés ──────────────────────────────────────────
  const topic = new Set(topicWords(s.startingTopic).map(stem))
  const counts = new Map<string, number>()
  for (const w of contentWords(all)) counts.set(stem(w), (counts.get(stem(w)) ?? 0) + 1)
  const leaned = [...counts.entries()].filter(([w, n]) => n >= 3 && !topic.has(w)).sort((a, b) => b[1] - a[1])
  if (leaned.length) {
    weaknesses.push({ id: 'repeats', title: 'Same words, round after round', detail: `You lean on ${leaned.slice(0, 3).map(([w, n]) => `${q(w)} (×${n})`).join(', ')}. Every repeat is a slot that could have been a new image.`, weight: 0.45 + Math.min(0.3, leaned.length * 0.1) })
  }
  const lower = all.toLowerCase()
  const cliches = CLICHES.filter((c) => lower.includes(c))
  const lazy = rounds.filter((r) => LAZY_PAIRS.some(([a, b]) => [a, b].includes(lastWord(r.lyrics[0])) && [a, b].includes(lastWord(r.lyrics[1]))))
  if (cliches.length || lazy.length >= 2) {
    weaknesses.push({ id: 'cliche', title: 'Some lines are pre-owned', detail: `${[...cliches.map(q), ...lazy.map((r) => `${q(lastWord(r.lyrics[0]))}/${q(lastWord(r.lyrics[1]))}`)].slice(0, 3).join(', ')} — everyone's heard these. Say the thing only you would say.`, weight: 0.5 })
  } else if (avg('originality') >= 72) {
    strengths.push({ id: 'original', title: 'It sounds like you', detail: `Originality avg ${avg('originality')} — no clichés, very few repeats.`, weight: 0.4 })
  }

  // ── detail ────────────────────────────────────────────────────────
  const vague = rounds.filter((r) => concreteness(r.lyrics.join(' ')) < 0.34)
  if (vague.length >= Math.max(2, rounds.length / 2)) {
    weaknesses.push({ id: 'vague', title: 'Too general to picture', detail: `${vague.length} rounds have no specific detail — no names, places or objects. One real detail beats three big words.`, evidence: q(clip(vague[0].lyrics[0], 50)), weight: 0.55 })
  } else if (vague.length === 0 && rounds.length >= 2) {
    strengths.push({ id: 'detail', title: 'Specific details', detail: 'Every round has something you can picture.', weight: 0.4 })
  }

  // ── fitting the bar: syllables vs tempo ───────────────────────────
  const sylls = lines.map(lineSyllables).filter((n) => n > 0)
  const mean = sylls.reduce((a, b) => a + b, 0) / Math.max(1, sylls.length)
  const target = Math.max(8, Math.round(secPerBar * 4))
  const lopsided = rounds.filter((r) => {
    const [a, b] = r.lyrics.map(lineSyllables)
    return Math.max(a, b) > 0 && Math.abs(a - b) / Math.max(a, b) > 0.45
  })
  if (mean < target * 0.6) {
    weaknesses.push({ id: 'airy', title: 'Your bars are short for the beat', detail: `About ${Math.round(mean)} syllables a bar, and each bar here lasts ${secPerBar.toFixed(1)}s — that leaves dead air (it's often why takes sound gappy). Aim for ${target - 2}–${target + 4}.`, weight: 0.7 })
  } else if (mean > target * 1.6) {
    weaknesses.push({ id: 'crammed', title: 'Your bars are crammed', detail: `About ${Math.round(mean)} syllables a bar in ${secPerBar.toFixed(1)}s — hard to rap cleanly. Cut filler words until it fits around ${target + 2}.`, weight: 0.55 })
  } else if (lopsided.length >= Math.max(2, rounds.length / 3)) {
    const [a, b] = lopsided[0].lyrics.map(lineSyllables)
    weaknesses.push({ id: 'lopsided', title: 'Bar one and bar two are different lengths', detail: `${lopsided.length} rounds have one bar much longer than the other (e.g. ${a} vs ${b} syllables), so the flow lurches. Match them.`, weight: 0.45 })
  }

  // ── delivery (from the recordings) ────────────────────────────────
  const flowAvg = avg('flow')
  if (flowAvg >= 72) strengths.push({ id: 'timing', title: 'You sit in the pocket', detail: `Flow / timing avg ${flowAvg} — your syllables line up with the beat.`, weight: 0.5 })
  else if (flowAvg < 50) {
    const worst = [...rounds].sort((a, b) => (a.result!.categories.find((c) => c.category === 'flow')?.score ?? 0) - (b.result!.categories.find((c) => c.category === 'flow')?.score ?? 0))[0]
    const reason = worst?.result!.categories.find((c) => c.category === 'flow')?.reasons[0]
    weaknesses.push({ id: 'timing', title: 'Delivery drifts off the beat', detail: `Flow / timing avg ${flowAvg}. Loop the preview with the metronome on and say the bars out loud before recording.`, evidence: reason ? `Round ${worst.index + 1}: ${reason}` : undefined, weight: 0.6 })
  }

  strengths.sort((a, b) => b.weight - a.weight)
  weaknesses.sort((a, b) => b.weight - a.weight)
  const topWeak = weaknesses.slice(0, 3)
  if (!strengths.length) strengths.push({ id: 'finished', title: 'You finished a whole track', detail: `${s.length} bars, start to end. Most people stop at round two.`, weight: 0.1 })

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: topWeak,
    thinkAbout: thinkAbout(topWeak, s),
    exercises: exercisesFor(topWeak, s, { leaned: leaned.map(([w]) => w), target, endWord: lastWord(rounds[rounds.length - 1]?.lyrics[1] ?? '') }),
    stats: [
      { label: 'Final', value: `${final.rank} · ${final.score}` },
      { label: 'Rhymes landed', value: `${endHit}/${rounds.length}` },
      { label: 'Internal rhymes', value: `${withInternal}/${rounds.length} rounds` },
      { label: 'Syllables / bar', value: `${Math.round(mean)} (aim ${target - 2}–${target + 4})` },
      { label: 'Themes', value: [...themesIn(all).keys()].slice(0, 3).map(themeLabel).join(', ') || '—' },
    ],
  }
}

const THINK: Record<string, string> = {
  'no-end-rhyme': 'Write the last word of bar two first, then build both bars toward it.',
  'end-only': 'Before the end word, find a word in the middle of the bar that can rhyme with something nearby.',
  echo: 'Treat bar two as the reply to bar one — it should add a new fact, a twist or a consequence.',
  hopping: 'Keep a one-line note of what the song is about, and check every new bar against it.',
  'off-brief': 'Pull the key word out of the challenge and decide how it shows up before you write anything else.',
  repeats: "When a word's already in the song, ask what a more specific version of it would be.",
  cliche: "If you've heard the line in someone else's song, swap it for something only you would know.",
  vague: 'Add one name, place or object per round — something the listener can see.',
  airy: 'Count the syllables against the beat: tap the four beats and fill them.',
  crammed: 'Read the bar over the loop — anything you trip on, cut.',
  lopsided: 'Say both bars over the loop; if one finishes early, it needs more words (or the other needs fewer).',
  timing: 'Lock in with the metronome on the preview loop before you hit record.',
}

function thinkAbout(weak: Insight[], s: Session): string[] {
  const out = weak.map((w) => THINK[w.id]).filter(Boolean)
  if (out.length < 3) out.push(`Next time on ${q(s.startingTopic)}: decide where the song ends before you write round one.`)
  return out.slice(0, 3)
}

// ── exercises ────────────────────────────────────────────────────────
function exercisesFor(weak: Insight[], s: Session, ctx: { leaned: string[]; target: number; endWord: string }): Exercise[] {
  const topic = s.startingTopic
  const ids = new Set(weak.map((w) => w.id))
  const out: Exercise[] = []
  if (ids.has('repeats') || ids.has('cliche') || ids.has('off-brief')) out.push(withoutWords(topic, ctx.leaned))
  if (ids.has('end-only') || ids.has('no-end-rhyme')) out.push(internalRhyme(topic))
  if (ids.has('echo')) out.push(barTwoTurns(topic))
  if (ids.has('hopping')) out.push(sameRhymeFourLines(ctx.endWord || 'night'))
  if (ids.has('vague')) out.push(concreteDetail(topic))
  if (ids.has('airy') || ids.has('crammed') || ids.has('lopsided')) out.push(fillTheBar(ctx.target))
  // always at least two to try
  for (const e of [withoutWords(topic, ctx.leaned), internalRhyme(topic), barTwoTurns(topic)]) if (out.length < 2 && !out.some((x) => x.id === e.id)) out.push(e)
  return out.slice(0, 3)
}

const needLines = (lines: string[], n: number) => lines.slice(0, n).every((l) => words(l).length >= 3)

export function withoutWords(topic: string, leaned: string[]): Exercise {
  const banned = [...new Set([...topicWords(topic), ...leaned])].slice(0, 6)
  return {
    id: 'without-words',
    title: 'Say it without saying it',
    brief: `Write 2 bars about ${q(topic)} without using ${banned.map(q).join(', ')}.`,
    lines: 2,
    check: (lines) => {
      if (!needLines(lines, 2)) return { pass: false, notes: ['Write both bars first.'] }
      const bs = new Set(banned.map(stem))
      const used = lines.flatMap((l) => words(l)).filter((w) => bs.has(stem(w)))
      const onTopic = [...themesIn(topic).keys()].some((t) => themesIn(lines.join(' ')).has(t))
      const notes = used.length ? [`You used ${[...new Set(used)].map(q).join(', ')} — find another way in.`] : ['No banned words. ✓']
      notes.push(onTopic ? `Still clearly about ${q(topic)}. ✓` : `Make sure it's still about ${q(topic)} — show it through an image.`)
      return { pass: !used.length && onTopic, notes }
    },
  }
}

export function internalRhyme(topic: string): Exercise {
  return {
    id: 'internal-rhyme',
    title: 'Rhyme inside the bar',
    brief: `Write 2 bars about ${q(topic)} with an internal rhyme in each bar — two rhyming words inside the line, not just at the end.`,
    lines: 2,
    check: (lines) => {
      if (!needLines(lines, 2)) return { pass: false, notes: ['Write both bars first.'] }
      const pairs = lines.slice(0, 2).map(internalPairs)
      const notes = pairs.map((p, i) => (p.length ? `Bar ${i + 1}: ${q(p[0][0])}/${q(p[0][1])} ✓` : `Bar ${i + 1}: no internal rhyme yet.`))
      return { pass: pairs.every((p) => p.length > 0), notes }
    },
  }
}

export function barTwoTurns(topic: string): Exercise {
  return {
    id: 'bar-two-turns',
    title: 'Make bar two turn',
    brief: `Write 2 bars about ${q(topic)} where bar two answers, flips or raises bar one — without reusing any of its words.`,
    lines: 2,
    check: (lines) => {
      if (!needLines(lines, 2)) return { pass: false, notes: ['Write both bars first.'] }
      const a = new Set(contentWords(lines[0]).map(stem))
      const b = contentWords(lines[1])
      const reused = b.filter((w) => a.has(stem(w)))
      const notes = reused.length ? [`Bar two reuses ${[...new Set(reused)].map(q).join(', ')}.`] : ['No words carried over. ✓']
      if (b.length < 3) notes.push('Bar two needs more of its own words.')
      return { pass: !reused.length && b.length >= 3, notes }
    },
  }
}

export function sameRhymeFourLines(seed: string): Exercise {
  return {
    id: 'same-rhyme-4',
    title: 'One rhyme, four steps',
    brief: `Write 4 lines that all end on a rhyme for ${q(seed)}, and make every line move the story forward.`,
    lines: 4,
    check: (lines) => {
      if (!needLines(lines, 4)) return { pass: false, notes: ['Write all four lines first.'] }
      const ends = lines.slice(0, 4).map(lastWord)
      const rhymeOk = ends.every((e) => e === ends[0] || rhymeStrength(e, seed).score >= 0.55 || rhymeStrength(e, ends[0]).score >= 0.55)
      const distinct = new Set(ends).size === 4
      const seen = new Set<string>()
      const stalls = lines.slice(0, 4).filter((l) => {
        const fresh = contentWords(l).filter((w) => !seen.has(stem(w)))
        contentWords(l).forEach((w) => seen.add(stem(w)))
        return fresh.length < 2
      }).length
      const notes = [rhymeOk ? `Ends: ${ends.map(q).join(' / ')} ✓` : `Not all endings rhyme: ${ends.map(q).join(' / ')}`]
      if (!distinct) notes.push("Don't end two lines on the same word.")
      notes.push(stalls ? `${stalls} line${stalls === 1 ? '' : 's'} mostly repeat${stalls === 1 ? 's' : ''} what came before.` : 'Every line adds something new. ✓')
      return { pass: rhymeOk && distinct && !stalls, notes }
    },
  }
}

export function concreteDetail(topic: string): Exercise {
  return {
    id: 'concrete',
    title: 'Paint it',
    brief: `Write 2 bars about ${q(topic)} with a real detail in each — a name, a place, a brand, a number, an object.`,
    lines: 2,
    check: (lines) => {
      if (!needLines(lines, 2)) return { pass: false, notes: ['Write both bars first.'] }
      const c = lines.slice(0, 2).map((l) => concreteness(l))
      const notes = c.map((v, i) => (v >= 0.34 ? `Bar ${i + 1} has something to picture. ✓` : `Bar ${i + 1} is still general.`))
      return { pass: c.every((v) => v >= 0.34), notes }
    },
  }
}

export function fillTheBar(target: number): Exercise {
  return {
    id: 'fill-the-bar',
    title: 'Fill the bar',
    brief: `Write 2 bars of ${target - 1}–${target + 3} syllables each, then say them over the preview loop.`,
    lines: 2,
    check: (lines) => {
      if (!needLines(lines, 2)) return { pass: false, notes: ['Write both bars first.'] }
      const n = lines.slice(0, 2).map(lineSyllables)
      const ok = n.map((x) => x >= target - 1 && x <= target + 3)
      return { pass: ok.every(Boolean), notes: n.map((x, i) => `Bar ${i + 1}: ${x} syllables${ok[i] ? ' ✓' : x < target - 1 ? ' — too short' : ' — too long'}`) }
    },
  }
}
