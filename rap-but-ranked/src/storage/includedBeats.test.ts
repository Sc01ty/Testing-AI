import 'fake-indexeddb/auto'
import { it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { listBeats, getBeat, getSavedBeats, updateBeat, deleteBeat } from './beatLibrary'
const catalogue = JSON.parse(
  readFileSync(new URL('../../public/beats/catalogue.json', import.meta.url), 'utf8'),
)
it('ships nine actual audio files, excludes Bank Fees, and keeps edited beat grids consistent', async () => {
  expect(catalogue).toHaveLength(9)
  expect(catalogue.map((b: any) => b.name).join(' ')).not.toMatch(/bank fees/i)
  for (const b of catalogue) {
    const file = readFileSync(new URL(`../../public/${b.url}`, import.meta.url))
    expect(file.length).toBe(b.sizeBytes)
    expect(b.bpm).toBeGreaterThan(40)
    expect(b.durationSec).toBeGreaterThan(60)
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('catalogue.json')
        ? new Response(JSON.stringify(catalogue))
        : new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } }),
    ),
  )
  expect(await listBeats()).toHaveLength(9)
  await updateBeat(catalogue[0].id, { bpm: 100, bpmSource: 'manual', introOffset: 2 })
  expect((await getBeat(catalogue[0].id))!.bpm).toBe(100)
  expect((await getSavedBeats()).find((b) => b.id === catalogue[0].id)!.secondsPerBar).toBe(2.4)
  await deleteBeat(catalogue[0].id)
  expect(await getBeat(catalogue[0].id)).not.toBeNull() // original asset remains available to old saved tracks
  vi.unstubAllGlobals()
})
