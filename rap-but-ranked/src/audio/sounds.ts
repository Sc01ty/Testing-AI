import * as synth from './synthRecipes'
import type { SynthRecipe } from './synthRecipes'

/**
 * UI sound registry. Components ask for a sound by *meaning* ("confirm"),
 * never by file. To use a Game Audio Vault sample, replace the entry with
 *   { source: { kind: 'file', url: 'audio/ui/confirm.wav', gain: 0.6 } }
 * (paths are relative to /public).
 */
export type UiSoundId =
  | 'hover'
  | 'move'
  | 'confirm'
  | 'back'
  | 'transition'
  | 'toggle'
  | 'error'
  | 'enter'
  | 'impact'
  | 'swish'
  | 'impactBig'
  | 'save'
  | 'remove'
  | 'scoreReveal'

export type SoundSource =
  | { kind: 'synth'; recipe: SynthRecipe; gain?: number }
  | { kind: 'file'; url: string; gain?: number }

export interface SoundDef {
  source: SoundSource
  /** Drops repeats closer together than this, so fast mouse sweeps don't machine-gun. */
  minIntervalMs?: number
}

export const UI_SOUNDS: Record<UiSoundId, SoundDef> = {
  scoreReveal: {source:{kind:'file',url:'audio/ui/score-reveal.wav',gain:0.35},minIntervalMs:500},
  hover: { source: { kind: 'synth', recipe: synth.hover }, minIntervalMs: 45 },
  move: { source: { kind: 'synth', recipe: synth.move }, minIntervalMs: 30 },
  confirm: { source: { kind: 'synth', recipe: synth.confirm }, minIntervalMs: 80 },
  back: { source: { kind: 'synth', recipe: synth.back }, minIntervalMs: 80 },
  transition: { source: { kind: 'synth', recipe: synth.transition }, minIntervalMs: 150 },
  toggle: { source: { kind: 'synth', recipe: synth.toggle }, minIntervalMs: 40 },
  error: { source: { kind: 'synth', recipe: synth.error }, minIntervalMs: 200 },
  enter: { source: { kind: 'synth', recipe: synth.enter }, minIntervalMs: 500 },
  // brand sting (heard only when the browser allows autoplay)
  impact: { source: { kind: 'synth', recipe: synth.impact }, minIntervalMs: 300 },
  swish: { source: { kind: 'synth', recipe: synth.swish }, minIntervalMs: 200 },
  impactBig: { source: { kind: 'synth', recipe: synth.impactBig }, minIntervalMs: 500 },
  // beat library
  save: { source: { kind: 'synth', recipe: synth.save }, minIntervalMs: 300 },
  remove: { source: { kind: 'synth', recipe: synth.remove }, minIntervalMs: 300 },
}

/**
 * The scoring rise: the user's seven notes, a whole-tone climb C5 → C6.
 * `db` evens out their loudness (the top notes were mastered ~3 dB quieter).
 */
export const SCORE_NOTES: { url: string; db: number }[] = [
  { url: 'audio/ui/score-notes/c5.mp3', db: 0 },
  { url: 'audio/ui/score-notes/d5.mp3', db: 0.4 },
  { url: 'audio/ui/score-notes/e5.mp3', db: 1.2 },
  { url: 'audio/ui/score-notes/fs5.mp3', db: 1.3 },
  { url: 'audio/ui/score-notes/gs5.mp3', db: 1.8 },
  { url: 'audio/ui/score-notes/as5.mp3', db: 1.9 },
  { url: 'audio/ui/score-notes/c6.mp3', db: 2.8 },
]

/**
 * Which note (and pitch) plays for reveal `i` of `count`: the last reveal is
 * always the top C6, each earlier one a whole tone below. Rounds with more
 * reveals than notes start below C5 by pitching C5 down in whole tones.
 */
export function riseNote(i: number, count: number) {
  const top = SCORE_NOTES.length - 1
  const step = top - (count - 1 - i)
  return step >= 0 ? { note: step, rate: 1 } : { note: 0, rate: 2 ** ((step * 2) / 12) }
}

export type MusicTrackId = 'menu'

export interface MusicTrack {
  url: string
  gain: number
}

/** User-supplied theme (RAP_BUT_RANKED.mp3). Loaded lazily after the first gesture. */
export const MUSIC_TRACKS: Record<MusicTrackId, MusicTrack> = {
  menu: { url: 'audio/music/menu-theme.mp3', gain: 1 },
}

/** Sliders are linear for the user; loudness should feel linear too. */
export const perceptualGain = (v: number) => Math.max(0, Math.min(1, v)) ** 2
