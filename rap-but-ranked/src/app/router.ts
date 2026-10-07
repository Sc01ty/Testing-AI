import { useSyncExternalStore } from 'react'
import { audio } from '../audio/AudioEngine'
import { runViewTransition } from '../motion/viewTransition'
import { parseHash, routeDepth, type RouteId } from './routes'

/**
 * Tiny hash router (works on GitHub Pages with no server config).
 * Every route change goes through runViewTransition so navigation feels
 * continuous, including the browser's own back button.
 */
const listeners = new Set<() => void>()
let route: RouteId = typeof window === 'undefined' ? 'menu' : parseHash(window.location.hash)

function setRoute(next: RouteId) {
  route = next
  listeners.forEach((fn) => fn())
}

function go(next: RouteId) {
  if (next === route) return
  const direction = routeDepth(next) >= routeDepth(route) ? 'forward' : 'back'
  audio.setMusicMood(next === 'menu' ? 'menu' : 'muffled')
  runViewTransition(() => setRoute(next), direction)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => go(parseHash(window.location.hash)))
}

export const router = {
  get: () => route,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  navigate(next: RouteId) {
    if (next === route) return
    history.pushState({ rbr: true }, '', next === 'menu' ? '#/' : `#/${next}`)
    go(next)
  },
  back() {
    if ((history.state as { rbr?: boolean } | null)?.rbr) history.back()
    else {
      history.replaceState(null, '', '#/')
      go('menu')
    }
  },
}

export function useRoute() {
  return useSyncExternalStore(router.subscribe, router.get, router.get)
}
