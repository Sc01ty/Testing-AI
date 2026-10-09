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
    await host.getByRole('button', { name: 'Start shared track' }).click()
    await expect(guest.getByText('Remote Trade', { exact: true })).toBeVisible()
    const turns = trackBars / (style.startsWith('Standard') ? 4 : 2),
      bars = style.startsWith('Standard') ? 4 : 2
    const lines = ['I bought my mum a house', 'We finally escaped the rain', 'Paid the bills before the dawn', 'Now we never fear the pain']
    for (let t = 0; t < turns; t++) {
      const p = t % 2 === 0 ? host : guest,
        other = t % 2 === 0 ? guest : host,
        name = t % 2 === 0 ? 'Scotty' : 'Alex'
      // the active player gets the studio; the other gets the get-ready screen with a tip
      await expect(p.getByTestId('turn-studio')).toBeVisible({ timeout: 20000 })
      await expect(other.getByTestId('turn-studio')).toHaveCount(0)
      const waiting = other.getByLabel('Waiting for your turn')
      await expect(waiting).toBeVisible()
      await expect(waiting.locator('.waiting__who')).toContainText(`${name} IS`)
      await expect(waiting).toContainText('Small tip')
      if (t < turns - 1) await expect(waiting).toContainText('GET READY FOR YOUR TURN')
      for (let i = 0; i < bars; i++) await p.getByLabel(`Bar ${i + 1}`, { exact: true }).fill(lines[i])
      if (t === 0) {
        // END is locked to the section: dragging it way past stays put
        const end = p.getByRole('slider', { name: 'Section end' })
        const before = await end.getAttribute('aria-valuenow')
        await end.focus()
        await p.keyboard.press('Shift+ArrowRight')
        expect(await end.getAttribute('aria-valuenow')).toBe(before)
        // …but it can trim inward by a beat
        await p.keyboard.press('ArrowLeft')
        expect(Number(await end.getAttribute('aria-valuenow'))).toBeLessThan(Number(before))
      }
      if (t === 1) {
        // relay: the director answers what the last player actually said
        await expect(p.locator('.challenge__prompt')).toContainText(/house|rain|dawn|pain|bills|escaped/i)
        await expect(other.getByLabel('Waiting for your turn')).toHaveCount(1)
      }
      await p.getByRole('button', { name: 'Record', exact: true }).click()
      await expect(waiting.locator('.waiting__who')).toContainText(`${name} IS RAPPING`, { timeout: 15000 })
      await expect(p.getByRole('button', { name: 'Record again' })).toBeVisible({ timeout: 30000 })
      await p.getByRole('button', { name: 'Submit turn' }).click()
      if (t < turns - 1) await expect(other.getByTestId('turn-studio')).toBeVisible({ timeout: 20000 })
      if (t < turns - 1) await expect(other.getByLabel('Last turn result')).toContainText(name)
    }
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
    expect(new Set(hs.turns.map((t: any) => t.take.id)).size).toBe(turns)
    // the trimmed END from turn 1 was kept
    expect(hs.turns[0].section.end).toBeLessThan(hs.turns[0].end)
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
      await host.getByRole('button', { name: 'Redo my section 1', exact: true }).click()
      await expect(host.getByTestId('turn-studio')).toBeVisible()
      await host.getByRole('button', { name: 'Record', exact: true }).click()
      await expect(host.getByRole('button', { name: 'Record again' })).toBeVisible({ timeout: 30000 })
      await host.getByRole('button', { name: 'Submit turn' }).click()
      await expect
        .poll(async () => (await getSession(guest)).turns[0].take.id, { timeout: 30000 })
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

