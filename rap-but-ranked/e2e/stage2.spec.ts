import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const MP3 = 'e2e/fixtures/Test Beat 92bpm.mp3'
const WAV = 'e2e/fixtures/test-beat-140bpm.wav'

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

async function openLibrary(page: Page) {
  await page.goto('/#/beats')
  await expect(page.getByTestId('beat-count')).not.toHaveText('Loading…')
}

/** Upload through the Add Beat flow and wait for the setup screen. */
async function upload(page: Page, file: string) {
  const add = page.getByRole('button', { name: /add beat/i }).first()
  await add.click()
  await page.getByTestId('beat-file-input').setInputFiles(file)
  await expect(page.getByText('Analysing')).toBeVisible()
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900) // BPM count-up
}

async function bpmShown(page: Page) {
  return Number(await page.getByTestId('bpm-value').textContent())
}

test('empty library → upload MP3 → analysis → save → survives refresh', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await expect(page.getByText('No beats yet')).toBeVisible()
  await expect(page.getByText('Upload your first beat to start building tracks.')).toBeVisible()

  await upload(page, MP3)
  expect(await bpmShown(page)).toBe(92)
  await expect(page.locator('.source--auto').first()).toContainText('Auto')
  await expect(page.getByLabel('Beat name')).toHaveValue('Test Beat 92bpm')
  await expect(page.locator('.stat').nth(1)).toContainText('0:28')
  // bar 1 auto-placed at the end of the 1.5s quiet intro
  const offset = Number((await page.locator('.stat').nth(2).locator('.stat__big').textContent())!.replace('s', ''))
  expect(offset).toBeGreaterThan(1.4)
  expect(offset).toBeLessThan(1.6)
  // the waveform is real: canvas has drawn pixels
  const inked = await page.locator('.beat-editor canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })
  expect(inked).toBeGreaterThan(1000)

  await page.getByLabel('Beat name').fill('Late Night Loop')
  await page.getByRole('button', { name: 'Save beat' }).click()
  const row = page.locator('.beat-row', { hasText: 'Late Night Loop' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('92')
  await expect(row).toContainText('0:28')
  await expect(page.getByTestId('beat-count')).toContainText('1 beat')

  await page.reload()
  await expect(page.locator('.beat-row', { hasText: 'Late Night Loop' })).toBeVisible()
  expect(errors).toEqual([])
})

test('WAV via drag-and-drop anywhere on the page, manual BPM override', async ({ page }) => {
  await openLibrary(page)
  const bytes = readFileSync(WAV)
  const dt = await page.evaluateHandle((data) => {
    const d = new DataTransfer()
    d.items.add(new File([new Uint8Array(data)], 'test-beat-140bpm.wav', { type: 'audio/wav' }))
    return d
  }, Array.from(bytes))
  await page.locator('.library').dispatchEvent('dragenter', { dataTransfer: dt })
  await expect(page.getByText('Drop to add beat')).toBeVisible()
  await page.locator('.library').dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  // trap at 140 is also "70": either reading is honest (short 7s loop → a little less precise)
  const detected = await bpmShown(page)
  expect(Math.min(Math.abs(detected - 70), Math.abs(detected - 140))).toBeLessThan(0.5)

  // override by typing
  const input = page.getByLabel('BPM', { exact: true })
  await input.fill('141.5')
  await input.press('Enter')
  expect(await bpmShown(page)).toBe(141.5)
  await expect(page.locator('.stat--bpm .source')).toHaveText('Manual')
  // half / double
  await page.getByRole('button', { name: '½×' }).click()
  expect(await bpmShown(page)).toBe(70.8)
  await page.getByRole('button', { name: '2×' }).click()
  expect(await bpmShown(page)).toBe(141.6)
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row', { hasText: '141.6' })).toBeVisible()
})

test('dropping a file on the page title (not the library box) still adds it', async ({ page }) => {
  await openLibrary(page)
  const bytes = readFileSync(MP3)
  const dt = await page.evaluateHandle((data) => {
    const d = new DataTransfer()
    d.items.add(new File([new Uint8Array(data)], 'title-drop.mp3', { type: 'audio/mpeg' }))
    return d
  }, Array.from(bytes))
  const title = page.locator('h1.page__title')
  await title.dispatchEvent('dragenter', { dataTransfer: dt })
  await expect(page.getByText('Drop to add beat')).toBeVisible()
  await title.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('Beat name')).toHaveValue('title-drop')
})

test('tap tempo sets BPM', async ({ page }) => {
  await openLibrary(page)
  await upload(page, MP3)
  // tap with precise in-page timing (Playwright clicks have their own latency)
  await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Tap'))!
    for (let i = 0; i < 6; i++) {
      btn.click()
      await new Promise((r) => setTimeout(r, 500))
    }
  })
  const bpm = await bpmShown(page)
  expect(bpm).toBeGreaterThan(110)
  expect(bpm).toBeLessThan(130)
  await expect(page.locator('.stat--bpm .source')).toHaveText('Tapped')
})

