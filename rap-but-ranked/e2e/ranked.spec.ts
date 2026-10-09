import { expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The ranked loop end to end: finish a real 8-bar track (fake mic) → the RP
 * reveal pays out once → the menu chip moves → claim a name → publish the
 * track to the Feed → it plays back from the server → unpublish.
 * Needs the PHP API on :4180 (php -S localhost:4180 -t public), like the room tests.
 */
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/fake-voice.wav')}`, '--autoplay-policy=no-user-gesture-required'],
  },
})
test.setTimeout(240_000)

const BARS: [string, string][] = [
  ['I finally made enough to get my mum out the flats', 'Every single bill paid now we never looking back'],
  ['Bought my mum a house with a garden and a gate', 'She cried at the keys said her son was worth the wait'],
  ['Then the landlord called saying the cheque bounced twice', 'Every win comes with a bill and a heavier price'],
  ['Now I am back where I started counting money in the flat', 'But this time it is mine and I am never going back'],
]

async function finishTrack(page: Page, name: string) {
  await page.goto('/#/beats')
  await page.getByRole('button', { name: /add beat/i }).first().click()
  await page.getByTestId('beat-file-input').setInputFiles('e2e/fixtures/Test Beat 92bpm.mp3')
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  await page.getByLabel('Beat name').fill('Ranked Beat')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await page.goto('/#/play')
  await page.locator('.modes__item', { hasText: 'SINGLEPLAYER' }).click()
  await page.locator('.modes__item', { hasText: 'PLAY' }).click()
  await page.getByPlaceholder('Untitled track').fill(name)
  await page.getByRole('button', { name: 'wanting money', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  for (const bars of BARS) {
    await page.getByLabel('Bar 1').fill(bars[0])
    await page.getByLabel('Bar 2').fill(bars[1])
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await expect(page.getByText(/Take saved/)).toBeVisible({ timeout: 35000 })
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.locator('.judging')).toBeVisible()
    await page.waitForTimeout(600)
    await page.keyboard.press('Space')
    await expect(page.locator('.judging__go')).toBeEnabled({ timeout: 30000 })
    await page.locator('.judging__go').click()
  }
  await expect(page.locator('.complete__name')).toHaveText(name)
}

test('finish a track → RP → claim a name → publish → play from the Feed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const name = `E2E${Date.now() % 1_000_000}`
  const track = `Ranked ${name}`

  await finishTrack(page, track)

  // ── the RP reveal: first piece is placement 1 of 3, it ticks in, then settles ──
  const reveal = page.locator('.rp-reveal')
  await expect(reveal).toBeVisible()
  await expect(reveal).toContainText('Placement 1 of 3')
  await expect(reveal).toHaveAttribute('data-done', '', { timeout: 10000 })
  await expect(reveal.locator('.rp-reveal__lines li').first()).toContainText(/Track score \d+ vs par 45/)
  const delta = Number(await reveal.locator('.rp-reveal__delta b').innerText())
  expect(delta).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: 'test-results/ranked-reveal.png' })

  // reloading the finished track doesn't pay out twice
  await page.reload()
  await expect(page.locator('.rp-reveal')).toBeVisible()
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('rbr.ranked.v1') ?? '{}'))
  expect(profile.events).toBe(1)
  expect(profile.rp).toBe(delta)

  // ── menu chip ──
  await page.goto('/#/')
  await page.mouse.click(10, 10)
  await expect(page.locator('.rank-chip--live')).toContainText('PLACEMENT 1/3')

  // ── claim a name on the Feed (test name, local server) ──
  await page.goto('/#/feed')
  await page.getByRole('button', { name: 'Claim a name' }).click()
  await page.getByPlaceholder('3–20 letters or numbers').fill(name)
  await page.getByRole('button', { name: 'Claim name' }).click()
  await expect(page.locator('.account__code')).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
  await page.getByRole('button', { name: 'I’ve saved it' }).click()
  // the server replayed this device's history with its own maths
  const synced = await page.evaluate(() => JSON.parse(localStorage.getItem('rbr.ranked.v1') ?? '{}'))
  expect(synced.events).toBe(1)
  expect(synced.rp).toBe(delta)

  // ── publish ──
  await page.getByRole('button', { name: '+ Publish rap' }).first().click()
  await page.locator('.pick', { hasText: track }).click()
  await page.getByRole('textbox', { name: /caption/i }).fill('made in the test')
  await page.getByRole('button', { name: 'Publish to the Feed' }).click()
  const card = page.locator('.tcard', { hasText: track })
  await expect(card).toBeVisible({ timeout: 30000 })
  await expect(card).toContainText(name)
  await page.screenshot({ path: 'test-results/ranked-feed.png' })

  // ── open it: lyrics and scores came with it; it streams from the server ──
  await card.locator('.tcard__main').click()
  await expect(page.locator('.tsheet__lyrics li')).toHaveCount(8)
  await expect(page.locator('.tsheet__lyrics')).toContainText(BARS[0][0])
  const audioResponse = page.waitForResponse((r) => r.url().includes('social.php?audio=') && r.status() < 300)
  await page.locator('.tsheet__play').click()
  expect((await audioResponse).status()).toBeLessThan(300)
  // a listen counts after 8 seconds
  await expect(page.locator('.tsheet__plays')).toContainText('▶ 1', { timeout: 15000 })
  await page.screenshot({ path: 'test-results/ranked-track.png' })

  // already published → greyed out in the picker
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '+ Publish rap' }).first().click()
  await expect(page.locator('.pick', { hasText: track })).toBeDisabled()
  await page.keyboard.press('Escape')

  // ── leaderboards + profile ──
  await page.goto('/#/leaderboards')
  await page.getByRole('tab', { name: 'Top scores' }).click()
  await expect(page.locator('.tcard', { hasText: track })).toBeVisible()
  await page.goto(`/#/profile/${name}`)
  await expect(page.locator('.profile__tracks .tcard', { hasText: track })).toBeVisible()

  // ── clean up: unpublish ──
  await page.locator('.profile__tracks .tcard__main').first().click()
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await page.locator('.tsheet__confirm').getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.locator('.profile__tracks')).toHaveCount(0)

  expect(errors).toEqual([])
})
