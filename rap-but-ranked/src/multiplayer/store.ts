import { openDb, STORES, requestToPromise, txDone } from '../storage/db'
import { notifySaved } from '../storage/events'
import type { DuoSession } from './session'
export async function saveDuo(s: DuoSession) {
  const db = await openDb()
  const tx = db.transaction(STORES.multiplayer, 'readwrite')
  tx.objectStore(STORES.multiplayer).put({ ...s, updatedAt: Date.now() })
  await txDone(tx)
  notifySaved()
}
export async function listDuos(): Promise<DuoSession[]> {
  const db = await openDb()
  return requestToPromise(
    db.transaction(STORES.multiplayer).objectStore(STORES.multiplayer).getAll(),
  )
}
export async function getDuo(id: string): Promise<DuoSession | null> {
  return (await listDuos()).find((s) => s.id === id) ?? null
}
export async function deleteDuo(id: string) {
  const db = await openDb()
  const tx = db.transaction([STORES.multiplayer, STORES.takeAudio], 'readwrite')
  tx.objectStore(STORES.multiplayer).delete(id)
  const req = tx.objectStore(STORES.takeAudio).index('sessionId').openCursor(IDBKeyRange.only(id))
  req.onsuccess = () => {
    const c = req.result
    if (c) {
      c.delete()
      c.continue()
    }
  }
  await txDone(tx)
  notifySaved()
}
