import { router } from './router'

/** BEATS has two tabs; which one is open is remembered for the tab's life. */
export type BeatsTab = 'beats' | 'saved'
export const BEATS_TAB_KEY = 'rbr.beatsTab'
export const SAVED_OPEN_KEY = 'rbr.savedOpen'

export function readBeatsTab(): BeatsTab {
  try {
    return sessionStorage.getItem(BEATS_TAB_KEY) === 'saved' ? 'saved' : 'beats'
  } catch {
    return 'beats'
  }
}

export function writeBeatsTab(t: BeatsTab) {
  try {
    sessionStorage.setItem(BEATS_TAB_KEY, t)
  } catch {
    /* ignore */
  }
}

/** Jump to BEATS → SAVED (e.g. from a finished track). */
export function openSavedShelf() {
  writeBeatsTab('saved')
  try {
    sessionStorage.removeItem(SAVED_OPEN_KEY)
  } catch {
    /* ignore */
  }
  router.navigate('beats')
}
