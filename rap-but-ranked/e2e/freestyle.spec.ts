import { expect, test, type Page } from '@playwright/test'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Freestyle, start to finish, with Chrome's fake microphone. The voice is
 * synthetic speech (e2e/fixtures/speech-voice.wav, made with the MIT-licensed
 * SpeechT5 model) so on-device speech recognition has real words to hear.
 */
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/speech-voice.wav')}`],
  },
})

/** SHOTS=dir saves screenshots of key screens (for reviewing the UI). */
async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(1600) // let entrance animations settle
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true })
}

async function addBeat(page: Page) {
  await page.goto('/#/beats')
  await page.getByRole('button', { name: /add beat/i }).first().click()
  await page.getByTestId('beat-file-input').setInputFiles('e2e/fixtures/Test Beat 92bpm.mp3')
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  await page.getByLabel('Beat name').fill('FS Beat')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row', { hasText: 'FS Beat' })).toBeVisible()
}

async function runFreestyle(page: Page, difficulty: string, transcribe: boolean, category = 'Mixed') {
  await page.goto('/#/freestyle')
  await page.getByRole('radio', { name: category, exact: true }).click()
  await page.getByRole('radio', { name: new RegExp(`^${difficulty}`) }).click()
  await page.getByRole('radio', { name: '30 sec' }).click()
  const t = page.getByRole('switch', { name: 'Transcribe my freestyle' })
  if ((await t.getAttribute('aria-checked')) !== String(transcribe)) await t.click()
  await expect(page.locator('.fs-setup__note')).toContainText('12 bars')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // count-in, then words land while the beat runs (the 28s beat loops under an 12-bar freestyle)
  await expect(page.locator('.countdown')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.fs-live__word')).toBeVisible({ timeout: 10000 })
  const first = await page.locator('.fs-live__word').textContent()
  await page.getByRole('button', { name: 'Metronome' }).click()
  await expect(page.getByRole('button', { name: 'Metronome' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.fs-live__stat').first()).toContainText(/[2-9] \/ 12/, { timeout: 10000 })
  await shot(page, 'f1-live')
  return first
}

test('freestyle without speech recognition: audio-only scoring, saved, plays back', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await addBeat(page)
  await runFreestyle(page, 'Hard', false, 'Personal')

  // judged on what the audio shows only — and it says so
  await expect(page.locator('.judging')).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await expect(page.locator('.cat[data-state="shown"]')).toHaveCount(2)
  await expect(page.locator('.feedback')).toContainText(/speech recognition/i)
  await page.getByRole('button', { name: 'See the breakdown' }).click()

  await expect(page.locator('.fs-complete .complete__rank')).toHaveText(/^[DCBAS]$/)
  await expect(page.locator('.fs-chip').first()).toBeVisible()
  await page.getByRole('button', { name: 'Play freestyle' }).click()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Stop' }).click()

  await page.getByRole('button', { name: 'Retry same settings' }).click()
  await expect(page.locator('.fs-live__word')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.fs-live__stage')).toContainText('personal')
  await expect(page.locator('.fs-live')).toHaveAttribute('data-phase','live',{timeout:10000})
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.judging')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'See the breakdown' }).click()
  const attempts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(res=>{const r=indexedDB.open('rap-but-ranked');r.onsuccess=()=>res(r.result)})
    const rows = await new Promise<{category:string;difficulty:string;requestedDurationSec:number}[]>(res=>{const r=db.transaction('freestyles').objectStore('freestyles').getAll();r.onsuccess=()=>res(r.result)});db.close();return rows
  })
  expect(attempts).toHaveLength(2)
  for(const attempt of attempts) expect(attempt).toMatchObject({category:'personal',difficulty:'hard',requestedDurationSec:30})

  // in SAVED, after a refresh
  await page.getByRole('button', { name: /open in BEATS/ }).click()
  await page.reload()
  const row = page.locator('.saved-row', { hasText: 'Hard freestyle' })
  await expect(row).toHaveCount(2)
  await expect(row.first()).toBeVisible()
  await expect(row.first().locator('.saved-kind')).toHaveText('Freestyle')
  expect(errors).toEqual([])
})

test('freestyle with on-device speech recognition: prompts, rhyme and variety from what was said', async ({ page }) => {
  test.setTimeout(600_000) // first run downloads the speech model (~77 MB)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await addBeat(page)
  await runFreestyle(page, 'Easy', true)

  await expect(page.locator('.fs-listening')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.judging:not(.fs-listening)')).toBeVisible({ timeout: 480000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await expect(page.locator('.cat[data-state="shown"]')).toHaveCount(5)
  await expect(page.locator('.cat').first()).toContainText('Prompts')
  await shot(page, 'f2-judging')
  await page.getByRole('button', { name: 'See the breakdown' }).click()
  if (process.env.SAVE_TAKE) {
    // debugging aid: dump the recorded take + transcript
    const dump = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const r = indexedDB.open('rap-but-ranked')
        r.onsuccess = () => res(r.result)
      })
      const all = <T,>(store: string) =>
        new Promise<T[]>((res) => {
          const q = db.transaction(store).objectStore(store).getAll()
          q.onsuccess = () => res(q.result as T[])
        })
      const f = (await all<{ take: { id: string }; transcript: unknown }>('freestyles'))[0]
      const rows = await all<{ id: string; blob: Blob }>('takeAudio')
      const blob = rows.find((r) => r.id === f.take.id)!.blob
      const b = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
      return { wav: btoa(bin), transcript: f.transcript }
    })
    writeFileSync(process.env.SAVE_TAKE + '.wav', Buffer.from(dump.wav, 'base64'))
    writeFileSync(process.env.SAVE_TAKE + '.json', JSON.stringify(dump.transcript, null, 1))
  }
  // the transcript has the words the fake voice says
  await expect(page.locator('.fs-transcript')).toContainText(/money|family|school|city|music|crowd/i)
  await shot(page, 'f3-complete')
  expect(errors).toEqual([])
})
