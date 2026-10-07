export type RouteId = 'menu' | 'play' | 'beats' | 'freestyle' | 'settings'

export interface RouteMeta {
  id: RouteId
  label: string
  /** One line shown on hover in the menu and under the page title. */
  tagline: string
  /** Which build stage makes this screen real. */
  stage: number
}

export const MENU_ROUTES: RouteMeta[] = [
  { id: 'play', label: 'PLAY', tagline: 'Write 2 bars. Rap them. Get ranked.', stage: 3 },
  { id: 'beats', label: 'BEATS', tagline: 'Your beat library. Upload, analyse, ride.', stage: 2 },
  { id: 'freestyle', label: 'FREESTYLE', tagline: 'No pen. Prompts hit every few bars.', stage: 6 },
  { id: 'settings', label: 'SETTINGS', tagline: 'Sound, motion, devices.', stage: 7 },
]

export const ROUTE_IDS: RouteId[] = ['menu', ...MENU_ROUTES.map((r) => r.id)]

export function parseHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTE_IDS as string[]).includes(id) ? (id as RouteId) : 'menu'
}

export const routeDepth = (id: RouteId) => (id === 'menu' ? 0 : 1)
