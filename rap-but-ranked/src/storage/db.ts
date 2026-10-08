/**
 * Tiny promise wrapper over IndexedDB. One database for the app; stores are
 * added here as features need them: beats, play sessions, vocal takes, freestyles.
 */
const DB_NAME = 'rap-but-ranked'
const DB_VERSION = 3

export const STORES = {
  beats: 'beats', // BeatMeta, keyPath id
  beatAudio: 'beatAudio', // { id, blob }, keyPath id
  sessions: 'sessions', // Session, keyPath id
  takeAudio: 'takeAudio', // { id, sessionId, blob }, keyPath id (sessionId = play session or freestyle)
  freestyles: 'freestyles', // FreestyleSession, keyPath id
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
      // v2: play sessions + recorded vocal takes
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORES.takeAudio)) {
        db.createObjectStore(STORES.takeAudio, { keyPath: 'id' }).createIndex('sessionId', 'sessionId')
      }
      // v3: freestyles
      if (!db.objectStoreNames.contains(STORES.freestyles)) {
        db.createObjectStore(STORES.freestyles, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      }
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
