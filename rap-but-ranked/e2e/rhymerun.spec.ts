import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * Rhyme Run: the ball must follow the beat's real tempo (several BPMs),
 * survive pause / resume, and land on the word on beat 4.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/speech-voice.wav')}`],
  },
})
test.setTimeout(180_000)

/** Watch the ball for `ms`: when each beat starts (page clock) and the beat clock the ball was drawn from. */
async function watch(page: Page, ms: number) {
  return page.evaluate(async (ms) => {
    const el = document.querySelector('.rr') as HTMLElement
    const changes: { at: number; bar: number; beat: number; t: number }[] = []
    const samples: { at: number; t: number }[] = []
    let key = ''
    const end = performance.now() + ms
    await new Promise<void>((done) => {
      const f = () => {
        const d = el.dataset
        if (d.running === 'true' && d.t) {
          const at = performance.now()
          samples.push({ at, t: Number(d.t) })
          const k = `${d.bar}:${d.beat}`
          if (k !== key) {
            key = k
            changes.push({ at, bar: Number(d.bar), beat: Number(d.beat), t: Number(d.t) })
          }
        }
        if (performance.now() < end) requestAnimationFrame(f)
        else done()
      }
      requestAnimationFrame(f)
    })
    return { changes, samples }
  }, ms)
}

function checkTempo(w: Awaited<ReturnType<typeof watch>>, bpm: number) {
  const spb = 60 / bpm
  const c = w.changes.slice(1) // the first change is mid-beat
  expect(c.length).toBeGreaterThan(4)
  // beats advance one at a time, wrapping 1→2→3→4→next bar
  for (let i = 1; i < c.length; i++) {
    const prev = c[i - 1].bar * 4 + c[i - 1].beat
    expect(c[i].bar * 4 + c[i].beat).toBe(prev + 1)
  }
  // the clock behind the ball says the same: beat k starts at k × 60/BPM
  for (const x of c) expect(Math.abs(x.t - (x.bar * 4 + x.beat) * spb)).toBeLessThan(0.05)
  // and in wall-clock time beats are 60/BPM apart (a beat change is only seen on the next frame, so allow frame jitter)
  const mean = (c.at(-1)!.at - c[0].at) / 1000 / (c.length - 1)
  expect(Math.abs(mean - spb)).toBeLessThan(0.05)
  // the beat clock runs at real time
  const s = w.samples
  const rate = (s.at(-1)!.t - s[0].t) / ((s.at(-1)!.at - s[0].at) / 1000)
  expect(Math.abs(rate - 1)).toBeLessThan(0.03)
}

for (const [id, bpm] of [
  ['included:fast-hard-trap', 120.02],
  ['included:deep-boom-bap', 89.98],
  ['included:aggressive-bass-trap', 73],
] as const) {
  test(`practice ball follows ${Math.round(bpm)} BPM`, async ({ page }) => {
    await page.goto('/#/freestyle')
    await expect(page.getByRole('radio', { name: 'Rhyme Run', exact: true })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('combobox', { name: 'Beat' }).selectOption(id)
    await page.getByRole('button', { name: 'Try the ball' }).click()
    await expect(page.locator('.rr')).toHaveAttribute('data-running', 'true', { timeout: 15000 })
    checkTempo(await watch(page, 4500), bpm)
  })
}

test('pause / resume keeps the ball on the beat', async ({ page }) => {
  await page.goto('/#/freestyle')
  await page.getByRole('combobox', { name: 'Beat' }).selectOption('included:deep-boom-bap')
  await page.getByRole('button', { name: 'Try the ball' }).click()
  await expect(page.locator('.rr')).toHaveAttribute('data-running', 'true', { timeout: 15000 })
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Pause' }).click()
  const pausedAt = Number(await page.locator('.rr').getAttribute('data-t'))
  await expect(page.locator('.rr')).toHaveAttribute('data-running', 'false')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.locator('.rr')).toHaveAttribute('data-running', 'true', { timeout: 10000 })
  const w = await watch(page, 3500)
  // carried on from where it stopped, not from the start and not from where it would have been
  expect(w.samples[0].t).toBeGreaterThan(pausedAt - 0.1)
  expect(w.samples[0].t).toBeLessThan(pausedAt + 0.6)
  checkTempo(w, 89.98)
  // restart goes back to bar 1
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect.poll(async () => Number(await page.locator('.rr').getAttribute('data-bar'))).toBe(0)
})

