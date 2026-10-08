import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/fake-voice.wav')}`,
    ],
  },
})
test.setTimeout(180000)
async function beat(page: import('@playwright/test').Page) {
  await page.goto('/#/beats')
  await page
    .getByRole('button', { name: /add beat/i })
    .first()
    .click()
  await page.getByTestId('beat-file-input').setInputFiles('e2e/fixtures/Test Beat 92bpm.mp3')
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Beat name').fill('Trade Beat')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row')).toBeVisible()
}
for (const [style, boundary] of [
  ['Standard · 4 bars each', 'Clean'],
  ['Quick Trade · 2 bars each', 'Clean'],
  ['Standard · 4 bars each', 'Overlap · 1 beat early'],
] as const) {
  test(`duo ${style} / ${boundary}: performance, punch-in, reload, save, export`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await beat(page)
    await page.goto('/#/play')
    await page.locator('.modes__item', { hasText: 'MULTIPLAYER' }).click()
    await page.getByPlaceholder('Player 1 name').fill('Scotty')
    await page.getByPlaceholder('Player 2 name').fill('Alex')
    await page.getByPlaceholder('Our track').fill('Trade Test')
    await page.getByPlaceholder('What are you both rapping about?').fill('money')
    await page.getByRole('radio', { name: style, exact: true }).click()
    await page.getByRole('radio', { name: boundary, exact: true }).click()
    await page.getByRole('radio', { name: '8 bars', exact: true }).click()
    // BeatSelect is a button list, not a native select.
    await page.getByRole('combobox', { name: 'Beat', exact: true }).selectOption({ index: 0 })
    await page.getByRole('button', { name: 'Prepare duo track' }).click()
    const turns = style.startsWith('Standard') ? 2 : 4
    for (let t = 0; t < turns; t++) {
      for (let i = 0; i < (turns === 2 ? 4 : 2); i++)
        await page
          .getByLabel(`Bar ${i + 1}`, { exact: true })
          .fill(
            [
              'I bought my mum a house',
              'We finally escaped the rain',
              'Paid the bills before the dawn',
              'Now we never fear the pain',
            ][i],
          )
      await page.getByRole('button', { name: 'Lock section & direct next player' }).click()
    }
    await page.getByRole('button', { name: 'Start performance' }).click()
    await expect(page.getByLabel('Performance mode')).toBeVisible()
    await expect(page.locator('.duo-live h2')).toContainText('Scotty', { timeout: 10000 })
    await expect(page.locator('.duo-live h2')).toContainText('Alex', { timeout: 20000 })
    await expect(page.getByText('COMBINED TRACK SCORE')).toBeVisible({ timeout: 40000 })
    const slots = await page.locator('.duo-slot b').allTextContents()
    await page.getByRole('button', { name: 'Retake slot 1', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retake slot 1', exact: true })).toBeEnabled({
      timeout: 30000,
    })
    expect(await page.locator('.duo-slot b').allTextContents()).toEqual(slots)
    await page.getByRole('button', { name: 'Play duo track' }).click()
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download WAV', exact: true }).click()
    expect((await download).suggestedFilename()).toBe('Trade Test.wav')
    await page.goto('/#/beats')
    await page.getByRole('tab', { name: /Saved/i }).click()
    await page.locator('.saved-row__main', { hasText: 'Trade Test' }).click()
    await expect(page.getByText('COMBINED TRACK SCORE')).toBeVisible()
    await page.reload()
    await expect(page.getByText('COMBINED TRACK SCORE')).toBeVisible()
    expect(errors).toEqual([])
  })
}
