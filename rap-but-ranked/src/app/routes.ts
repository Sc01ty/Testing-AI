export type RouteId = 'menu' | 'play' | 'beats' | 'freestyle' | 'settings' | 'feed' | 'leaderboards' | 'profile' | 'admin'

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

/** The smaller row under the main menu: the social side. */
export const NAV_ROUTES: RouteMeta[] = [
  { id: 'feed', label: 'FEED', tagline: 'Tracks from everyone. Publish yours.', stage: 6 },
  { id: 'leaderboards', label: 'LEADERBOARDS', tagline: 'Who’s on top, and what everyone’s playing.', stage: 6 },
]

/** Reached from inside other screens, never from the menu. */
export const INNER_ROUTES: RouteMeta[] = [
  { id: 'profile', label: 'PROFILE', tagline: 'Rank, tracks and listens.', stage: 6 },
  { id: 'admin', label: 'MODERATION', tagline: 'Reported tracks and bans.', stage: 6 },
]

export const ALL_ROUTES: RouteMeta[] = [...MENU_ROUTES, ...NAV_ROUTES, ...INNER_ROUTES]

/** The latest stage that's been built; screens for later stages show a lock badge. */
export const BUILT_STAGE = 6

export const ROUTE_IDS: RouteId[] = ['menu', ...ALL_ROUTES.map((r) => r.id)]

export function parseHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTE_IDS as string[]).includes(id) ? (id as RouteId) : 'menu'
}

/** `#/profile/Tivro` → `Tivro`. */
export function parseParam(hash: string): string | null {
  const parts = hash.replace(/^#\/?/, '').split('/')
  if (parts.length < 2 || !parts[1]) return null
  try {
    return decodeURIComponent(parts[1].split('?')[0])
  } catch {
    return null
  }
}

export const routeDepth = (id: RouteId) => (id === 'menu' ? 0 : id === 'profile' || id === 'admin' ? 2 : 1)
