// node --test scripts/social.test.mjs
// Starts its own PHP server on a throwaway data folder, then checks names,
// server-side RP, publishing, the Feed, plays, likes, reports, leaderboards and admin.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 4191
const endpoint = `http://localhost:${port}/api/social.php`
const data = mkdtempSync(join(tmpdir(), 'rbr-social-'))
let server

before(async () => {
  server = spawn('php', ['-S', `localhost:${port}`, '-t', 'public'], {
    env: { ...process.env, RBR_SOCIAL_ROOT: data, RBR_SOCIAL_LIMITS: 'off', RBR_ADMIN_NAMES: 'Boss' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(endpoint)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error('PHP server did not start')
})
after(() => {
  server?.kill()
  rmSync(data, { recursive: true, force: true })
})

const device = (n) => n.toString(16).padStart(32, '0')
async function call(action, values = {}, { auth, dev = 1, origin } = {}) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ action, auth, device: device(dev), ...values }),
  })
  return { status: r.status, ...(await r.json()) }
}
function wav(seconds = 1) {
  const rate = 8000
  const n = rate * seconds
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  return new Blob([b], { type: 'audio/wav' })
}
async function publish(auth, meta, file = wav()) {
  const form = new FormData()
  form.append('payload', JSON.stringify({ action: 'publish', auth, device: device(1), meta }))
  form.append('audio', file, 'track.wav')
  const r = await fetch(endpoint, { method: 'POST', body: form })
  return { status: r.status, ...(await r.json()) }
}
const meta = (over = {}) => ({ sourceId: 'track:abc', kind: 'track', title: 'Bank Fees', caption: 'first one', lyrics: ['yo check it', 'bank fees'], score: 84, grade: 'A', bars: 16, duration: 40, beat: 'dark funk', breakdown: [{ label: 'Rhyme', score: 80 }], rounds: [{ grade: 'A', score: 84 }], ...over })

