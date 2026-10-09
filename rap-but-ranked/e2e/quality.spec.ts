import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const site = process.env.RBR_LIVE_URL ?? 'http://localhost:4173/'
function difference(a: Buffer, b: Buffer) {
  expect(a.length).toBe(b.length)
  let peak = 0,
    sum = 0
  for (let i = 44; i < a.length; i += 2) {
    const d = Math.abs(a.readInt16LE(i) - b.readInt16LE(i)) / 32768
    peak = Math.max(peak, d)
    sum += d * d
  }
  return { peak, rms: Math.sqrt(sum / ((a.length - 44) / 2)) }
}
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/tone-voice.wav')}`,
    ],
  },
})
test.setTimeout(120000)

test('Rhyme Run: clear mobile progression, honest unjudged hits, same-settings retry', async ({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.setViewportSize({width:390,height:844})
  await page.goto(`${site}#/freestyle`)
  await page.getByRole('radio',{name:'Rhyme Run',exact:true}).click()
  await page.getByRole('radio',{name:'30 sec',exact:true}).click()
  const transcription=page.getByRole('switch',{name:'Transcribe my freestyle'})
  if(await transcription.getAttribute('aria-checked')==='true')await transcription.click()
  await page.getByRole('button',{name:'Start',exact:true}).click()
  await expect(page.locator('.fs-live')).toHaveAttribute('data-phase','live',{timeout:15000})
  await expect(page.locator('.fs-live .rr')).toHaveAttribute('data-running','true')
  await expect(page.locator('.fs-live__meta')).toContainText('Rhyme Run')
  await expect(page.locator('.fs-live .rr__row[data-kind="target"] .rr__cell--word').first()).toHaveText(/^[A-Z']+$/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.waitForTimeout(1300)
  await page.screenshot({path:'test-results/rhyme-mobile.png',fullPage:true})
  await page.waitForTimeout(4100)
  await page.getByRole('button',{name:'Stop',exact:true}).click()
  await expect(page.locator('.judging')).toBeVisible({timeout:15000})
  await page.keyboard.press('Space')
  await page.getByRole('button',{name:'See the breakdown'}).click()
  await expect(page.locator('.rr-results')).toContainText('Not checked')
  await page.getByRole('button',{name:'Retry same settings'}).click()
  await expect(page.locator('.fs-live')).toHaveAttribute('data-phase','live',{timeout:15000})
  await expect(page.locator('.fs-live__meta')).toContainText('Rhyme Run')
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})

for (const kind of ['track', 'multiplayer'] as const)
  test(`${kind}: continuous ad-lib pass, keep, mute, export and Saved reload`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(`${site}#/beats`)
    await expect(page.getByRole('tab', { name: /Saved/ })).toBeVisible()
    await page.evaluate(async (kind) => {
      const catalogue = await fetch(
        new URL('beats/catalogue.json', location.href.split('#')[0]),
      ).then((r) => r.json())
      const beat =
        catalogue.find((b: { name: string }) => /FastHardTrap/i.test(b.name)) ?? catalogue[0]
      const bpm = 120,
        spBar = 2,
        now = Date.now(),
        id = 'quality-' + kind
      const takeId = id + ':lead',
        duration = 17,
        sr = 22050
      const buffer = new ArrayBuffer(44 + duration * sr * 2),
        view = new DataView(buffer)
      const txt = (at: number, s: string) =>
        [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
      txt(0, 'RIFF')
      view.setUint32(4, buffer.byteLength - 8, true)
      txt(8, 'WAVE')
      txt(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sr, true)
      view.setUint32(28, sr * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      txt(36, 'data')
      view.setUint32(40, buffer.byteLength - 44, true)
      for (let i = 0; i < duration * sr; i++)
        view.setInt16(44 + i * 2, Math.sin((i / sr) * 2 * Math.PI * 660) * 4000, true)
      const blob = new Blob([buffer], { type: 'audio/wav' })
      const db = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open('rap-but-ranked')
        r.onsuccess = () => res(r.result)
      })
      const tx = db.transaction(
        [kind === 'track' ? 'sessions' : 'multiplayer', 'takeAudio'],
        'readwrite',
      )
      tx.objectStore('takeAudio').put({ id: takeId, sessionId: id, blob })
      const grid = { bpm, introOffset: 0, durationSec: beat.durationSec, beatsPerBar: 4 }
      const result = {
        score: 70,
        rank: 'B',
        writingScore: 70,
        performanceScore: 70,
        categories: [
          {
            category: 'rhyme',
            label: 'Rhyme',
            score: 70,
            basis: 'lyrics',
            reasons: ['night / light — perfect rhyme'],
          },
        ],
        feedback: ['Two sound landings.'],
        analysis: '',
        scoredAt: now,
      }
      const take = {
        id: takeId,
        beatId: beat.id,
        barStart: 0,
        barCount: 8,
        beatTimeSec: 0,
        sectionStartSec: 0,
        sectionEndSec: 16,
        durationSec: duration,
        sampleRate: sr,
        latencySec: 0,
        inputPeak: 0.12,
        peaks: Array(120).fill(0.12),
        recordedAt: now,
      }
      const base = {
        id,
        beatId: beat.id,
        beatName: beat.name,
        beatGrid: grid,
        trackName: 'Adlib proof ' + kind,
        length: 8,
        storyDirection: 'money and family',
        status: 'complete',
        createdAt: now,
        updatedAt: now,
      }
      const challenge = {
        prompt: 'Write 2 bars about money.',
        focus: ['money'],
        source: 'basic',
        storyBeat: 'opening',
      }
      const turns = Array.from({ length: 4 }, (_, i) => ({
        index: i,
        player: i % 2,
        barStart: i * 2,
        barEnd: i * 2 + 2,
        start: i * 2 * spBar,
        end: (i * 2 + 2) * spBar,
        vocalOffset: 0,
        boundary: 'clean',
        lyrics: ['money in the night', 'family in the light'],
        ready: true,
        take,
        result,
        challenge,
      }))
      tx.objectStore(kind === 'track' ? 'sessions' : 'multiplayer').put(
        kind === 'track'
          ? {
              ...base,
              startingTopic: 'money',
              rounds: turns.map((t) => ({
                index: t.index,
                lyrics: t.lyrics,
                take: { ...take, id: takeId },
                result,
                challenge,
              })),
            }
          : {
              ...base,
              version: 1,
              kind: 'multiplayer',
              mode: 'online',
              players: ['Scotty', 'Alex'],
              style: 'quick',
              topic: 'money',
              turns,
              master: null,
            },
      )
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      db.close()
    }, kind)
    await page.reload()
    await page.getByRole('tab', { name: /Saved/ }).click()
    await page
      .locator('.saved-row', { hasText: 'Adlib proof ' + kind })
      .locator('.saved-row__main')
      .click()
    const exportFile = async () => {
      const event = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download WAV', exact: true }).click()
      return readFileSync((await (await event).path())!)
    }
    const baseline = await exportFile()
    await page.getByRole('button', { name: 'Add ad-libs', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Keep ad-libs' })).toBeVisible({ timeout: 35000 })
    await expect(page.getByRole('button', { name: 'Preview ad-libs' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep ad-libs' }).click()
    await expect(page.getByRole('button', { name: 'Mute ad-libs' })).toBeVisible()
    const layered = await exportFile()
    expect(layered.equals(baseline)).toBe(false)
    await page.getByRole('button', { name: 'Mute ad-libs' }).click()
    await expect(page.getByRole('button', { name: 'Unmute ad-libs' })).toBeVisible()
    const mutedDiff = difference(await exportFile(), baseline)
    console.log(kind, 'muted export difference', mutedDiff)
    expect(mutedDiff.rms).toBeLessThan(0.0001)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Unmute ad-libs' })).toBeVisible()
    await page.getByRole('button', { name: 'Unmute ad-libs' }).click()
    const restoredDiff = difference(await exportFile(), layered)
    console.log(kind, 'restored export difference', restoredDiff)
    expect(restoredDiff.rms).toBeLessThan(0.0001)
    await page.getByRole('button', { name: 'Retake ad-libs' }).click()
    await expect(page.getByRole('button', { name: 'Cancel ad-libs' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel ad-libs' }).click()
    await expect(page.getByRole('button', { name: 'Mute ad-libs' })).toBeVisible()
    expect(difference(await exportFile(), layered).rms).toBeLessThan(0.0001)
    expect(errors).toEqual([])
  })
