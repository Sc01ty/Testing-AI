import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Does the finished song sound right? Measured, not eyeballed.
 *
 * The fake microphone plays a continuous tone (it never stops "rapping"),
 * so in the finished vocal any gap, doubled overlap or click at a take
 * boundary shows up directly in the samples. The metronome is switched on
 * for preview AND recording, and must not appear in the export.
 */
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
test.use({
  launchOptions: {
    ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/tone-voice.wav')}`],
  },
})
test.setTimeout(240_000)

async function addBeat(page: Page) {
  await page.goto('/#/beats')
  await page.getByRole('button', { name: /add beat/i }).first().click()
  await page.getByTestId('beat-file-input').setInputFiles('e2e/fixtures/Test Beat 92bpm.mp3')
  await expect(page.locator('.beat-editor')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  await page.getByLabel('Beat name').fill('Tone Beat')
  await page.getByRole('button', { name: 'Save beat' }).click()
  await expect(page.locator('.beat-row', { hasText: 'Tone Beat' })).toBeVisible()
}

/** 16-bit PCM WAV → first channel as floats. */
function readWav(buf: Buffer) {
  let p = 12
  let sr = 0
  let ch = 0
  while (p < buf.length) {
    const id = buf.toString('ascii', p, p + 4)
    const size = buf.readUInt32LE(p + 4)
    if (id === 'fmt ') {
      ch = buf.readUInt16LE(p + 10)
      sr = buf.readUInt32LE(p + 12)
    }
    if (id === 'data') {
      const n = size / 2 / ch
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(p + 8 + i * 2 * ch) / 32768
      return { samples: out, sampleRate: sr }
    }
    p += 8 + size
  }
  throw new Error('no data chunk')
}

/** Energy at one frequency (Goertzel), per frame. */
function goertzel(x: Float32Array, start: number, n: number, freq: number, sr: number) {
  const k = 2 * Math.cos((2 * Math.PI * freq) / sr)
  let s1 = 0
  let s2 = 0
  for (let i = start; i < start + n; i++) {
    const s0 = x[i] + k * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / n
}

test('4 takes play back as one continuous vocal: no gaps, no doubling, no clicks, no metronome', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  // log every metronome click scheduled: a triangle oscillator pitched at 1400 / 1900 Hz
  await page.addInitScript(() => {
    const w = window as unknown as { __clicks: number[] }
    w.__clicks = []
    const firstValue = new WeakMap<AudioParam, number>()
    const setV = AudioParam.prototype.setValueAtTime
    AudioParam.prototype.setValueAtTime = function (v: number, t: number) {
      if (!firstValue.has(this)) firstValue.set(this, v)
      return setV.call(this, v, t)
    }
    const orig = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when?: number) {
      const f = firstValue.get(this.frequency)
      if (this.type === 'triangle' && (f === 1400 || f === 1900)) w.__clicks.push(when ?? 0)
      return orig.call(this, when)
    }
  })

  await addBeat(page)
  await page.goto('/#/play')
  await page.locator('.modes__item', { hasText: 'PLAY' }).click()
  await page.getByPlaceholder('Untitled track').fill('Tone Test')
  await page.getByRole('button', { name: 'wanting money', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // metronome on: during a looped preview the clicks sit exactly one beat apart (92 BPM)
  await page.getByRole('button', { name: 'Metronome' }).click()
  await page.getByRole('button', { name: 'Loop preview' }).click()
  await page.getByRole('button', { name: 'Preview bars' }).click()
  await page.waitForTimeout(7500) // > one pass of 2 bars (5.2s): the loop wraps
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Loop preview' }).click()
  const clicks = (await page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks)).sort((a, b) => a - b)
  expect(clicks.length).toBeGreaterThanOrEqual(12)
  const spb = 60 / 92
  const gaps = clicks.slice(1).map((t, i) => t - clicks[i])
  // the detector may land a hair off 92 — allow 0.5%, but every gap must be the same beat length
  for (const g of gaps) expect(Math.abs(g - gaps[0])).toBeLessThan(0.002)
  expect(Math.abs(gaps[0] - spb) / spb).toBeLessThan(0.005)

  // 4 rounds, back to back, metronome still on while recording
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('.challenge .eyebrow')).toContainText(`Challenge ${i + 1} / 4`)
    await page.getByLabel('Bar 1').fill('Money in the morning and my mum got a smile')
    await page.getByLabel('Bar 2').fill('Bills paid early and we living for a while')
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await expect(page.getByText(/Take saved/)).toBeVisible({ timeout: 25000 })
    await page.getByRole('button', { name: 'Submit' }).click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Space')
    await expect(page.locator('.judging__go')).toBeEnabled({ timeout: 30000 })
    await page.locator('.judging__go').click()
  }
  await expect(page.locator('.complete__name')).toHaveText('Tone Test')

  // delete the beat → the saved song keeps its vocals; its export is the vocal alone
  await page.getByRole('button', { name: /open in BEATS/ }).click()
  await page.getByRole('tab', { name: /Beats/ }).click()
  const beatRow = page.locator('.beat-row', { hasText: 'Tone Beat' })
  await beatRow.getByRole('button', { name: /^Delete / }).click()
  await expect(beatRow.locator('.beat-row__confirm')).toContainText('1 saved rap will lose the beat')
  await beatRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('tab', { name: /Saved/ }).click()
  const row = page.locator('.saved-row', { hasText: 'Tone Test' })
  await expect(row).toContainText('(deleted)')
  const dl = page.waitForEvent('download')
  await row.getByRole('button', { name: /^Download / }).click()
  const path = await (await dl).path()
  const { samples: x, sampleRate: sr } = readWav(readFileSync(path))
  if (process.env.SAVE_EXPORT) copyFileSync(path, process.env.SAVE_EXPORT)

  // ── measure ──
  const hop = Math.round(sr * 0.01)
  const frames = Math.floor(x.length / hop)
  const rms = Array.from({ length: frames }, (_, f) => {
    let s = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) s += x[i] * x[i]
    return Math.sqrt(s / hop)
  })
  const sorted = [...rms].sort((a, b) => a - b)
  const median = sorted[Math.floor(frames * 0.6)]
  const voiced = rms.map((v) => v > median * 0.5)
  const first = voiced.indexOf(true)
  const last = voiced.lastIndexOf(true)
  const spanSec = (last - first) * 0.01
  // 8 bars at ~92 BPM ≈ 20.9s of continuous vocal (+ pickup/tail)
  expect(spanSec).toBeGreaterThan(20)

  // no gaps: inside the vocal, never more than 40ms below 40% of the level
  let run = 0
  let longestDip = 0
  for (let f = first + 5; f < last - 5; f++) {
    run = rms[f] < median * 0.4 ? run + 1 : 0
    longestDip = Math.max(longestDip, run)
  }
  expect(longestDip * 10, 'longest dip (ms)').toBeLessThanOrEqual(40)

  // no doubling: never more than 60ms above 1.5× the level (two takes playing at once)
  run = 0
  let longestDouble = 0
  for (let f = first; f <= last; f++) {
    run = rms[f] > median * 1.5 ? run + 1 : 0
    longestDouble = Math.max(longestDouble, run)
  }
  expect(longestDouble * 10, 'longest doubled stretch (ms)').toBeLessThanOrEqual(60)

  // no clicks added by joining the takes: any sample jump far bigger than a clean
  // 220 Hz sine can make must already be in the raw recording at the same moment
  // (headless Chrome's fake mic occasionally skips; that's the capture, not the mix)
  const raw = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('rap-but-ranked')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const get = <T,>(store: string, key?: string) =>
      new Promise<T>((res) => {
        const req = key === undefined ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(key)
        req.onsuccess = () => res(req.result as T)
      })
    type S = { trackName: string; beatGrid: { bpm: number; beatsPerBar: number }; rounds: { take: { id: string; beatTimeSec: number; sectionStartSec: number } }[] }
    const s = (await get<S[]>('sessions')).find((x) => x.trackName === 'Tone Test')!
    const glitches: number[] = []
    for (const r of s.rounds) {
      const row = await get<{ blob: Blob }>('takeAudio', r.take.id)
      const b = new DataView(await row.blob.arrayBuffer())
      const sr = b.getUint32(24, true)
      const n = (b.byteLength - 44) / 2
      let prev = 0
      let peak = 0
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(b.getInt16(44 + i * 2, true) / 32768))
      const lim = peak * 2 * Math.sin((Math.PI * 220) / sr) * 2.5
      for (let i = 0; i < n; i++) {
        const v = b.getInt16(44 + i * 2, true) / 32768
        if (i > 0 && Math.abs(v - prev) > lim) glitches.push(r.take.beatTimeSec + i / sr)
        prev = v
      }
    }
    const bar = (60 / s.beatGrid.bpm) * s.beatGrid.beatsPerBar
    return { glitches, from: Math.max(0, s.rounds[0].take.sectionStartSec - bar) }
  })
  const a0 = median * Math.SQRT2
  const smooth = a0 * 2 * Math.sin((Math.PI * 220) / sr) // biggest step a clean 220 Hz sine takes
  const added: number[] = []
  for (let i = first * hop + 1; i < last * hop; i++) {
    if (Math.abs(x[i] - x[i - 1]) < smooth * 2.5) continue
    // (the export's limiter looks ahead ~6ms, so everything — beat and vocal alike — lands 6ms later)
    const t = raw.from + i / sr - 0.006
    if (!raw.glitches.some((g) => Math.abs(g - t) < 0.006)) added.push(Math.round(t * 1000) / 1000)
  }
  console.log(`raw capture glitches: ${raw.glitches.length}; discontinuities added by the mix: ${added.length}`, JSON.stringify({ added, raw: raw.glitches.map((g) => Math.round(g * 1000) / 1000), from: raw.from }))
  expect(added, 'discontinuities the mix added (beat seconds)').toEqual([])

  // no metronome: nothing at the click pitches, only the 220 Hz voice
  const win = Math.round(sr * 0.05)
  let clickEnergy = 0
  let voiceEnergy = 0
  for (let i = first * hop; i + win < last * hop; i += win) {
    clickEnergy = Math.max(clickEnergy, goertzel(x, i, win, 1400, sr), goertzel(x, i, win, 1900, sr))
    voiceEnergy = Math.max(voiceEnergy, goertzel(x, i, win, 220, sr))
  }
  expect(clickEnergy / voiceEnergy, 'click pitch vs voice').toBeLessThan(0.01)

  expect(errors).toEqual([])
})
