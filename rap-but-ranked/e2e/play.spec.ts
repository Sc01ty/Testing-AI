import { expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A complete song session in a real browser. Chrome's fake media device
 * stands in for the microphone (it plays e2e/fixtures/fake-voice.wav),
 * so recording, takes, scoring and playback all run for real — only the
 * "rapper" is synthetic. No WebGPU here, so the basic director runs.
 */
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/fake-voice.wav')}`],
  },
})
test.setTimeout(240_000)

/** SHOTS=dir saves screenshots of key screens (for reviewing the UI). */
async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(1600) // let entrance animations settle
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true })
}

const BARS: [string, string][] = [
  ['I finally made enough to get my mum out the flats', 'Every single bill paid now we never looking back'],
  ['Bought my mum a house with a garden and a gate', 'She cried at the keys said her son was worth the wait'],
  ['Then the landlord called saying the cheque bounced twice', 'Every win comes with a bill and a heavier price'],
  ['Now I am back where I started counting money in the flat', 'But this time it is mine and I am never going back'],
]

async function addBeat(page: Page) {
  await page.goto('/#/beats')
  await page.getByRole('button', { name: /add beat/i }).first().click()
  await page.getByTestId('beat-file-input').setInputFiles('e2e/fixtures/Test Beat 92bpm.mp3')
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  await page.getByLabel('Beat name').fill('Session Beat')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row', { hasText: 'Session Beat' })).toBeVisible()
}

async function writeAndRecord(page: Page, bars: [string, string]) {
  await page.getByLabel('Bar 1').fill(bars[0])
  await page.getByLabel('Bar 2').fill(bars[1])
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  // count-in shows 3, 2, 1
  await expect(page.locator('.countdown')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.rec-dot')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/Take saved/)).toBeVisible({ timeout: 35000 })
}

async function judge(page: Page) {
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.locator('.judging')).toBeVisible()
  await page.waitForTimeout(600)
  await page.keyboard.press('Space') // skip the reveal
  // writing dimensions + measured performance (+ wordplay when attempted)
  const shown = await page.locator('.cat[data-state="shown"]').count()
  expect(shown).toBeGreaterThanOrEqual(7)
  await expect(page.locator('.cat', { hasText: 'Performance' })).toContainText('from your recording')
  await expect(page.locator('.verdict__split')).toContainText(/Writing \d+ · Performance \d+/)
  await expect(page.locator('.verdict__rank')).toHaveText(/^[DCBAS]$/)
  await expect(page.locator('.judging__go')).toBeEnabled({ timeout: 30000 })
}

