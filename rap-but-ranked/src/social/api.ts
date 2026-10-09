import type { LadderState, RpEvent } from '../ranked/ladder'

/**
 * The Feed / Leaderboards / accounts service (public/api/social.php, on the
 * same host as the multiplayer rooms). Scores are worked out in the browser,
 * so the server treats them as claims: it recomputes RP itself, caps and
 * rate-limits, and anything public can be reported and taken down.
 */
const endpoint = `${import.meta.env.BASE_URL}api/social.php`

export type PieceKind = 'track' | 'freestyle' | 'room'

export interface PublicProfile {
  name: string
  rp: number
  peak: number
  events: number
  /** 1-based position on the RP leaderboard (null until placed). */
  worldRank: number | null
  tracks: number
  listens: number
  joined: number
}

export interface MeProfile extends PublicProfile, LadderState {
  admin: boolean
  banned: boolean
}

export interface TrackCard {
  id: string
  title: string
  caption: string
  kind: PieceKind
  creator: { name: string; rp: number; events: number }
  score: number
  grade: string
  bars: number
  duration: number
  beat: string
  plays: number
  likes: number
  liked: boolean
  created: number
  hidden?: boolean
  reports?: number
}

export interface TrackDetail extends TrackCard {
  lyrics: string[]
  breakdown: { label: string; score: number }[]
  rounds: { grade: string; score: number }[]
}

export type Board = 'ranked' | 'listened' | 'trending' | 'scores'
export type BoardRow =
  | { kind: 'player'; position: number; name: string; rp: number; events: number }
  | { kind: 'track'; position: number; track: TrackCard }

export interface Auth {
  name: string
  code: string
}

let auth: Auth | null = null
export function setAuth(a: Auth | null) {
  auth = a
}

/** A random id for this browser, so plays and reports count once without an account. */
export function deviceId() {
  try {
    let id = localStorage.getItem('rbr.device')
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem('rbr.device', id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

export class SocialError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function call<T>(action: string, values: Record<string, unknown> = {}, file?: Blob): Promise<T> {
  const payload = { action, auth, device: deviceId(), ...values }
  let body: BodyInit
  let headers: HeadersInit = {}
  if (file) {
    const form = new FormData()
    form.append('payload', JSON.stringify(payload))
    form.append('audio', file, 'track.wav')
    body = form
  } else {
    body = JSON.stringify(payload)
    headers = { 'Content-Type': 'application/json' }
  }
  let response: Response
  try {
    response = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(file ? 90000 : 12000) })
  } catch {
    throw new SocialError('Can’t reach the Rap But Ranked server. Check your connection and retry.', 0)
  }
  const result = await response.json().catch(() => ({ error: 'The Rap But Ranked server isn’t answering. Retry in a moment.' }))
  if (!response.ok || result.error) throw new SocialError(result.error ?? 'Request failed.', response.status)
  return result as T
}

export const social = {
  claim: (name: string, events: RpEvent[]) => call<{ code: string; me: MeProfile }>('claim', { name, events }),
  restore: (name: string, code: string) => call<{ me: MeProfile }>('restore', { name, code }),
  me: () => call<{ me: MeProfile }>('me'),
  rp: (event: RpEvent) => call<{ me: MeProfile; delta: number; duplicate: boolean }>('rp', { event }),
  feed: (sort: 'new' | 'trending', before?: number) => call<{ tracks: TrackCard[]; next: number | null }>('feed', { sort, before }),
  track: (id: string) => call<{ track: TrackDetail }>('track', { id }),
  audioUrl: (id: string) => `${endpoint}?audio=${encodeURIComponent(id)}`,
  play: (id: string) => call<{ plays: number }>('play', { id }),
  like: (id: string, on: boolean) => call<{ likes: number; liked: boolean }>('like', { id, on }),
  report: (id: string, reason: string) => call<{ ok: true }>('report', { id, reason }),
  leaderboard: (board: Board) => call<{ rows: BoardRow[] }>('leaderboard', { board }),
  profile: (name: string) => call<{ profile: PublicProfile; tracks: TrackCard[] }>('profile', { name }),
  published: (sourceIds: string[]) => call<{ published: Record<string, string> }>('published', { sourceIds }),
  publish: (meta: PublishMeta, wav: Blob) => call<{ track: TrackCard }>('publish', { meta }, wav),
  unpublish: (id: string) => call<{ ok: true }>('unpublish', { id }),
  admin: {
    queue: () => call<{ tracks: TrackCard[]; banned: string[] }>('admin_queue'),
    track: (id: string, op: 'hide' | 'restore' | 'remove') => call<{ ok: true }>('admin_track', { id, op }),
    ban: (name: string, on: boolean) => call<{ ok: true }>('admin_ban', { name, on }),
  },
}

export interface PublishMeta {
  sourceId: string
  kind: PieceKind
  title: string
  caption: string
  lyrics: string[]
  score: number
  grade: string
  bars: number
  duration: number
  beat: string
  breakdown: { label: string; score: number }[]
  rounds: { grade: string; score: number }[]
}
