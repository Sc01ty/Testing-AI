import { gridFor } from '../domain/beatGrid'
import type { BeatMeta, SavedBeat } from '../domain/types'
import { STORES, openDb, requestToPromise, txDone } from './db'

/**
 * The beat library, independent of any UI.
 *
 *   getSavedBeats()      → SavedBeat[] (metadata + audio blob + grid), newest first
 *   listBeats()          → BeatMeta[]  (no audio; cheap, for lists)
 *   getBeat(id)          → SavedBeat | null
 *   saveBeat(input)      → SavedBeat
 *   updateBeat(id, patch)
 *   deleteBeat(id)
 *   subscribeBeats(fn)   → re-run fn whenever the library changes (this tab or another)
 *
 * Audio blobs live in their own store so listing never loads them.
 */
export type NewBeat = Omit<BeatMeta, 'id' | 'createdAt' | 'updatedAt'> & { blob: Blob }
export type BeatPatch = Partial<Pick<BeatMeta, 'name' | 'bpm' | 'bpmSource' | 'bpmConfidence' | 'introOffset' | 'introOffsetSource' | 'beatsPerBar'>>

export const MAX_BEAT_BYTES = 80 * 1024 * 1024

type Listener = () => void
const listeners = new Set<Listener>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rbr-beats') : null
channel?.addEventListener('message', () => listeners.forEach((fn) => fn()))

function changed() {
  listeners.forEach((fn) => fn())
  channel?.postMessage('changed')
}

export function subscribeBeats(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function withGrid(meta: BeatMeta, blob: Blob): SavedBeat {
  const g = gridFor({ bpm: meta.bpm, introOffset: meta.introOffset, durationSec: meta.durationSec, beatsPerBar: meta.beatsPerBar })
  return { ...meta, blob, secondsPerBeat: g.secondsPerBeat, secondsPerBar: g.secondsPerBar, barCount: g.barCount }
}

const newestFirst = (a: BeatMeta, b: BeatMeta) => b.createdAt - a.createdAt

export async function listBeats(): Promise<BeatMeta[]> {
  const db = await openDb()
  const all = await requestToPromise(db.transaction(STORES.beats).objectStore(STORES.beats).getAll() as IDBRequest<BeatMeta[]>)
  return all.sort(newestFirst)
}

export async function getBeat(id: string): Promise<SavedBeat | null> {
  const db = await openDb()
  const tx = db.transaction([STORES.beats, STORES.beatAudio])
  const [meta, audio] = await Promise.all([
    requestToPromise(tx.objectStore(STORES.beats).get(id) as IDBRequest<BeatMeta | undefined>),
    requestToPromise(tx.objectStore(STORES.beatAudio).get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>),
  ])
  return meta && audio ? withGrid(meta, audio.blob) : null
}

export async function getBeatAudio(id: string): Promise<Blob | null> {
  const db = await openDb()
  const row = await requestToPromise(db.transaction(STORES.beatAudio).objectStore(STORES.beatAudio).get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>)
  return row?.blob ?? null
}

/** Everything Play / Freestyle need, newest first. Beats whose audio is missing are skipped. */
export async function getSavedBeats(): Promise<SavedBeat[]> {
  const db = await openDb()
  const tx = db.transaction([STORES.beats, STORES.beatAudio])
  const [metas, audio] = await Promise.all([
    requestToPromise(tx.objectStore(STORES.beats).getAll() as IDBRequest<BeatMeta[]>),
    requestToPromise(tx.objectStore(STORES.beatAudio).getAll() as IDBRequest<{ id: string; blob: Blob }[]>),
  ])
  const blobs = new Map(audio.map((a) => [a.id, a.blob]))
  return metas
    .filter((m) => blobs.has(m.id))
    .sort(newestFirst)
    .map((m) => withGrid(m, blobs.get(m.id)!))
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export async function saveBeat(input: NewBeat): Promise<SavedBeat> {
  if (input.blob.size > MAX_BEAT_BYTES) throw new Error('That file is too big to store (80 MB max).')
  const now = Date.now()
  const { blob, ...rest } = input
  const meta: BeatMeta = { ...rest, id: newId(), createdAt: now, updatedAt: now }
  const db = await openDb()
  const tx = db.transaction([STORES.beats, STORES.beatAudio], 'readwrite')
  tx.objectStore(STORES.beatAudio).put({ id: meta.id, blob })
  tx.objectStore(STORES.beats).put(meta)
  try {
    await txDone(tx)
  } catch (e) {
    throw friendlyStorageError(e)
  }
  void requestPersistence()
  changed()
  return withGrid(meta, blob)
}

export async function updateBeat(id: string, patch: BeatPatch): Promise<BeatMeta> {
  const db = await openDb()
  const tx = db.transaction(STORES.beats, 'readwrite')
  const store = tx.objectStore(STORES.beats)
  const current = await requestToPromise(store.get(id) as IDBRequest<BeatMeta | undefined>)
  if (!current) throw new Error('That beat no longer exists.')
  const next: BeatMeta = { ...current, ...patch, id, updatedAt: Date.now() }
  store.put(next)
  await txDone(tx)
  changed()
  return next
}

export async function deleteBeat(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORES.beats, STORES.beatAudio], 'readwrite')
  tx.objectStore(STORES.beats).delete(id)
  tx.objectStore(STORES.beatAudio).delete(id)
  await txDone(tx)
  changed()
}

/** Ask the browser not to evict our data under storage pressure (best effort, silent). */
async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* not supported — fine */
  }
}

function friendlyStorageError(e: unknown) {
  const name = (e as DOMException | undefined)?.name
  if (name === 'QuotaExceededError') return new Error('Your browser is out of storage space for beats. Delete a beat or free up disk space.')
  return e instanceof Error ? e : new Error('Could not save the beat.')
}