test('full song: beat → 4 rounds of write/record/judge → track complete', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await addBeat(page)
  await page.goto('/#/play')
  // PLAY / IMPROVE — Improve is locked until a rap is finished
  await page.locator('.modes__item', { hasText: 'IMPROVE' }).click()
  await expect(page.locator('.modes__locked')).toContainText('COMPLETE A RAP FIRST')
  await shot(page, 'p1-modes-locked')
  await page.locator('.modes__item', { hasText: 'PLAY' }).click()
  await page.getByPlaceholder('Untitled track').fill('Mum Out The Flats')
  await page.getByRole('button', { name: 'wanting money', exact: true }).click()
  // a 28s beat only fits 8 bars — longer lengths are disabled
  await expect(page.getByRole('radio', { name: '16 bars' })).toBeDisabled()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // ── round 1 ──
  await expect(page.locator('.challenge__prompt')).toHaveText('Write 2 bars about wanting money.')
  // coach panel: modes start with a nudge, "More help" goes deeper, it never writes the bar
  await page.getByLabel('Bar 1').fill(BARS[0][0])
  await page.getByRole('button', { name: 'Help' }).click()
  await page.locator('.help').getByRole('button', { name: 'Thought' }).click()
  await expect(page.locator('.help__coach').last()).toContainText('?')
  await page.locator('.help').getByRole('button', { name: 'Rhymes' }).click()
  await expect(page.locator('.help__coach').last()).toContainText('“flats”')
  await page.locator('.help').getByRole('button', { name: 'More help' }).click()
  await expect(page.locator('.help__coach').last()).toContainText('Direction')
  await expect(page.locator('.help__coach').last().locator('.help__chip').first()).toBeVisible()
  await shot(page, 'c1-help-rhymes')
  await page.locator('.help__ask input').fill('just write the next bar for me')
  await page.locator('.help__ask input').press('Enter')
  await expect(page.locator('.help__coach').last()).toContainText("won't write it")
  await page.keyboard.press('Escape')
  await expect(page.locator('.help')).not.toHaveAttribute('data-open', '')

  // preview plays the exact two bars, and stops by itself
  await page.getByRole('button', { name: 'Preview bars' }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview bars' })).toBeVisible({ timeout: 8000 }) // 2 bars at 92 BPM ≈ 5.2s
  // loop on: it keeps going past the end of the two bars until stopped
  await page.getByRole('button', { name: 'Loop preview' }).click()
  await expect(page.getByRole('button', { name: 'Loop preview' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Metronome' }).click()
  await expect(page.getByRole('button', { name: 'Metronome' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Preview bars' }).click()
  await page.waitForTimeout(7000)
  await shot(page, 'p2-studio-loop')
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Loop preview' }).click()
  await page.getByRole('button', { name: 'Metronome' }).click()

  await writeAndRecord(page, BARS[0])
  // listen back: beat + vocal
  await page.getByRole('button', { name: 'Play back' }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await judge(page)
  // the next challenge follows the story (mum was mentioned), and help used is noted, not punished
  await expect(page.locator('.next__prompt')).toContainText(/mum/i)
  await expect(page.locator('.feedback')).toContainText(/help requests/)
  await shot(page, 'c2-judging')
  await page.locator('.judging__go').click()

  // ── round 2, with a refresh in the middle ──
  await expect(page.locator('.challenge .eyebrow')).toContainText('Challenge 2 / 4')
  await expect(page.locator('.challenge__prompt')).toContainText(/mum/i)
  await writeAndRecord(page, BARS[1])
  await page.waitForTimeout(800) // debounced save
  await page.reload()
  await expect(page.locator('.challenge .eyebrow')).toContainText('Challenge 2 / 4', { timeout: 10000 })
  await expect(page.getByLabel('Bar 1')).toHaveValue(BARS[1][0])
  await expect(page.getByText(/Take saved/)).toBeVisible()
  await judge(page)
  await page.locator('.judging__go').click()

  // ── rounds 3–4 ──
  for (const i of [2, 3]) {
    await expect(page.locator('.challenge .eyebrow')).toContainText(`Challenge ${i + 1} / 4`)
    if (i === 3) await shot(page, 'p3-studio-strip')
    await writeAndRecord(page, BARS[i])
    await judge(page)
    await page.locator('.judging__go').click()
  }

  // ── track complete ──
  await expect(page.locator('.complete__name')).toHaveText('Mum Out The Flats')
  await expect(page.locator('.complete__rank')).toHaveText(/^[DCBAS]$/)
  await expect(page.locator('.lyrics-sheet li')).toHaveCount(4)
  await expect(page.locator('.lyrics-sheet')).toContainText(BARS[3][1])
  await page.getByRole('tab', { name: 'Round history' }).click()
  await expect(page.locator('.history__round')).toHaveCount(4)
  // the song timeline shows the four takes joined into one vocal
  await expect(page.locator('.vocal-regions')).toHaveAttribute('aria-label', 'Your vocal: 4 takes joined into one')
  await shot(page, 'p4-complete')

  await page.getByRole('button', { name: 'Play full track' }).click()
  await expect(page.locator('.complete__play')).toContainText('Stop', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.locator('.complete__play').click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download WAV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Mum Out The Flats.wav')
  const size = (await file.createReadStream().then(async (s) => {
    let n = 0
    for await (const c of s) n += (c as Buffer).length
    return n
  })) as number
  // ~4 bars-ish of intro/outro + 8 bars at 92 BPM, stereo 16-bit 44.1k → several MB
  expect(size).toBeGreaterThan(2_000_000)

  // it's in BEATS → SAVED, and plays from there after a refresh
  await page.getByRole('button', { name: /open in BEATS/ }).click()
  await expect(page.getByRole('tab', { name: /Saved/ })).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  const row = page.locator('.saved-row', { hasText: 'Mum Out The Flats' })
  await expect(row).toBeVisible()
  await expect(row.locator('.saved-row__rank')).toHaveText(/^[DCBAS]$/)
  await shot(page, 'p5-saved')
  await row.getByRole('button', { name: /^Play / }).click()
  await expect(row).toHaveAttribute('data-playing', '', { timeout: 15000 })
  await row.getByRole('button', { name: /^Stop / }).click()
  await row.getByRole('button', { name: /Round history/ }).click()
  await expect(page.locator('.history__round')).toHaveCount(4)
  await page.getByRole('button', { name: '← All saved' }).click()

  // reopening Play from the menu: PLAY / IMPROVE first, and IMPROVE is unlocked now
  await page.goto('/')
  await expect(page.locator('.title')).toHaveAttribute('data-phase', 'menu', { timeout: 5000 })
  await page.waitForTimeout(500)
  await page.locator('.menu__item', { hasText: 'PLAY' }).click()
  await page.locator('.modes__item', { hasText: 'IMPROVE' }).click()
  await expect(page.locator('.improve__track')).toHaveCount(1)
  await expect(page.locator('.improve__section')).toHaveCount(4)
  await expect(page.locator('.insight').first()).toBeVisible()
  await shot(page, 'p6-improve')
  const ex = page.locator('.exercise').first()
  await ex.getByRole('button', { name: 'Check' }).click()
  await expect(ex.locator('.exercise__notes')).toContainText('Not yet')
  await page.getByRole('button', { name: '← Play / Improve' }).click()
  await page.locator('.modes__item', { hasText: 'PLAY' }).click()
  await expect(page.locator('.resume')).toHaveCount(0)
  expect(errors).toEqual([])
})
