import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { openDb, _resetDbForTests } from '../storage/db'
it('upgrades v3 without rewriting a legacy session or losing its recorded blob', async () => {
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase('rap-but-ranked')
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('rap-but-ranked', 3)
    r.onupgradeneeded = () => {
      for (const name of ['beats', 'beatAudio', 'sessions', 'takeAudio', 'freestyles']) {
        const store = r.result.createObjectStore(name, { keyPath: 'id' })
        if (name === 'takeAudio') store.createIndex('sessionId', 'sessionId')
      }
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  const legacy = {
    id: 'old',
    status: 'complete',
    rounds: [{ lyrics: ['old line', 'still here'], take: { id: 'voice' } }],
  }
  const tx = old.transaction(['sessions', 'takeAudio'], 'readwrite')
  tx.objectStore('sessions').put(legacy)
  tx.objectStore('takeAudio').put({
    id: 'voice',
    sessionId: 'old',
    blob: new Blob(['original audio']),
  })
  await new Promise<void>((r) => {
    tx.oncomplete = () => r()
  })
  old.close()
  _resetDbForTests()
  const db = await openDb()
  expect(db.version).toBe(4)
  expect(db.objectStoreNames.contains('multiplayer')).toBe(true)
  const read = <T>(store: string, key: string) =>
    new Promise<T>((r) => {
      const q = db.transaction(store).objectStore(store).get(key)
      q.onsuccess = () => r(q.result)
    })
  expect(await read('sessions', 'old')).toEqual(legacy)
  expect(await (await read<{ blob: Blob }>('takeAudio', 'voice')).blob.text()).toBe(
    'original audio',
  )
  db.close()
  _resetDbForTests()
})
