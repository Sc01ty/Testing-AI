import { useSyncExternalStore } from 'react'
import { audio } from '../audio/AudioEngine'
import { runViewTransition } from '../motion/viewTransition'
import { parseHash, parseParam, routeDepth, type RouteId } from './routes'

/**
 * Tiny hash router (works on GitHub Pages with no server config).
 * Every route change goes through runViewTransition so navigation feels
 * continuous, including the browser's own back button.
 */
const listeners = new Set<() => void>()
let route: RouteId = typeof window === 'undefined' ? 'menu' : parseHash(window.location.hash)
let param: string | null = typeof window === 'undefined' ? null : parseParam(window.location.hash)

function setRoute(next: RouteId, nextParam: string | null) {
  route = next
  param = nextParam
  listeners.forEach((fn) => fn())
}

function go(next: RouteId, nextParam: string | null = null) {
  if (next === route) {
    if (nextParam !== param) setRoute(next, nextParam)
    return
  }
  document.documentElement.dataset.themeTransition = route === 'feed' || next === 'feed' ? 'feed' : ''
  const direction = routeDepth(next) >= routeDepth(route) ? 'forward' : 'back'
  audio.setMusicMood(next === 'menu' ? 'menu' : 'muffled')
  runViewTransition(() => setRoute(next, nextParam), direction)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => go(parseHash(window.location.hash), parseParam(window.location.hash)))
}

export const router = {
  get: () => route,
  param: () => param,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  navigate(next: RouteId, nextParam: string | null = null) {
    if (next === route && nextParam === param) return
    history.pushState({ rbr: true }, '', next === 'menu' ? '#/' : `#/${next}${nextParam ? `/${encodeURIComponent(nextParam)}` : ''}`)
    go(next, nextParam)
  },
  back() {
    if ((history.state as { rbr?: boolean } | null)?.rbr) history.back()
    else {
      history.replaceState(null, '', '#/')
      go('menu', null)
    }
  },
}

export function useRoute() {
  return useSyncExternalStore(router.subscribe, router.get, router.get)
}

/** The bit after the route (`#/profile/Tivro` → `Tivro`). */
export function useRouteParam() {
  return useSyncExternalStore(router.subscribe, router.param, router.param)
}