test('names, RP, publishing, feed, moderation', async (t) => {
  const claimed = await call('claim', { name: 'Tivro', events: [{ id: 'track:old1', kind: 'play', score: 100, bars: 32 }, { id: 'track:old2', kind: 'play', score: 100, bars: 32 }, { id: 'track:old3', kind: 'play', score: 100, bars: 32 }, { id: 'track:old4', kind: 'play', score: 100, bars: 32 }] })
  assert.equal(claimed.status, 200)
  assert.match(claimed.code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
  const tivro = { name: 'Tivro', code: claimed.code }

  await t.test('import is replayed with server maths and capped at Breakout', () => {
    assert.equal(claimed.me.events, 4)
    assert.ok(claimed.me.rp <= 999, `rp ${claimed.me.rp}`)
    assert.equal(claimed.me.admin, false)
  })
  await t.test('names are unique (any case) and filtered', async () => {
    assert.equal((await call('claim', { name: 'tivro' })).status, 409)
    assert.equal((await call('claim', { name: 'admin' })).status, 400)
    assert.equal((await call('claim', { name: 'x' })).status, 400)
    assert.equal((await call('claim', { name: 'faggot99' })).status, 400)
  })
  await t.test('restore needs the right code; no code in profile output', async () => {
    assert.equal((await call('restore', {}, { auth: { name: 'Tivro', code: 'AAAA-AAAA-AAAA-AAAA' } })).status, 403)
    const r = await call('restore', {}, { auth: { name: 'TIVRO', code: claimed.code.toLowerCase() } })
    assert.equal(r.status, 200)
    assert.equal(JSON.stringify(r).includes(claimed.code), false)
  })
  await t.test('RP is the server’s own maths, counted once', async () => {
    const before = (await call('me', {}, { auth: tivro })).me
    const fake = await call('rp', { event: { id: 'track:new', kind: 'play', score: 100, bars: 16, delta: 9999 } }, { auth: tivro })
    assert.equal(fake.status, 200)
    assert.ok(fake.delta <= 66, `delta ${fake.delta}`)
    assert.equal(fake.me.rp, before.rp + fake.delta)
    const again = await call('rp', { event: { id: 'track:new', kind: 'play', score: 100, bars: 16 } }, { auth: tivro })
    assert.equal(again.duplicate, true)
    assert.equal(again.me.rp, fake.me.rp)
    assert.equal((await call('rp', { event: { id: 'track:bad', kind: 'play', score: 100, bars: 17 } }, { auth: tivro })).status, 400)
    assert.equal((await call('rp', { event: { id: 'track:x', kind: 'play', score: 50, bars: 16 } })).status, 401)
  })
  await t.test('rejects foreign origins', async () => {
    assert.equal((await call('feed', {}, { origin: 'https://evil.example' })).status, 403)
  })

  const pub = await publish(tivro, meta())
  assert.equal(pub.status, 200, JSON.stringify(pub))
  const id = pub.track.id

  await t.test('publish validates and blocks repeats, slurs, non-WAV', async () => {
    assert.equal((await publish(tivro, meta())).status, 409)
    assert.equal((await publish(tivro, meta({ sourceId: 'track:2', title: 'n1gg3r' }))).status, 400)
    assert.equal((await publish(tivro, meta({ sourceId: 'track:3', kind: 'upload' }))).status, 400)
    assert.equal((await publish(tivro, meta({ sourceId: 'track:4' }), new Blob(['ID3 not a wav']))).status, 400)
    assert.equal((await publish(null, meta({ sourceId: 'track:5' }))).status, 401)
  })
  await t.test('feed, track, audio with ranges', async () => {
    const feed = await call('feed', { sort: 'new' })
    assert.equal(feed.tracks[0].id, id)
    assert.equal(feed.tracks[0].creator.name, 'Tivro')
    const detail = await call('track', { id })
    assert.deepEqual(detail.track.lyrics, ['yo check it', 'bank fees'])
    const full = await fetch(`${endpoint}?audio=${id}`)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'audio/wav')
    assert.equal((await full.arrayBuffer()).byteLength, 44 + 16000)
    const part = await fetch(`${endpoint}?audio=${id}`, { headers: { Range: 'bytes=0-11' } })
    assert.equal(part.status, 206)
    assert.equal((await part.arrayBuffer()).byteLength, 12)
  })
  await t.test('plays count once per listener per day; likes need a name', async () => {
    await call('play', { id }, { dev: 1 })
    await call('play', { id }, { dev: 1 })
    const p = await call('play', { id }, { dev: 2 })
    assert.equal(p.plays, 2)
    assert.equal((await call('like', { id, on: true })).status, 401)
    const fan = await call('claim', { name: 'Fan_1' })
    const fanAuth = { name: 'Fan_1', code: fan.code }
    assert.equal((await call('like', { id, on: true }, { auth: fanAuth })).likes, 1)
    assert.equal((await call('like', { id, on: true }, { auth: fanAuth })).likes, 1)
    assert.equal((await call('like', { id, on: false }, { auth: fanAuth })).likes, 0)
  })
  await t.test('leaderboards', async () => {
    const ranked = await call('leaderboard', { board: 'ranked' })
    assert.equal(ranked.rows[0].name, 'Tivro')
    assert.equal((await call('leaderboard', { board: 'listened' })).rows[0].track.id, id)
    assert.equal((await call('leaderboard', { board: 'scores' })).rows[0].track.score, 84)
    assert.equal((await call('leaderboard', { board: 'trending' })).rows[0].track.id, id)
    const prof = await call('profile', { name: 'tivro' })
    assert.equal(prof.profile.worldRank, 1)
    assert.equal(prof.profile.listens, 2)
  })
  await t.test('three reports hide a track until an admin restores it', async (t2) => {
    await call('report', { id, reason: 'hate' }, { dev: 3 })
    await call('report', { id, reason: 'hate' }, { dev: 3 }) // same reporter: once
    await call('report', { id, reason: 'hate' }, { dev: 4 })
    assert.equal((await call('feed', {})).tracks.length, 1)
    await call('report', { id, reason: 'hate' }, { dev: 5 })
    assert.equal((await call('feed', {})).tracks.length, 0)
    const gone = await fetch(`${endpoint}?audio=${id}`)
    await gone.arrayBuffer()
    assert.equal(gone.status, 404)
    assert.equal((await call('admin_queue', {}, { auth: tivro })).status, 403)
    const boss = await call('claim', { name: 'Boss' })
    const bossAuth = { name: 'Boss', code: boss.code }
    assert.equal(boss.me.admin, true)
    const queue = await call('admin_queue', {}, { auth: bossAuth })
    assert.equal(queue.tracks[0].id, id)
    assert.equal(queue.tracks[0].reports, 3)
    await call('admin_track', { id, op: 'restore' }, { auth: bossAuth })
    assert.equal((await call('feed', {})).tracks.length, 1)
    await t2.test('bans hide a player and their tracks everywhere', async () => {
      await call('admin_ban', { name: 'Tivro', on: true }, { auth: bossAuth })
      assert.equal((await call('feed', {})).tracks.length, 0)
      assert.equal((await call('leaderboard', { board: 'ranked' })).rows.some((r) => r.name === 'Tivro'), false)
      assert.equal((await call('rp', { event: { id: 'track:z', kind: 'play', score: 90, bars: 16 } }, { auth: tivro })).status, 403)
      await call('admin_ban', { name: 'Tivro', on: false }, { auth: bossAuth })
      assert.equal((await call('feed', {})).tracks.length, 1)
    })
  })
  await t.test('owner can unpublish, then publish again', async () => {
    assert.equal((await call('unpublish', { id }, { auth: tivro })).ok, true)
    assert.equal((await call('feed', {})).tracks.length, 0)
    assert.equal((await publish(tivro, meta())).status, 200)
  })
})
