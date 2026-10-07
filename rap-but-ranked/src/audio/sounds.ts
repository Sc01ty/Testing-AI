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

export type SoundSource =
  | { kind: 'synth'; recipe: SynthRecipe; gain?: number }
  | { kind: 'file'; url: string; gain?: number }

export interface SoundDef {
  source: SoundSource
  /** Drops repeats closer together than this, so fast mouse sweeps don't machine-gun. */
  minIntervalMs?: number
}

export const UI_SOUNDS: Record<UiSoundId, SoundDef> = {
  hover: { source: { kind: 'synth', recipe: synth.hover }, minIntervalMs: 45 },
  move: { source: { kind: 'synth', recipe: synth.move }, minIntervalMs: 30 },
  confirm: { source: { kind: 'synth', recipe: synth.confirm }, minIntervalMs: 80 },
  back: { source: { kind: 'synth', recipe: synth.back }, minIntervalMs: 80 },
  transition: { source: { kind: 'synth', recipe: synth.transition }, minIntervalMs: 150 },
  toggle: { source: { kind: 'synth', recipe: synth.toggle }, minIntervalMs: 40 },
  error: { source: { kind: 'synth', recipe: synth.error }, minIntervalMs: 200 },
  enter: { source: { kind: 'synth', recipe: synth.enter }, minIntervalMs: 500 },
  // brand reveal
  impact: { source: { kind: 'synth', recipe: synth.impact }, minIntervalMs: 300 },
  swish: { source: { kind: 'synth', recipe: synth.swish }, minIntervalMs: 200 },
  impactBig: { source: { kind: 'synth', recipe: synth.impactBig }, minIntervalMs: 500 },
}

/**
 * The menu theme's first big hit is ~4.9s in. The intro starts the track at
 * MENU_THEME_START so that hit lands as "RANKED" slams in.
 */
export const MENU_THEME_START = 2.6
export const MENU_THEME_HIT = 4.88

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