test('parallel: both write and record at once, sections slot into place', async ({ browser, baseURL }) => {
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
  const code = await host.getByTestId('room-code').innerText()
  await guest.getByPlaceholder('Your name').fill('Alex')
  await guest.getByPlaceholder('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join lobby', exact: true }).click()
  await expect(host.getByText(/Alex · connected/)).toBeVisible()
  await host.getByPlaceholder('Our track').fill('Both At Once')
  await host.getByPlaceholder('What are you both rapping about?').fill('success')
  await host.getByRole('combobox', { name: 'Beat', exact: true }).selectOption('included:fast-hard-trap')
  await host.getByRole('radio', { name: /^Parallel/ }).click()
  await host.getByRole('radio', { name: '16 bars', exact: true }).click()
  await host.getByRole('radio', { name: 'Standard · 4 bars each', exact: true }).click()
  await host.getByRole('button', { name: 'Start shared track' }).click()

  const HOST = ['Started at the bottom of the stairs', 'Counting every coin I could find', 'Mum kept the lights on for me', 'Now I am climbing all the time']
  const GUEST = ['Penthouse window with a city view', 'Champagne fizzing in a crystal glass', 'Every promise that I made came true', 'Diamonds dancing as the hours pass']
  const write = async (p: typeof host, lines: string[]) => {
    for (let i = 0; i < 4; i++) await p.getByLabel(`Bar ${i + 1}`, { exact: true }).fill(lines[i])
  }
  // both studios open at once, on different bars, with paired directions
  for (const p of [host, guest]) await expect(p.getByTestId('turn-studio')).toBeVisible({ timeout: 20000 })
  await expect(host.getByTestId('pboard-me')).toContainText('BARS 1–4')
  await expect(guest.getByTestId('pboard-me')).toContainText('BARS 5–8')
  await expect(host.locator('.challenge__prompt')).toContainText(/scene|right now/i)
  await expect(guest.locator('.challenge__prompt')).toContainText(/works out|jump ahead/i)
  await Promise.all([write(host, HOST), write(guest, GUEST)])

  // record at the same time — each sees the other recording
  await Promise.all([host, guest].map((p) => p.getByRole('button', { name: 'Record', exact: true }).click()))
  await expect(host.getByTestId('pboard-mate')).toContainText('RECORDING', { timeout: 15000 })
  await expect(guest.getByTestId('pboard-mate')).toContainText('RECORDING', { timeout: 15000 })
  for (const p of [host, guest]) await expect(p.getByRole('button', { name: 'Record again' })).toBeVisible({ timeout: 30000 })

  // guest uploads first and carries on to bars 13–16 without waiting
  await guest.getByRole('button', { name: 'Submit turn' }).click()
  await expect(guest.getByTestId('pboard-me')).toContainText('BARS 13–16', { timeout: 20000 })
  await expect(guest.getByTestId('turn-studio')).toBeVisible({ timeout: 20000 })
  await expect(host.getByTestId('pboard-mate')).toContainText('BARS 13–16')
  // no spoilers: the host can't read the guest's bars
  await expect(host.getByText('Penthouse window')).toHaveCount(0)
  // a refresh mid-track keeps the guest on their own section
  await guest.reload()
  await expect(guest.getByTestId('pboard-me')).toContainText('BARS 13–16', { timeout: 20000 })
  await expect(guest.getByTestId('turn-studio')).toBeVisible()

  await host.getByRole('button', { name: 'Submit turn' }).click()
  await expect(host.getByTestId('pboard-me')).toContainText('BARS 9–12', { timeout: 20000 })
  await Promise.all([write(host, HOST), write(guest, GUEST)])
  await Promise.all([host, guest].map((p) => p.getByRole('button', { name: 'Record', exact: true }).click()))
  for (const p of [host, guest]) await expect(p.getByRole('button', { name: 'Record again' })).toBeVisible({ timeout: 30000 })
  await guest.getByRole('button', { name: 'Submit turn' }).click()
  // finishing early: locked, waiting — not reset
  await expect(guest.getByLabel('Your sections are locked')).toContainText('WAITING FOR Scotty', { timeout: 20000 })
  await host.getByRole('button', { name: 'Submit turn' }).click()

  for (const p of [host, guest]) await expect(p.getByText('COMBINED TRACK SCORE')).toBeVisible({ timeout: 50000 })
  const read = (p: typeof host) =>
    p.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((ok) => {
        const r = indexedDB.open('rap-but-ranked')
        r.onsuccess = () => ok(r.result)
      })
      return await new Promise<any[]>((ok) => {
        const r = db.transaction('multiplayer').objectStore('multiplayer').getAll()
        r.onsuccess = () => (db.close(), ok(r.result))
      })
    })
  const [hs] = (await read(host)).filter((x) => x.trackName === 'Both At Once')
  const [gs] = (await read(guest)).filter((x) => x.trackName === 'Both At Once')
  expect(hs.game).toBe('parallel')
  expect(hs.turns.map((t: any) => t.player)).toEqual([0, 1, 0, 1])
  expect(hs.turns.map((t: any) => t.take.id)).toEqual(gs.turns.map((t: any) => t.take.id))
  for (const t of hs.turns) {
    // every take sits in its own bars, whatever order it was uploaded in
    expect(t.section.start).toBeGreaterThanOrEqual(t.start - 1e-6)
    expect(t.section.end).toBeLessThanOrEqual(t.end + 1e-6)
    expect(Math.abs(t.take.beatTimeSec - t.start)).toBeLessThan(1)
  }
  expect(hs.turns[1].lyrics[0]).toBe(GUEST[0])
  const download = host.waitForEvent('download')
  await host.getByRole('button', { name: 'Download WAV', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('Both At Once.wav')
  expect(errors).toEqual([])
  await a.close()
  await b.close()
})
