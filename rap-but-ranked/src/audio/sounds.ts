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
  | 'rpTick'
  | 'rpFill'
  | 'divisionUp'
  | 'nearMiss'
  | 'demote'
  | 'publish'
  | 'like'
  | 'rankUp'

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
  // ranked (swap any for an FL export: { kind: 'file', url: 'audio/ui/ranked/rp-tick.wav', gain: 0.5 })
  rpTick: { source: { kind: 'synth', recipe: synth.rpTick }, minIntervalMs: 28 },
  rpFill: { source: { kind: 'synth', recipe: synth.rpFill }, minIntervalMs: 400 },
  divisionUp: { source: { kind: 'synth', recipe: synth.divisionUp }, minIntervalMs: 300 },
  nearMiss: { source: { kind: 'synth', recipe: synth.nearMiss }, minIntervalMs: 500 },
  demote: { source: { kind: 'synth', recipe: synth.demote }, minIntervalMs: 500 },
  publish: { source: { kind: 'synth', recipe: synth.publish }, minIntervalMs: 500 },
  like: { source: { kind: 'synth', recipe: synth.like }, minIntervalMs: 120 },
  // Alfie's success sting (leading silence trimmed, loudness-matched): placement and every promotion
  rankUp: { source: { kind: 'file', url: 'audio/ui/ranked/rank-up.mp3', gain: 0.8 }, minIntervalMs: 1500 },
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

/**
 * The promotion fanfare: your orchestra notes stacked into chords. Each entry
 * is semitones above C5 (pitched from the nearest note at or below it) and a
 * start delay. Promotion lands a C major chord; Hall of Fame climbs to a
 * bigger one.
 */
export const FANFARES: Record<'promote' | 'hallOfFame', { semi: number; at: number; gain?: number }[]> = {
  promote: [
    { semi: 0, at: 0 },
    { semi: 4, at: 0 },
    { semi: 7, at: 0 },
    { semi: 12, at: 0, gain: 1.1 },
  ],
  hallOfFame: [
    { semi: 0, at: 0 },
    { semi: 7, at: 0 },
    { semi: 5, at: 0.32 },
    { semi: 9, at: 0.32 },
    { semi: 0, at: 0.7 },
    { semi: 4, at: 0.7 },
    { semi: 7, at: 0.7 },
    { semi: 12, at: 0.7, gain: 1.15 },
  ],
}

/** Which note file plays `semi` semitones above C5, and at what rate. */
export function noteFor(semi: number) {
  const steps = [0, 2, 4, 6, 8, 10, 12]
  let i = steps.length - 1
  while (i > 0 && steps[i] > semi) i--
  return { note: i, rate: 2 ** ((semi - steps[i]) / 12) }
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
