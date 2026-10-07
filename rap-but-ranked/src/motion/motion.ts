import { useSyncExternalStore } from 'react'
import { settingsStore, type MotionPreference } from '../settings/settings'

/**
 * Reduced motion is resolved from the user's setting + the OS preference
 * and mirrored onto <html data-motion="reduced|full">. CSS tokens collapse
 * durations under reduced; JS (intro, view transitions) asks isReducedMotion().
 */
export function resolveReducedMotion(pref: MotionPreference, systemPrefersReduced: boolean) {
  return pref === 'reduced' || (pref === 'system' && systemPrefersReduced)
}

const listeners = new Set<() => void>()
let reduced = false

export function initMotion() {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = () => {
    reduced = resolveReducedMotion(settingsStore.get().motion, mq.matches)
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
    listeners.forEach((fn) => fn())
  }
  mq.addEventListener('change', update)
  settingsStore.subscribe(update)
  update()
}

export const isReducedMotion = () => reduced

export function useReducedMotion() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => reduced,
    () => false,
  )
}
