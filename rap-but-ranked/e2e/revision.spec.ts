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
const app = process.env.RBR_LIVE_URL ?? '/'
for (const [style, boundary] of [
  ['Standard · 4 bars each', 'Clean'],
  ['Quick Trade · 2 bars each', 'Clean'],
  ['Standard · 4 bars each', 'Overlap · 1 beat early'],
] as const) {
  test(`room across isolated clients: ${style}, ${boundary}`, async ({ browser, baseURL }) => {
    const a = await browser.newContext({ baseURL }),
      b = await browser.newContext({ baseURL }),
      host = await a.newPage(),
      guest = await b.newPage(),
      errors: string[] = []
    for (const p of [host, guest]) {
      p.on('pageerror', (e) => errors.push(e.message))
      await p.goto(`${app}#/play`)
      await p.locator('.modes__item', { hasText: 'MULTIPLAYER' }).click()
    }
    await host.getByPlaceholder('Your name').fill('Scotty')
    await host.getByRole('button', { name: 'Create lobby', exact: true }).click()
    await expect(host.getByTestId('room-code')).toBeVisible()
    const code = await host.getByTestId('room-code').innerText()
    await guest.getByPlaceholder('Your name').fill('Alex')
    await guest.getByPlaceholder('Room code').fill('AAAAAAA')
    await guest.getByRole('button', { name: 'Join lobby', exact: true }).click()
    await expect(guest.getByRole('alert')).toContainText('not found')
    await guest.getByPlaceholder('Room code').fill(code)
    await guest.getByRole('button', { name: 'Join lobby', exact: true }).click()
    await expect(guest.getByTestId('room-code')).toHaveText(code)
    await expect(host.getByText(/Alex · connected/)).toBeVisible()
    await host.getByPlaceholder('Our track').fill('Remote Trade')
    await host.getByPlaceholder('What are you both rapping about?').fill('money')
    await host
      .getByRole('combobox', { name: 'Beat', exact: true })
      .selectOption('included:fast-hard-trap')
    await expect(host.getByRole('option')).toHaveCount(9)
    await expect(host.getByRole('combobox')).not.toContainText(/bank fees/i)
    const trackBars =
      process.env.RBR_LIVE_URL && style.startsWith('Standard') && boundary === 'Clean' ? 16 : 8
    await host.getByRole('radio', { name: `${trackBars} bars`, exact: true }).click()
    await host.getByRole('radio', { name: style, exact: true }).click()
    await host.getByRole('radio', { name: boundary, exact: true }).click()
    await host.getByRole('button', { name: 'Prepare shared track' }).click()
    await expect(guest.getByText('Remote Trade', { exact: true })).toBeVisible()
    for (const p of [host, guest])
      await p.getByRole('button', { name: 'Enable voice', exact: true }).click()
    await expect(host.getByText('VOICE · connected', { exact: true })).toBeVisible({
      timeout: 30000,
    })
    await expect(guest.getByText('VOICE · connected', { exact: true })).toBeVisible({
      timeout: 30000,
    })
    const turns = trackBars / (style.startsWith('Standard') ? 4 : 2),
      bars = style.startsWith('Standard') ? 4 : 2
    for (let t = 0; t < turns; t++) {
      const p = t % 2 === 0 ? host : guest,
        other = t % 2 === 0 ? guest : host
      await expect(other.getByRole('button', { name: 'Lock my section' })).toHaveCount(0)
      for (let i = 0; i < bars; i++)
        await p
          .getByLabel(`Bar ${i + 1}`, { exact: true })
          .fill(
            [
              'I bought my mum a house',
              'We finally escaped the rain',
              'Paid the bills before the dawn',
              'Now we never fear the pain',
            ][i],
          )
      await p.getByRole('button', { name: 'Lock my section', exact: true }).click()
    }
    for (const p of [host, guest])
      await p.getByRole('button', { name: 'Ready to perform', exact: true }).click()
    await expect(host.getByRole('button', { name: 'Start shared performance' })).toBeEnabled()
    await host.getByRole('button', { name: 'Start shared performance' }).click()
    for (const p of [host, guest]) await expect(p.getByLabel('Performance mode')).toBeVisible()
    for (const p of [host, guest])
      await expect(p.locator('.duo-live h2')).toContainText('Scotty', { timeout: 15000 })
    const positions = await Promise.all(
      [host, guest].map((p) => p.getByLabel('Performance mode').getAttribute('data-time')),
    )
    expect(Math.abs(Number(positions[0]) - Number(positions[1]))).toBeLessThan(0.2)
    for (const p of [host, guest])
      await expect(p.locator('.duo-live h2')).toContainText('Alex', { timeout: 20000 })
    for (const p of [host, guest])
      await expect(p.getByText('COMBINED TRACK SCORE')).toBeVisible({ timeout: 50000 })
    const getSession = async (p: typeof host) =>
      p.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((ok, no) => {
          const r = indexedDB.open('rap-but-ranked')
          r.onsuccess = () => ok(r.result)
          r.onerror = () => no(r.error)
        })
        return await new Promise<any>((ok) => {
          const r = db.transaction('multiplayer').objectStore('multiplayer').getAll()
          r.onsuccess = () => {
            db.close()
            ok(r.result[0])
          }
        })
      })
    const hs = await getSession(host),
      gs = await getSession(guest)
    expect(hs.id).toBe(gs.id)
    expect(hs.turns.map((t: any) => t.take.id)).toEqual(gs.turns.map((t: any) => t.take.id))
    expect(new Set(hs.turns.map((t: any) => t.take.id)).size).toBe(2)
    const download = host.waitForEvent('download')
    await host.getByRole('button', { name: 'Download WAV', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('Remote Trade.wav')
    await file.saveAs(
      resolve(
        'test-results',
        `remote-${style.startsWith('Standard') ? 'standard' : 'quick'}-${boundary === 'Clean' ? 'clean' : 'overlap'}.wav`,
      ),
    )
    if (style.startsWith('Standard') && boundary === 'Clean') {
      const original = hs.turns[1].take.id
      await host.getByRole('button', { name: 'Retake my slot 1', exact: true }).click()
      await expect(host.getByRole('button', { name: 'Retake my slot 1', exact: true })).toBeEnabled(
        { timeout: 30000 },
      )
      await expect
        .poll(async () => (await getSession(guest)).turns[0].take.id)
        .not.toBe(hs.turns[0].take.id)
      expect((await getSession(guest)).turns[1].take.id).toBe(original)
    }
    await guest.reload()
    await expect(guest.getByText('COMBINED TRACK SCORE')).toBeVisible({ timeout: 20000 })
    await guest.goto(`${app}#/beats`)
    await guest.getByRole('tab', { name: /Saved/i }).click()
    await guest.locator('.saved-row__main', { hasText: 'Remote Trade' }).click()
    await expect(guest.getByText('COMBINED TRACK SCORE')).toBeVisible()
    expect(errors).toEqual([])
    await a.close()
    await b.close()
  })
}
