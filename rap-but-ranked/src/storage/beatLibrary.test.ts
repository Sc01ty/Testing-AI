import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetDbForTests } from './db'
import { deleteBeat, getBeat, getSavedBeats, listBeats, saveBeat, subscribeBeats, updateBeat, type NewBeat } from './beatLibrary'

const sample = (name: string, over: Partial<NewBeat> = {}): NewBeat => ({
  name,
  fileName: `${name}.mp3`,
  mimeType: 'audio/mpeg',
  sizeBytes: 3,
  durationSec: 120,
  bpm: 90,
  bpmSource: 'auto',
  bpmConfidence: 0.8,
  introOffset: 2,
  introOffsetSource: 'auto',
  beatsPerBar: 4,
  peaks: [0.1, 0.5, 1],
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
  ...over,
})

describe('beat library', () => {
  beforeEach(async () => {
    _resetDbForTests()
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase('rap-but-ranked')
      req.onsuccess = req.onerror = req.onblocked = () => r()
    })
  })

  it('saves, lists newest first and returns grid-ready beats', async () => {
    const a = await saveBeat(sample('First'))
    await new Promise((r) => setTimeout(r, 2))
    await saveBeat(sample('Second', { bpm: 120, introOffset: 0 }))
    expect((await listBeats()).map((b) => b.name)).toEqual(['Second', 'First'])
    const all = await getSavedBeats()
    expect(all).toHaveLength(2)
    const first = all.find((b) => b.id === a.id)!
    expect(first.secondsPerBeat).toBeCloseTo(60 / 90)
    expect(first.secondsPerBar).toBeCloseTo(240 / 90)
    expect(first.barCount).toBe(Math.floor(118 / (240 / 90)))
    expect(first.blob.size).toBe(3)
  })

  it('updates name / bpm / offset and recomputes the grid', async () => {
    const b = await saveBeat(sample('Old'))
    await updateBeat(b.id, { name: 'New', bpm: 120, bpmSource: 'manual', introOffset: 0 })
    const got = (await getBeat(b.id))!
    expect(got.name).toBe('New')
    expect(got.bpmSource).toBe('manual')
    expect(got.secondsPerBar).toBeCloseTo(2)
    expect(got.updatedAt).toBeGreaterThanOrEqual(got.createdAt)
  })

  it('deletes metadata and audio together, and notifies subscribers', async () => {
    let calls = 0
    const off = subscribeBeats(() => calls++)
    const b = await saveBeat(sample('Gone'))
    await deleteBeat(b.id)
    off()
    expect(await getBeat(b.id)).toBeNull()
    expect(await getSavedBeats()).toEqual([])
    expect(calls).toBe(2)
  })
})
