import type { Session } from '../domain/types'
import { STORES, openDb, requestToPromise, txDone } from './db'

/**
 * Play sessions and their vocal takes, independent of any UI.
 * A session is saved after every change, so a refresh mid-track resumes
 * exactly where you were.
 */
export async function saveSession(session: Session): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORES.sessions, 'readwrite')
  tx.objectStore(STORES.sessions).put({ ...session, updatedAt: Date.now() })
  await txDone(tx)
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await openDb()
  return (await requestToPromise(db.transaction(STORES.sessions).objectStore(STORES.sessions).get(id) as IDBRequest<Session | undefined>)) ?? null
}

export async function listSessions(): Promise<Session[]> {
  const db = await openDb()
  const all = await requestToPromise(db.transaction(STORES.sessions).objectStore(STORES.sessions).getAll() as IDBRequest<Session[]>)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The most recent unfinished track, if any (for "Continue"). */
export async function latestActiveSession(): Promise<Session | null> {
  return (await listSessions()).find((s) => s.status === 'active') ?? null
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORES.sessions, STORES.takeAudio], 'readwrite')
  tx.objectStore(STORES.sessions).delete(id)
  const idx = tx.objectStore(STORES.takeAudio).index('sessionId')
  const req = idx.openCursor(IDBKeyRange.only(id))
  req.onsuccess = () => {
    const c = req.result
    if (c) {
      c.delete()
      c.continue()
    }
  }
  await txDone(tx)
}

export async function saveTakeAudio(id: string, sessionId: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORES.takeAudio, 'readwrite')
  tx.objectStore(STORES.takeAudio).put({ id, sessionId, blob })
  await txDone(tx)
}

export async function getTakeAudio(id: string): Promise<Blob | null> {
  const db = await openDb()
  const row = await requestToPromise(db.transaction(STORES.takeAudio).objectStore(STORES.takeAudio).get(id) as IDBRequest<{ blob: Blob } | undefined>)
  return row?.blob ?? null
}

export async function deleteTakeAudio(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORES.takeAudio, 'readwrite')
  tx.objectStore(STORES.takeAudio).delete(id)
  await txDone(tx)
}
