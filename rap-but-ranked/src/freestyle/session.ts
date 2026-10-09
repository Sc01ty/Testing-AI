import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { renderMix } from '../audio/mix'
import type { BeatMeta, FreestyleCategory, FreestyleDifficulty, FreestyleMode, FreestyleSession } from '../domain/types'
import { saveWav } from '../play/fullTrack'
import { arrangedClips } from '../play/vocals'
import { getBeatAudio } from '../storage'
import { planPrompts } from './prompts'
import { planRhymeRun } from './rhymeRun'

export const DIFFICULTY_LABEL: Record<FreestyleDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', chaos: 'Chaos' }

export function timing(f: Pick<FreestyleSession, 'beatGrid'>) {
  const spb = 60 / f.beatGrid.bpm
  return { spb, spBar: spb * f.beatGrid.beatsPerBar }
}

/**
 * Bars for a duration (whole bars, at least 4), and the part of the beat to
 * loop under them: from bar 1 (after the intro) for as many whole bars as
 * the file has — whole phrases of 4 where possible, so the loop point lands
 * where the beat itself would turn around.
 */
export function freestyleShape(beat: Pick<BeatMeta, 'bpm' | 'introOffset' | 'durationSec' | 'beatsPerBar'>, durationSec: number) {
  const spBar = (60 / beat.bpm) * beat.beatsPerBar
  const bars = Math.max(4, Math.round(durationSec / spBar))
  const fileBars = Math.floor((beat.durationSec - beat.introOffset) / spBar + 1e-6)
  if (fileBars < 1) return null
  const loopBars = fileBars >= 8 ? fileBars - (fileBars % 4) : fileBars
  return { bars, loop: { start: beat.introOffset, end: beat.introOffset + loopBars * spBar }, loopBars }
}

export function newFreestyle(input: { beat: BeatMeta; difficulty: FreestyleDifficulty; durationSec: number; every: number | null; category?: FreestyleCategory; mode?: FreestyleMode }): FreestyleSession | null {
  const shape = freestyleShape(input.beat, input.durationSec)
  if (!shape) return null
  const now = Date.now()
  const date = new Date(now).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `f_${now}`,
    kind: 'freestyle',
    mode: input.mode ?? 'topic',
    ball: input.mode === 'rhyme' ? true : undefined,
    name: `${DIFFICULTY_LABEL[input.difficulty]} ${input.mode === 'rhyme' ? 'rhyme run' : 'freestyle'} · ${date}`,
    beatId: input.beat.id,
    beatName: input.beat.name,
    beatGrid: { bpm: input.beat.bpm, introOffset: input.beat.introOffset, durationSec: input.beat.durationSec, beatsPerBar: input.beat.beatsPerBar },
    difficulty: input.difficulty,
    category: input.category ?? 'mixed',
    requestedDurationSec: input.durationSec,
    promptEvery: input.every,
    bars: shape.bars,
    loop: shape.loop,
    prompts: input.mode === 'rhyme' ? planRhymeRun(input.difficulty, shape.bars, now % 100000) : planPrompts(input.difficulty, shape.bars, now % 100000, input.every, input.category ?? 'mixed', 'topic'),
    take: null,
    transcript: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Beat loop + your take, ready to play or export (no metronome, ever). */
export async function freestyleMix(f: FreestyleSession, ctx: BaseAudioContext, withBeat = true) {
  const { spb, spBar } = timing(f)
  const beatBuffer = withBeat ? await beatPlayer.loadBuffer({ id: f.beatId, getBlob: () => getBeatAudio(f.beatId) }).catch(() => null) : null
  const take = f.take
  const clips = take ? await arrangedClips(ctx, [{ id: take.id, beatTimeSec: take.startTime, sectionStartSec: 0, sectionEndSec: f.bars * spBar }]) : []
  const end = take ? Math.min(f.bars * spBar, take.startTime + take.durationSec) : f.bars * spBar
  return { beatBuffer, clips, from: -spb, to: end + spb * 2, loop: f.loop }
}

export async function downloadFreestyle(f: FreestyleSession, withBeat = true) {
  audio.unlock()
  const ctx = audio.context ?? new OfflineAudioContext(1, 1, 44100)
  const m = await freestyleMix(f, ctx, withBeat)
  const mixed = await renderMix(m.beatBuffer, m.clips, m.from, m.to, { loop: m.loop })
  return saveWav(mixed, f.name)
}
