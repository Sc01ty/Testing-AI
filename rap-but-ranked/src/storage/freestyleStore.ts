import type { FreestyleSession, Session } from '../domain/types'
import { STORES, openDb, requestToPromise, txDone } from './db'
import { notifySaved as notify } from './events'
import { listSessions } from './sessionStore'
import { listDuos } from '../multiplayer/store'
import type { DuoSession } from '../multiplayer/session'

/** Freestyles (one continuous take each; audio lives in takeAudio under the freestyle's id). */
export async function saveFreestyle(f: FreestyleSession): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORES.freestyles, 'readwrite')
  tx.objectStore(STORES.freestyles).put({ ...f, updatedAt: Date.now() })
  await txDone(tx)
  notify()
}

export async function getFreestyle(id: string): Promise<FreestyleSession | null> {
  const db = await openDb()
  return (await requestToPromise(db.transaction(STORES.freestyles).objectStore(STORES.freestyles).get(id) as IDBRequest<FreestyleSession | undefined>)) ?? null
}

export async function listFreestyles(): Promise<FreestyleSession[]> {
  const db = await openDb()
  const all = await requestToPromise(db.transaction(STORES.freestyles).objectStore(STORES.freestyles).getAll() as IDBRequest<FreestyleSession[]>)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteFreestyle(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORES.freestyles, STORES.takeAudio], 'readwrite')
  tx.objectStore(STORES.freestyles).delete(id)
  const req = tx.objectStore(STORES.takeAudio).index('sessionId').openCursor(IDBKeyRange.only(id))
  req.onsuccess = () => {
    const c = req.result
    if (c) {
      c.delete()
      c.continue()
    }
  }
  await txDone(tx)
  notify()
}

// ── the SAVED shelf: finished tracks + scored freestyles ──────────────
export type SavedItem = { kind: 'track'; id: string; at: number; session: Session } | { kind: 'freestyle'; id: string; at: number; freestyle: FreestyleSession } | {kind:'multiplayer';id:string;at:number;duo:DuoSession}

export async function listSaved(): Promise<SavedItem[]> {
  const [sessions, freestyles,duos] = await Promise.all([listSessions(), listFreestyles(),listDuos()])
  const items: SavedItem[] = [
    ...duos.filter(s=>s.status==='complete').map(s=>({kind:'multiplayer' as const,id:s.id,at:s.createdAt,duo:s})),
    ...sessions.filter((s) => s.status === 'complete').map((s) => ({ kind: 'track' as const, id: s.id, at: s.createdAt, session: s })),
    ...freestyles.filter((f) => f.result).map((f) => ({ kind: 'freestyle' as const, id: f.id, at: f.createdAt, freestyle: f })),
  ]
  return items.sort((a, b) => b.at - a.at)
}

/** Has the player finished at least one track? (unlocks IMPROVE) */
export async function hasCompletedTrack(): Promise<boolean> {
  return (await listSessions()).some((s) => s.status === 'complete') || (await listDuos()).some(s=>s.status==='complete')
}

