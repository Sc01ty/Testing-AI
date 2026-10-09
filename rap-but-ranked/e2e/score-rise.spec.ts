import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * The scoring rise: as each score is revealed, the next note up plays,
 * ending on C6 with the round score. We tag every decoded buffer with the
 * file it came from and log each note the moment it's started.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/tone-voice.wav')}`],
  },
})
test.setTimeout(120_000)

test('score reveals climb C5 → C6, each note landing with its number', async ({ page }) => {
  await page.addInitScript(() => {
    const urlOf = new WeakMap<ArrayBuffer, string>()
    const bufUrl = new WeakMap<AudioBuffer, string>()
    const w = window as unknown as { __notes: { file: string; rate: number; stage: string; shown: number; lead: number }[] }
    w.__notes = []
    const realFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await realFetch(...args)
      const url = String(args[0])
      if (!url.includes('score-notes')) return res
      const ab = await res.clone().arrayBuffer()
      const out = new Response(ab, res)
      const realAb = out.arrayBuffer.bind(out)
      out.arrayBuffer = async () => {
        const b = await realAb()
        urlOf.set(b, url)
        return b
      }
      return out
    }
    const decode = BaseAudioContext.prototype.decodeAudioData
    BaseAudioContext.prototype.decodeAudioData = function (data: ArrayBuffer, ...rest: unknown[]) {
      const url = urlOf.get(data)
      return (decode as (...a: unknown[]) => Promise<AudioBuffer>).call(this, data, ...rest).then((b: AudioBuffer) => {
        if (url) bufUrl.set(b, url)
        return b
      })
    }
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (when?: number, offset?: number, duration?: number) {
      const url = this.buffer && bufUrl.get(this.buffer)
      if (url) {
        const j = document.querySelector('.judging') as HTMLElement | null
        w.__notes.push({
          file: url.split('/').pop()!,
          rate: this.playbackRate.value,
          stage: j?.dataset.stage ?? '',
          shown: document.querySelectorAll('.cat[data-state="shown"]').length,
          lead: (when ?? 0) - this.context.currentTime,
        })
      }
      return start.call(this, when, offset, duration)
    }
  })
  await page.goto('/#/freestyle')
  await page.getByRole('radio', { name: 'Topic Run', exact: true }).click()
  await page.getByRole('combobox', { name: 'Beat' }).selectOption('included:fast-hard-trap')
  await page.getByRole('radio', { name: '30 sec' }).click()
  const t = page.getByRole('switch', { name: 'Transcribe my freestyle' })
  if ((await t.getAttribute('aria-checked')) === 'true') await t.click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.fs-live')).toHaveAttribute('data-phase', 'live', { timeout: 15000 })
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.judging')).toBeVisible({ timeout: 15000 })
  // let the reveal play out (no skipping)
  await expect(page.locator('.verdict__rank')).toHaveAttribute('data-shown', '', { timeout: 20000 })
  await page.waitForTimeout(300)
  const notes = await page.evaluate(() => (window as unknown as { __notes: unknown[] }).__notes)
  const cats = await page.locator('.cat').count()
  // audio-only freestyle: continuity, timing, flow → three reveals: G#, A#, C6
  expect(cats).toBe(3)
  expect(notes.map((n: any) => n.file)).toEqual(['gs5.mp3', 'as5.mp3', 'c6.mp3'])
  // each note starts as its score appears: 1st and 2nd category, then the last one with the round score
  expect(notes.map((n: any) => n.shown)).toEqual([1, 2, 3])
  expect(notes.map((n: any) => n.stage)).toEqual(['2', '3', '4'])
  for (const n of notes as any[]) {
    expect(n.rate).toBe(1)
    expect(n.lead).toBeGreaterThanOrEqual(0)
    expect(n.lead).toBeLessThan(0.03) // scheduled for the very next audio tick
  }
})
