/**
 * Tiny promise wrapper over IndexedDB. One database for the app; stores are
 * added here as stages need them (beats now; takes/sessions in Stage 3–5).
 */
const DB_NAME = 'rap-but-ranked'
const DB_VERSION = 1

export const STORES = {
  beats: 'beats', // BeatMeta, keyPath id
  beatAudio: 'beatAudio', // { id, blob }, keyPath id
} as const

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available in this browser.'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.beats)) {
        db.createObjectStore(STORES.beats, { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains(STORES.beatAudio)) db.createObjectStore(STORES.beatAudio, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      // another tab upgraded the schema: let go so it can proceed
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('Could not open the local database.'))
    }
    req.onblocked = () => reject(new Error('The local database is busy in another tab. Close other tabs and try again.'))
  })
  return dbPromise
}

export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Storage transaction failed.'))
  })
}

/** Test hook: forget the cached connection (e.g. after deleting the database). */
export function _resetDbForTests() {
  dbPromise = null
}