test('rhyme run: ball lands the word on beat 4, results show every target', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/#/freestyle')
  await page.getByRole('combobox', { name: 'Beat' }).selectOption('included:fast-hard-trap')
  await page.getByRole('radio', { name: /^Medium/ }).click()
  await page.getByRole('radio', { name: '30 sec' }).click()
  const t = page.getByRole('switch', { name: 'Transcribe my freestyle' })
  if ((await t.getAttribute('aria-checked')) === 'true') await t.click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.fs-live .rr')).toHaveAttribute('data-running', 'true', { timeout: 15000 })
  // the count-in row comes first
  await expect(page.getByTestId('rr-now')).toHaveAttribute('data-kind', /count|target/)
  // on beat 4 the ball sits on the word
  const landing = await page.evaluate(
    () =>
      new Promise<{ dx: number; dy: number; word: string; beat: string }>((done) => {
        const f = () => {
          const el = document.querySelector('.fs-live .rr') as HTMLElement
          if (el.dataset.land === 'word' && Number(el.dataset.bar) >= 0) {
            const ball = el.querySelector('.rr__ball')!.getBoundingClientRect()
            const word = el.querySelector('.rr__row[data-state="now"] .rr__cell--word') as HTMLElement
            const w = word.querySelector('.rr__txt')!.getBoundingClientRect()
            return done({ dx: Math.abs(ball.left + ball.width / 2 - (w.left + w.width / 2)), dy: Math.abs(ball.bottom - (w.top + w.height * 0.14)), word: word.textContent ?? '', beat: el.dataset.beat ?? '' })
          }
          requestAnimationFrame(f)
        }
        requestAnimationFrame(f)
      }),
  )
  expect(landing.beat).toBe('3')
  expect(landing.dy).toBeLessThan(24) // sitting on the word's row, not floating above it
  expect(landing.word).toMatch(/^[A-Z']+$/)
  expect(landing.dx).toBeLessThan(24) // on the word itself (the ball is still settling out of its arc)
  checkTempo(await watch(page, 3000), 120.02)
  // medium: the next row is readable, the one after isn't
  const next = page.locator('.fs-live .rr__row[data-state="next"]')
  await expect(next.first().locator('.rr__cell--word')).not.toHaveText('???')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.judging')).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await expect(page.locator('.cat', { hasText: 'Lines built' })).toBeVisible()
  await page.getByRole('button', { name: 'See the breakdown' }).click()
  await expect(page.locator('.rr-results .fs-chip').first()).toContainText('Not checked')
  await page.getByRole('button', { name: 'Retry same settings' }).click()
  await expect(page.locator('.fs-live .rr')).toBeVisible()
  expect(errors).toEqual([])
})

test('mobile: the ball stays on the current row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/freestyle')
  await page.getByRole('combobox', { name: 'Beat' }).selectOption('included:deep-boom-bap')
  const t = page.getByRole('switch', { name: 'Transcribe my freestyle' })
  if ((await t.getAttribute('aria-checked')) === 'true') await t.click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.fs-live .rr')).toHaveAttribute('data-running', 'true', { timeout: 15000 })
  // sample touch-down frames once bar 1 has started: on each touch-down the ball is on the row the clock says it's on
  const worst = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        let n = 0
        let worst = 0
        const f = () => {
          const el = document.querySelector('.fs-live .rr') as HTMLElement
          // touch-down frames only (the ball is on the row, not in the air)
          if (Number(el.dataset.bar) >= 0 && Number(el.dataset.phase) < 0.04) {
            const ball = el.querySelector('.rr__ball')!.getBoundingClientRect()
            // the row the beat clock is on (it may still be sliding into place)
            const row = el.querySelector(`.rr__row[data-bar="${el.dataset.bar}"] .rr__cell:nth-child(${Number(el.dataset.beat) + 1}) .rr__txt`)!.getBoundingClientRect()
            worst = Math.max(worst, Math.abs(ball.bottom - (row.top + row.height * 0.14)))
            n++
          }
          if (n < 12) requestAnimationFrame(f)
          else done(worst)
        }
        requestAnimationFrame(f)
      }),
  )
  expect(worst).toBeLessThan(30)
  await page.keyboard.press('Escape')
})
