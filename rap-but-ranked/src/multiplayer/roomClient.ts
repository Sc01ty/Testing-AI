import type { DuoSession } from './session'
export type TurnActivity = 'writing' | 'previewing' | 'recording' | 'retaking' | 'reviewing' | 'submitting'
export interface RoomAccess {
  code: string
  token: string
  player: 0 | 1
}
export interface RoomState {
  code: string
  player: 0 | 1
  token: string | null
  version: number
  unchanged?: boolean
  members: ({ name: string; ready: boolean; online: boolean } | null)[]
  session: DuoSession | null
  /** What each player is doing right now (online turns). */
  activity?: ({ state: TurnActivity; at: number } | null)[]
  signals: Record<string, unknown>[]
  now: number
}
const endpoint = `${import.meta.env.BASE_URL}api/rooms.php`
export async function roomRequest(
  action: string,
  access: RoomAccess | null,
  values: Record<string, unknown> = {},
  blob?: Blob,
): Promise<RoomState> {
  const payload = { action, ...access, ...values }
  let body: BodyInit,
    headers: HeadersInit = {}
  if (blob) {
    const form = new FormData()
    form.append('payload', JSON.stringify(payload))
    form.append('audio', blob, 'vocal.wav')
    body = form
  } else {
    body = JSON.stringify(payload)
    headers = { 'Content-Type': 'application/json' }
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(blob ? 60000 : 12000),
  })
  const result = await response
    .json()
    .catch(() => ({ error: 'Lobby service unavailable. Please retry.' }))
  if (!response.ok || result.error) throw new Error(result.error ?? 'Lobby request failed.')
  return result as RoomState
}
export async function roomAudio(access: RoomAccess, id: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'audio', ...access, id }),
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error('Could not download your teammate’s vocal. Retry saving.')
  return response.blob()
}
