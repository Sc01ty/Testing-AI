import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const endpoint = process.env.RBR_API_URL ?? 'http://localhost:4180/api/rooms.php'
async function call(action, access = {}, values = {}, origin) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ action, ...access, ...values }),
  })
  return { status: r.status, ...(await r.json()) }
}
test('lobby access, authority, immutable turns, signalling and closure', async (t) => {
  const host = await call('create', {}, { name: 'Host' })
  assert.equal(host.status, 200)
  assert.match(host.code, /^[A-Z2-9]{7}$/)
  const h = { code: host.code, token: host.token }
  const guest = await call('join', { code: host.code }, { name: 'Guest' })
  assert.equal(guest.status, 200)
  const g = { code: host.code, token: guest.token }
  assert.notEqual(h.token, g.token)
  await t.test('does not reveal tokens in room state', async () => {
    const state = await call('poll', h)
    assert.equal(state.token, null)
    assert.equal(
      state.members.some((m) => m?.auth || m?.token),
      false,
    )
  })
  await t.test('rejects full, malformed, unauthorised and foreign-origin requests', async () => {
    assert.equal((await call('join', { code: host.code }, { name: 'Third' })).status, 409)
    assert.equal((await call('poll', { code: '../file', token: h.token })).status, 400)
    assert.equal((await call('poll', { code: h.code, token: g.token + 'wrong' })).status, 400)
    assert.equal((await call('poll', h, {}, 'https://evil.example')).status, 403)
    assert.equal(
      (await call('audio', { code: h.code, token: '0'.repeat(64) }, { id: '../file' })).status,
      403,
    )
  })
  const beat = JSON.parse(readFileSync('public/beats/catalogue.json', 'utf8')).find(
      (b) => b.id === 'included:fast-hard-trap',
    ),
    count = 4,
    spbar = 240 / beat.bpm
  const session = {
    id: 'client-id',
    version: 1,
    kind: 'multiplayer',
    trackName: 'Test',
    topic: 'money',
    beatId: beat.id,
    beatName: beat.name,
    beatGrid: {
      bpm: beat.bpm,
      introOffset: beat.introOffset,
      beatsPerBar: 4,
      durationSec: beat.durationSec,
    },
    length: 8,
    style: 'standard',
    turns: Array.from({ length: 2 }, (_, i) => ({
      index: i,
      player: i % 2,
      barStart: i * count,
      barEnd: (i + 1) * count,
      start: beat.introOffset + i * count * spbar,
      end: beat.introOffset + (i + 1) * count * spbar,
      vocalOffset: 0,
      boundary: 'clean',
      lyrics: Array(4).fill(''),
      challenge: {
        prompt: 'Write your own bars',
        focus: ['money'],
        storyBeat: 'opening',
        source: 'basic',
      },
      ready: false,
      take: null,
      result: null,
    })),
    storyDirection: 'money',
    status: 'preparing',
    master: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await t.test('only host can configure or start', async () => {
    assert.equal((await call('configure', g, { session })).status, 403)
    assert.equal((await call('configure', h, { session })).status, 200)
    assert.equal((await call('start', g)).status, 403)
    assert.equal((await call('start', h)).status, 409)
  })
  const lyrics = ['I paid the rent', 'I bought a house', 'Now mum can rest', 'I did my best']
  await t.test('only current player may lock their section', async () => {
    assert.equal((await call('lock', g, { index: 0, lyrics })).status, 409)
    assert.equal((await call('lock', h, { index: 0, lyrics })).status, 200)
    assert.equal((await call('lock', h, { index: 1, lyrics })).status, 409)
    assert.equal((await call('lock', g, { index: 1, lyrics })).status, 200)
  })
  await t.test('start needs two ready players and publishes a future start', async () => {
    assert.equal((await call('ready', h)).status, 200)
    assert.equal((await call('start', h)).status, 409)
    await call('ready', g)
    const started = await call('start', h)
    assert.equal(started.status, 200)
    assert.ok(started.startAt - started.now >= 5500)
    assert.deepEqual(
      started.session.turns.map((t) => [t.start, t.end]),
      session.turns.map((t) => [t.start, t.end]),
    )
    assert.equal((await call('lock', g, { index: 1, lyrics })).status, 409)
  })
  await t.test('signals delivered only to the other authenticated participant', async () => {
    await call('signal', h, { signal: { type: 'hello', from: 'host' } })
    const state = await call('poll', g)
    assert.deepEqual(state.signals, [{ type: 'hello', from: 'host' }])
    assert.deepEqual((await call('poll', g)).signals, [])
  })
  await t.test('host close prevents subsequent join or reuse', async () => {
    const reset=await call('reset',h)
    assert.equal(reset.startAt,null)
    assert.equal(reset.session.status,'preparing')
    assert.equal(reset.members.every(m=>m&&!m.ready),true)
    assert.equal((await call('leave', h)).status, 200)
    assert.equal((await call('poll', g)).status, 410)
  })
})
