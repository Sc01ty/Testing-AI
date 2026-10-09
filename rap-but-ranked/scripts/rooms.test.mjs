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
  // a tiny valid WAV for submissions
  const wav = (() => {
    const n = 800, buf = Buffer.alloc(44 + n * 2)
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24)
    buf.writeUInt32LE(16000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
    return new Blob([buf], { type: 'audio/wav' })
  })()
  async function submit(access, values, audio = wav) {
    const form = new FormData()
    form.append('payload', JSON.stringify({ action: 'submit', ...access, ...values }))
    if (audio) form.append('audio', audio, 'vocal.wav')
    const r = await fetch(endpoint, { method: 'POST', body: form })
    return { status: r.status, ...(await r.json()) }
  }
  const lyrics = ['I paid the rent', 'I bought a house', 'Now mum can rest', 'I did my best']
  const turnAt = (i) => ({ start: beat.introOffset + i * count * spbar, end: beat.introOffset + (i + 1) * count * spbar })
  const take = (i) => ({ beatTimeSec: turnAt(i).start - 0.3, durationSec: 4, sampleRate: 8000, peaks: [], sectionStartSec: turnAt(i).start, sectionEndSec: turnAt(i).end })
  const result = { score: 71, rank: 'B', feedback: ['Clear story.'], categories: [] }
  await t.test('only host can configure', async () => {
    assert.equal((await call('configure', g, { session })).status, 403)
    const configured = await call('configure', h, { session })
    assert.equal(configured.status, 200)
    assert.equal(configured.session.status, 'active')
    assert.match(configured.session.id, /^room-/)
  })
  await t.test('turns go in order and only to their owner', async () => {
    const sec0 = turnAt(0)
    assert.equal((await submit(g, { index: 0, lyrics, section: sec0, take: take(0), result })).status, 403)
    assert.equal((await submit(h, { index: 1, lyrics, section: turnAt(1), take: take(1), result })).status, 403)
    assert.equal((await submit(h, { index: 0, lyrics: lyrics.slice(0, 2), section: sec0, take: take(0), result })).status, 400)
    assert.equal((await submit(h, { index: 0, lyrics, section: sec0, take: take(0), result }, null)).status, 413)
  })
  await t.test('START / END must stay inside the section and can be trimmed', async () => {
    const sec0 = turnAt(0)
    const tooLong = { start: sec0.start, end: sec0.end + spbar }
    assert.equal((await submit(h, { index: 0, lyrics, section: tooLong, take: take(0), result })).status, 400)
    const early = { start: sec0.start - spbar, end: sec0.end - spbar }
    assert.equal((await submit(h, { index: 0, lyrics, section: early, take: take(0), result })).status, 400)
    const trimmed = { start: sec0.start + spbar / 4, end: sec0.end - spbar / 2 }
    const next = { prompt: 'Answer the rent line.', focus: ['rent'], storyBeat: 'response', source: 'basic' }
    const ok = await submit(h, { index: 0, lyrics, section: trimmed, take: take(0), result, challenge: next })
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.session.turns[0].section, trimmed)
    assert.match(ok.session.turns[0].take.id, /^room-[A-Z2-9]{7}:[a-f0-9]{24}$/)
    assert.equal(ok.session.turns[1].challenge.prompt, 'Answer the rent line.')
    assert.equal(ok.session.status, 'active')
    // the take can be fetched by the other player
    const audio = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'audio', ...g, id: ok.session.turns[0].take.id }) })
    assert.equal(audio.status, 200)
    assert.equal((await audio.arrayBuffer()).byteLength, 44 + 1600)
  })
  await t.test('activity is shared without bumping the version', async () => {
    const before = (await call('poll', h)).version
    assert.equal((await call('activity', g, { state: 'hacking' })).status, 400)
    assert.equal((await call('activity', g, { state: 'recording' })).status, 200)
    const state = await call('poll', h, { version: before })
    assert.equal(state.unchanged, true)
    assert.equal(state.activity[1].state, 'recording')
  })
  await t.test('the last submit completes the track; owners can redo their own section', async () => {
    const done = await submit(g, { index: 1, lyrics, section: turnAt(1), take: take(1), result })
    assert.equal(done.status, 200)
    assert.equal(done.session.status, 'complete')
    assert.deepEqual(done.activity, [null, null])
    assert.equal((await submit(g, { index: 0, lyrics, section: turnAt(0), take: take(0), result })).status, 403)
    const firstTake = done.session.turns[0].take.id
    const redo = await submit(h, { index: 0, lyrics, section: turnAt(0), take: take(0), result: { ...result, score: 90 } })
    assert.equal(redo.status, 200)
    assert.notEqual(redo.session.turns[0].take.id, firstTake)
    assert.equal(redo.session.turns[0].result.score, 90)
    assert.equal(redo.session.turns[1].take.id, done.session.turns[1].take.id)
  })
  await t.test('parallel: both players work at once, ownership and direction are server-side', async () => {
    const room = await call('create', {}, { name: 'P1' })
    const a = { code: room.code, token: room.token }
    const joined = await call('join', { code: room.code }, { name: 'P2' })
    const b = { code: room.code, token: joined.token }
    const plan = {
      ...session,
      game: 'parallel',
      length: 16,
      turns: Array.from({ length: 4 }, (_, i) => ({ ...session.turns[0], index: i, player: i % 2, challenge: { prompt: `Batch direction ${i}`, focus: [], storyBeat: 'opening', source: 'basic' } })),
    }
    const cfg = await call('configure', a, { session: plan })
    assert.equal(cfg.status, 200)
    assert.equal(cfg.session.game, 'parallel')
    assert.deepEqual(cfg.session.turns.map((t) => t.directed), [true, true, false, false])
    assert.equal(cfg.session.turns[1].challenge.prompt, 'Batch direction 1')
    const at = (i) => ({ start: beat.introOffset + i * count * spbar, end: beat.introOffset + (i + 1) * count * spbar })
    const tk = (i) => ({ ...take(0), beatTimeSec: at(i).start - 0.3 })
    // P2 can't take P1's bars, nor skip ahead to their own later section
    assert.equal((await submit(b, { index: 0, lyrics, section: at(0), take: tk(0), result })).status, 403)
    assert.equal((await submit(b, { index: 3, lyrics, section: at(3), take: tk(3), result })).status, 409)
    // P2 finishes first: upload order doesn't decide placement
    const p2 = await submit(b, { index: 1, lyrics, section: at(1), take: tk(1), result })
    assert.equal(p2.status, 200)
    assert.deepEqual(p2.session.turns[1].section, at(1))
    // P2's next section has no direction yet → can't submit it, can direct only their own next batch
    assert.equal((await submit(b, { index: 3, lyrics, section: at(3), take: tk(3), result })).status, 409)
    const dir = (n) => [0, 1].map((k) => ({ prompt: `Batch ${n}.${k}`, focus: [], storyBeat: 'x', source: 'basic' }))
    assert.equal((await call('direct', a, { batch: 1, challenges: dir(1) })).status, 409) // P1 is still on batch 0
    const d1 = await call('direct', b, { batch: 1, challenges: dir(1) })
    assert.equal(d1.status, 200)
    assert.deepEqual(d1.session.turns.map((t) => t.directed), [true, true, true, true])
    // a second direction for the same batch is ignored (first writer wins)
    const again = await call('direct', b, { batch: 1, challenges: dir(9) })
    assert.equal(again.session.turns[2].challenge.prompt, 'Batch 1.0')
    // P1 still on bars 1–4 while P2 locks bars 13–16
    assert.equal((await submit(b, { index: 3, lyrics, section: at(3), take: tk(3), result })).status, 200)
    assert.equal((await submit(a, { index: 2, lyrics, section: at(2), take: tk(2), result })).status, 409)
    assert.equal((await submit(a, { index: 0, lyrics, section: { start: at(1).start, end: at(1).end }, take: tk(0), result })).status, 400) // can't reach into P2's bars
    assert.equal((await submit(a, { index: 0, lyrics, section: at(0), take: tk(0), result })).status, 200)
    const last = await submit(a, { index: 2, lyrics, section: at(2), take: tk(2), result })
    assert.equal(last.session.status, 'complete')
    assert.deepEqual(last.session.turns.map((t) => [t.player, t.section.start]), [0, 1, 2, 3].map((i) => [i % 2, at(i).start]))
    // relay rooms can't be directed in pairs
    assert.equal((await call('direct', h, { batch: 0, challenges: dir(0) })).status, 409)
  })
  await t.test('signals delivered only to the other authenticated participant', async () => {
    await call('signal', h, { signal: { type: 'hello', from: 'host' } })
    const state = await call('poll', g)
    assert.deepEqual(state.signals, [{ type: 'hello', from: 'host' }])
    assert.deepEqual((await call('poll', g)).signals, [])
  })
  await t.test('host close prevents subsequent join or reuse', async () => {
    assert.equal((await call('leave', h)).status, 200)
    assert.equal((await call('poll', g)).status, 410)
  })
})
