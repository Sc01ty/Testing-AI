import { flushSync } from 'react-dom'
import { isReducedMotion } from './motion'

export type NavDirection = 'forward' | 'back'

let current: ViewTransition | null = null

/**
 * Wrap a state change in a View Transition so screens morph into each other
 * (shared names: the brand mark and each page title). Falls back to an
 * instant swap + CSS entrance animations where unsupported or when motion
 * is reduced.
 */
export function runViewTransition(update: () => void, direction: NavDirection) {
  const root = document.documentElement
  root.dataset.nav = direction
  if (!document.startViewTransition || isReducedMotion()) {
    update()
    return
  }
  current?.skipTransition()
  const vt = document.startViewTransition(() => flushSync(update))
  current = vt
  vt.finished.finally(() => {
    if (current === vt) current = null
  })
}