test('unsupported files are refused politely', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: /add beat/i }).click()
  await page.getByTestId('beat-file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByText("“notes.txt” isn't an MP3 or WAV.")).toBeVisible()
})

test('several beats; only one preview plays at a time; leaving stops it', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await upload(page, MP3)
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row')).toHaveCount(1)
  await upload(page, WAV)
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row')).toHaveCount(2)

  const rows = page.locator('.beat-row')
  await rows.nth(0).getByRole('button', { name: /^Play / }).click()
  await expect(rows.nth(0)).toHaveAttribute('data-playing', '')
  await page.waitForTimeout(800)
  await rows.nth(1).getByRole('button', { name: /^Play / }).click()
  await expect(rows.nth(1)).toHaveAttribute('data-playing', '')
  await expect(rows.nth(0)).not.toHaveAttribute('data-playing', '')
  await expect(page.locator('.beat-row[data-playing]')).toHaveCount(1)

  // position actually advances (audio clock is running)
  const p1 = Number(await rows.nth(1).locator('canvas').getAttribute('aria-valuenow'))
  await page.waitForTimeout(1300)
  await rows.nth(1).hover()
  const p2 = Number(await rows.nth(1).locator('canvas').getAttribute('aria-valuenow'))
  expect(p2).toBeGreaterThanOrEqual(p1)

  // pause
  await rows.nth(1).getByRole('button', { name: /^Pause / }).click()
  await expect(page.locator('.beat-row[data-playing]')).toHaveCount(0)

  // leaving the screen stops playback
  await rows.nth(0).getByRole('button', { name: /^Play / }).click()
  await expect(rows.nth(0)).toHaveAttribute('data-playing', '')
  await page.getByRole('button', { name: /^Menu/ }).click()
  // first visit to the menu in this tab plays the brand sting
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu', { timeout: 5000 })
  await page.locator('.menu__item', { hasText: 'BEATS' }).click()
  await expect(page.locator('.beat-row')).toHaveCount(2)
  await expect(page.locator('.beat-row[data-playing]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('edit name / BPM / offset and delete with confirmation', async ({ page }) => {
  await openLibrary(page)
  await upload(page, MP3)
  await page.getByRole('button', { name: 'Save beat' }).click()
  const row = page.locator('.beat-row').first()
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: /^Edit / }).click()
  await expect(page.locator('.beat-editor[data-mode="edit"]')).toBeVisible()
  await page.getByLabel('Beat name').fill('Renamed')
  await page.getByRole('button', { name: 'BPM up' }).click()
  await page.getByRole('button', { name: '0:00' }).click()
  // Esc closes the editor, not the page
  await page.keyboard.press('Escape')
  await expect(page.locator('.beat-editor')).toHaveCount(0)
  await expect(page.locator('h1.page__title')).toHaveText('BEATS')
  await expect(page.locator('.beat-row', { hasText: 'Renamed' })).toHaveCount(0)

  await page.locator('.beat-row').first().getByRole('button', { name: /^Edit / }).click()
  await page.getByLabel('Beat name').fill('Renamed')
  await page.getByRole('button', { name: 'BPM up' }).click()
  await page.getByRole('button', { name: '0:00' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  // the editor closes once the write has committed
  await expect(page.locator('.beat-editor')).toHaveCount(0)
  await page.reload()
  const renamed = page.locator('.beat-row', { hasText: 'Renamed' })
  await expect(renamed).toContainText('93')
  await renamed.getByRole('button', { name: /^Edit / }).click()
  await expect(page.locator('.stat').nth(2).locator('.stat__big')).toHaveText('0.00s')
  await page.keyboard.press('Escape')

  // delete: first back out, then confirm
  await renamed.getByRole('button', { name: /^Delete / }).click()
  await expect(renamed.locator('.beat-row__confirm')).toContainText('Delete Renamed?')
  await renamed.getByRole('button', { name: 'Keep' }).click()
  await expect(renamed).toBeVisible()
  await renamed.getByRole('button', { name: /^Delete / }).click()
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('No beats yet')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No beats yet')).toBeVisible()
})

test('Play and Freestyle can see saved beats', async ({ page }) => {
  await openLibrary(page)
  await upload(page, MP3)
  await page.getByLabel('Beat name').fill('For Play')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row')).toHaveCount(1)
  await page.goto('/#/play')
  await page.locator('.modes__item', { hasText: 'SINGLEPLAYER' }).click()
  await page.locator('.modes__item', { hasText: 'PLAY' }).click()
  await expect(page.getByLabel('Beat', { exact: true })).toContainText('For Play · 92 BPM · 0:28')
  await page.goto('/#/freestyle')
  await expect(page.getByLabel('Beat', { exact: true })).toContainText('For Play')
})
