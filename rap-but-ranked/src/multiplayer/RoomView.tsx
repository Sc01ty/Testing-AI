import { useEffect, useRef, useState } from 'react'
import { Button, Field, Panel, Segmented } from '../components/ui/ui'
import { includedBeats, type IncludedBeat } from '../storage/includedBeats'
import { getBeatAudio, saveTakeAudio, getTakeAudio } from '../storage'
import { audio } from '../audio/AudioEngine'
import { mic, useMic } from '../audio/mic'
import { beatPlayer } from '../audio/BeatPlayer'
import { loadWorklet, TakeRecorder } from '../audio/recordTake'
import { FreestyleRecorder } from '../freestyle/recorder'
import { encodeWav } from '../audio/wav'
import { rememberTake } from '../play/takeAudio'
import type { TakeMeta, TrackLength, RoundResult } from '../domain/types'
import {
  newDuo,
  duoChallenge,
  activeTurns,
  scoreDuoTurn,
  type DuoSession,
  type DuoTurn,
} from './session'
import { roomRequest, roomAudio, type RoomAccess, type RoomState } from './roomClient'
import { RoomVoice } from './voice'
import { saveDuo } from './store'
import { DuoView } from './DuoView'
import { localModel } from '../director/localModel'
import { settingsStore } from '../settings/settings'
import './duo.css'

const ACCESS_KEY = 'rbr.onlineRoom'
export function RoomView({ onLeave }: { onLeave: () => void }) {
  const micState = useMic()
  const [access, setAccess] = useState<RoomAccess | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(ACCESS_KEY) ?? 'null')
    } catch {
      return null
    }
  })
  const [room, setRoom] = useState<RoomState | null>(null),
    [name, setName] = useState(''),
    [code, setCode] = useState('')
  const [catalogue, setCatalogue] = useState<IncludedBeat[]>([]),
    [beatId, setBeatId] = useState(''),
    [topic, setTopic] = useState(''),
    [trackName, setTrackName] = useState('')
  const [length, setLength] = useState<TrackLength>(16),
    [style, setStyle] = useState<DuoSession['style']>('standard'),
    [boundary, setBoundary] = useState<DuoTurn['boundary']>('clean')
  const [draft, setDraft] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [voiceStatus, setVoiceStatus] = useState('off'),
    [muted, setMuted] = useState(false)
  const [time, setTime] = useState<number | null>(null),
    [count, setCount] = useState<number | null>(null),
    [phase, setPhase] = useState(''),
    [saved, setSaved] = useState<DuoSession | null>(null),
    [pendingUpload, setPendingUpload] = useState(false)
  const [punch, setPunch] = useState<DuoTurn | null>(null)
  const currentRoom = useRef<RoomState | null>(null),
    voice = useRef<RoomVoice | null>(null),
    recording = useRef<FreestyleRecorder | TakeRecorder | null>(null),
    handled = useRef(-1),
    offset = useRef(0),
    bestRtt = useRef(Infinity),
    mounted = useRef(true)
  const pending = useRef<{
    blob: Blob
    take: TakeMeta
    results: Record<string, RoundResult>
    run: number
    slot?: number
  } | null>(null)
  const voiceInbox = useRef<Record<string, unknown>[]>([]),
    saving = useRef(false),
    lastSaved = useRef('')
  useEffect(() => {
    mounted.current = true
    void includedBeats().then((b) => {
      setCatalogue(b)
      if (b[0]) setBeatId(b[0].id)
      else setError('Could not load the included beats. Reload the page to retry.')
    })
    void localModel.detect().then(() => {
      if (settingsStore.get().aiMode === 'local' && localModel.getState().status === 'cached')
        void localModel.load()
    })
    return () => {
      mounted.current = false
      voice.current?.close()
      recording.current?.cancel()
    }
  }, [])
  function accept(next: RoomState) {
    if (!mounted.current) return
    if (next.signals.length) {
      if (voice.current) voice.current.receive(next.signals)
      else voiceInbox.current.push(...next.signals)
    }
    if (!currentRoom.current || next.version >= currentRoom.current.version) {
      currentRoom.current = next
      setRoom(next)
    }
  }
  async function request(
    action: string,
    values: Record<string, unknown> = {},
    blob?: Blob,
    auth = access,
  ) {
    const start = Date.now(),
      result = await roomRequest(action, auth, values, blob),
      end = Date.now()
    if (result.unchanged && currentRoom.current) result.session = currentRoom.current.session
    if (end - start < bestRtt.current) {
      bestRtt.current = end - start
      offset.current = result.now - (start + end) / 2
    }
    accept(result)
    return result
  }
  async function safe(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  useEffect(() => {
    if (!access) return
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(access))
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        await request('poll', { version: currentRoom.current?.version ?? 0 }, undefined, access)
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Lobby disconnected')
      }
      if (!stopped) timer = setTimeout(poll, 800)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [access?.code, access?.token])
  const s = room?.session ?? null,
    turn = s?.turns.find((t) => !t.ready),
    myPlayer = access?.player ?? 0
  useEffect(() => {
    setDraft(turn?.lyrics ?? [])
  }, [turn?.index, s?.id])
  async function join(action: 'create' | 'join') {
    const next = await request(action, { name, code: code.trim().toUpperCase() }, undefined, null)
    const auth = { code: next.code, token: next.token!, player: next.player }
    setAccess(auth)
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(auth))
  }
  async function configure() {
    const beat = catalogue.find((b) => b.id === beatId)
    if (!beat || !room) return
    const next = newDuo({
      players: [room.members[0]!.name, room.members[1]?.name ?? 'Waiting for player'],
      trackName,
      beat,
      topic,
      length,
      style,
      boundary,
    })
    next.mode = 'online'
    next.turns[0].challenge = await duoChallenge(next, 0)
    await request('configure', { session: next })
    setSaved(null)
  }
  async function lock() {
    if (!s || !turn) return
    const next = {
      ...s,
      turns: s.turns.map((t) =>
        t.index === turn.index ? { ...t, lyrics: draft, ready: true } : t,
      ),
    }
    const challenge = next.turns[turn.index + 1]
      ? await duoChallenge(next, turn.index + 1)
      : undefined
    await request('lock', { index: turn.index, lyrics: draft, challenge })
  }
  async function enableVoice() {
    audio.unlock()
    if (!(await mic.ensure())) throw new Error(mic.getState().message ?? 'Enable your microphone.')
    if (s && audio.context)
      await Promise.all([
        beatPlayer.loadBuffer({ id: s.beatId, getBlob: () => getBeatAudio(s.beatId) }),
        loadWorklet(audio.context),
      ])
    if (
      voice.current &&
      (['failed', 'disconnected'].includes(voiceStatus) || voiceStatus.startsWith('Voice:'))
    ) {
      voice.current.close()
      voice.current = null
    }
    if (!voice.current) {
      voice.current = new RoomVoice(
        myPlayer === 0,
        async (signal) => {
          await request('signal', { signal })
        },
        setVoiceStatus,
      )
      voice.current.receive(voiceInbox.current)
      voiceInbox.current = []
    }
    voice.current.unmute()
  }
  async function ready() {
    if (!s || !audio.context) throw new Error('Enable voice first.')
    if (document.visibilityState !== 'visible') throw new Error('Keep the performance tab visible.')
    await audio.context.resume()
    await Promise.all([
      beatPlayer.loadBuffer({ id: s.beatId, getBlob: () => getBeatAudio(s.beatId) }),
      loadWorklet(audio.context),
    ])
    await request('ready')
  }
  async function upload() {
    if (!pending.current) return
    const p = pending.current
    await request(
      'upload',
      { run: p.run, take: p.take, results: p.results, slot: p.slot ?? null },
      p.blob,
    )
    pending.current = null
    setPendingUpload(false)
  }
  async function perform(state: RoomState) {
    const session = state.session!
    const r = new FreestyleRecorder()
    recording.current = r
    try {
      setError(null)
      const rec = await r.record(
        {
          beat: { id: session.beatId, getBlob: () => getBeatAudio(session.beatId) },
          loop: { start: session.beatGrid.introOffset, end: session.turns.at(-1)!.end },
          bars: session.length,
          secondsPerBeat: 60 / session.beatGrid.bpm,
          beatsPerBar: 4,
          startAtMs: state.startAt! - offset.current,
        },
        {
          onTime: (t) => setTime(session.beatGrid.introOffset + t),
          onCount: setCount,
          onPhase: setPhase,
        },
      )
      if (!rec) throw new Error('Performance interrupted. Ask the host to reset and start again.')
      const id = `${session.id}:local:${myPlayer}:${state.run}`,
        blob = encodeWav([rec.samples], rec.sampleRate),
        startTime = session.beatGrid.introOffset + rec.startTime
      await saveTakeAudio(id, session.id, blob)
      rememberTake(id, rec)
      const take: TakeMeta = {
        id,
        beatId: session.beatId,
        barStart: 0,
        barCount: session.length,
        beatTimeSec: startTime,
        sectionStartSec: session.beatGrid.introOffset,
        sectionEndSec: session.turns.at(-1)!.end,
        durationSec: rec.durationSec,
        sampleRate: rec.sampleRate,
        latencySec: rec.latencySec,
        inputPeak: rec.inputPeak,
        peaks: rec.peaks,
        recordedAt: Date.now(),
      }
      const results: Record<string, RoundResult> = {}
      for (const t of session.turns.filter((t) => t.player === myPlayer))
        results[t.index] = scoreDuoTurn(session, t, {
          samples: rec.samples,
          sampleRate: rec.sampleRate,
          startTime,
        })
      pending.current = { blob, take, results, run: state.run }
      setPendingUpload(true)
      await upload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recording failed.')
    } finally {
      setTime(null)
      setCount(null)
      setPhase('')
      recording.current = null
    }
  }
  useEffect(() => {
    if (
      !room?.startAt ||
      !room.session ||
      room.session.status === 'complete' ||
      handled.current === room.run ||
      pending.current
    )
      return
    handled.current = room.run
    void perform(room)
  }, [room?.startAt, room?.run])
  useEffect(() => {
    if (room && room.startAt === null) {
      recording.current?.cancel()
      pending.current = null
      setPendingUpload(false)
      setSaved(null)
    }
  }, [room?.startAt])
  async function saveCompleted(state: RoomState) {
    if (!access || !state.session || saving.current) return
    saving.current = true
    try {
      const session = state.session
      const takes = new Map(
        session.turns.flatMap((t) => (t.take ? [[t.take.id, t.take] as const] : [])),
      )
      for (const [id] of takes)
        if (!(await getTakeAudio(id)))
          await saveTakeAudio(id, session.id, await roomAudio(access, id))
      await saveDuo(session)
      setSaved(session)
      lastSaved.current = `${state.run}:${state.version}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the combined track.')
    } finally {
      saving.current = false
      const latest = currentRoom.current
      if (latest?.session?.status === 'complete' && latest.version !== state.version)
        void saveCompleted(latest)
    }
  }
  useEffect(() => {
    if (room?.session?.status === 'complete' && lastSaved.current !== `${room.run}:${room.version}`)
      void saveCompleted(room)
  }, [room?.session?.status, room?.version])
  async function retake(t: DuoTurn) {
    if (!s || !room) return
    const r = new TakeRecorder()
    setPunch(t)
    recording.current = r
    try {
      const rec = await r.record(
        {
          beat: { id: s.beatId, getBlob: () => getBeatAudio(s.beatId) },
          sectionStart: t.start + t.vocalOffset,
          sectionEnd: t.end,
          secondsPerBeat: 60 / s.beatGrid.bpm,
          beatsPerBar: 4,
          gridOrigin: s.beatGrid.introOffset,
        },
        { onCount: setCount, onPhase: setPhase },
      )
      if (!rec) return
      const id = `${s.id}:retake:${Date.now()}`,
        blob = encodeWav([rec.samples], rec.sampleRate)
      await saveTakeAudio(id, s.id, blob)
      rememberTake(id, rec)
      const take: TakeMeta = {
        id,
        beatId: s.beatId,
        barStart: t.barStart,
        barCount: t.barEnd - t.barStart,
        beatTimeSec: rec.beatTimeSec,
        sectionStartSec: t.start + t.vocalOffset,
        sectionEndSec: t.end,
        durationSec: rec.durationSec,
        sampleRate: rec.sampleRate,
        latencySec: rec.latencySec,
        inputPeak: rec.inputPeak,
        peaks: rec.peaks,
        recordedAt: Date.now(),
      }
      pending.current = {
        blob,
        take,
        run: room.run,
        slot: t.index,
        results: {
          [t.index]: scoreDuoTurn(s, t, {
            samples: rec.samples,
            sampleRate: rec.sampleRate,
            startTime: rec.beatTimeSec,
          }),
        },
      }
      setPendingUpload(true)
      await upload()
    } finally {
      recording.current = null
      setPunch(null)
      setPhase('')
      setCount(null)
    }
  }
  async function leave() {
    if (access) await request('leave')
    recording.current?.cancel()
    voice.current?.close()
    sessionStorage.removeItem(ACCESS_KEY)
    onLeave()
  }
  const active = punch ? [punch] : s && time !== null ? activeTurns(s, time) : [],
    incoming = s && time !== null ? s.turns.find((t) => t.start + t.vocalOffset > time) : null
  const live = time !== null || count !== null || !!phase
  if (location.hostname === 'sc01ty.github.io')
    return (
      <Panel title="Play online">
        <p>Online rooms run on Scotty Systems.</p>
        <a className="btn btn--primary" href="https://scottysystems.it.com/rap-but-ranked/#/play">
          Open Rap But Ranked multiplayer
        </a>
      </Panel>
    )
  return (
    <div className="duo room">
      <Button variant="quiet" disabled={busy || live} onClick={() => void safe(leave)}>
        ← Singleplayer / Multiplayer
      </Button>
      <h1 className="room-title">{access ? 'YOUR LOBBY' : 'MULTIPLAYER'}</h1>
      {error && <p role="alert">{error}</p>}
      {!access ? (
        <>
          <p>Two computers. One track. Create a room and send your mate the code.</p>
          <Field label="Your name">
            <input
              className="input"
              placeholder="Your name"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="duo-summaries">
            <Panel title="Host a track">
              <p>You choose the beat and start the performance.</p>
              <Button
                variant="primary"
                disabled={busy || !name.trim()}
                onClick={() => void safe(() => join('create'))}
              >
                Create lobby
              </Button>
            </Panel>
            <Panel title="Join your mate">
              <Field label="Room code">
                <input
                  className="input room-code-input"
                  placeholder="Room code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
                />
              </Field>
              <Button
                disabled={busy || !name.trim() || code.length !== 7}
                onClick={() => void safe(() => join('join'))}
              >
                Join lobby
              </Button>
            </Panel>
          </div>
        </>
      ) : !room ? (
        <p>Connecting to your lobby…</p>
      ) : (
        <>
          <Panel title="ROOM CODE">
            <div className="room-code" data-testid="room-code">
              {access.code}
            </div>
            <Button
              variant="quiet"
              onClick={() =>
                void safe(async () => {
                  await navigator.clipboard.writeText(access.code)
                })
              }
            >
              Copy code
            </Button>
            <p>
              {room.members
                .map((m, i) =>
                  m
                    ? `${m.name} · ${m.online ? 'connected' : 'reconnecting'}${m.ready ? ' · READY' : ''}`
                    : `Waiting for player ${i + 1}`,
                )
                .join(' / ')}
            </p>
          </Panel>
          <div className="room-voice">
            <span>
              VOICE ·{' '}
              {voiceStatus === 'failed'
                ? 'Could not connect. Try another network and re-enable voice.'
                : voiceStatus}
            </span>
            <Button disabled={busy} onClick={() => void safe(enableVoice)}>
              Enable voice
            </Button>
            {voice.current && (
              <Button
                variant="quiet"
                onClick={() => {
                  setMuted(!muted)
                  voice.current?.setMuted(!muted)
                }}
              >
                {muted ? 'Unmute teammate' : 'Mute teammate'}
              </Button>
            )}
          </div>
          {!s ? (
            myPlayer === 0 ? (
              <Panel title="Choose your shared track">
                <Field label="Track name">
                  <input
                    className="input"
                    placeholder="Our track"
                    maxLength={40}
                    value={trackName}
                    onChange={(e) => setTrackName(e.target.value)}
                  />
                </Field>
                <Field label="Beat">
                  <select
                    aria-label="Beat"
                    className="input select"
                    value={beatId}
                    onChange={(e) => setBeatId(e.target.value)}
                  >
                    {catalogue.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {Math.round(b.bpm)} BPM
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Topic">
                  <input
                    className="input"
                    placeholder="What are you both rapping about?"
                    maxLength={80}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </Field>
                <Segmented
                  label="Total length"
                  value={length}
                  onChange={setLength}
                  options={([8, 16, 32] as TrackLength[]).map((n) => ({
                    value: n,
                    label: `${n} bars`,
                    disabled:
                      !!catalogue.find((b) => b.id === beatId) &&
                      (n * 240) / catalogue.find((b) => b.id === beatId)!.bpm +
                        catalogue.find((b) => b.id === beatId)!.introOffset >
                        catalogue.find((b) => b.id === beatId)!.durationSec,
                  }))}
                />
                <Segmented
                  label="Turn style"
                  value={style}
                  onChange={setStyle}
                  options={[
                    { value: 'standard', label: 'Standard · 4 bars each' },
                    { value: 'quick', label: 'Quick Trade · 2 bars each' },
                  ]}
                />
                <Segmented
                  label="Handoff"
                  value={boundary}
                  onChange={setBoundary}
                  options={[
                    { value: 'clean', label: 'Clean' },
                    { value: 'overlap', label: 'Overlap · 1 beat early' },
                  ]}
                />
                <Button
                  variant="primary"
                  disabled={busy || !topic.trim() || !beatId}
                  onClick={() => void safe(configure)}
                >
                  Prepare shared track
                </Button>
              </Panel>
            ) : (
              <p>The host is choosing your shared beat and topic.</p>
            )
          ) : (
            <>
              <p>
                <b>{s.trackName}</b> · {s.beatName} · {s.players.join(' × ')} · {s.length} bars
              </p>
              <div className="duo-timeline">
                {s.turns.map((t) => (
                  <div
                    key={t.index}
                    className={`duo-slot duo-player--${t.player}`}
                    style={{ flex: t.barEnd - t.barStart }}
                  >
                    <span>{s.players[t.player]}</span>
                    <b>
                      {t.barStart + 1}–{t.barEnd}
                    </b>
                    <small>{t.ready ? 'READY' : 'WRITE'}</small>
                  </div>
                ))}
              </div>
              {live ? (
                <section className="duo-live" aria-label="Performance mode" data-time={time}>
                  <p className="eyebrow">
                    {phase} · MIC {micState.status} · VOICE {voiceStatus} · YOU:{' '}
                    {s.players[myPlayer]}
                  </p>
                  {count !== null ? (
                    <div className="countdown">{count}</div>
                  ) : (
                    <>
                      <h2>{active.map((t) => s.players[t.player]).join(' + ') || 'GET READY'}</h2>
                      <p>
                        {active.some((t) => t.player === myPlayer)
                          ? 'YOUR TURN — RAP'
                          : 'YOUR MATE’S TURN — LISTEN'}
                      </p>
                      <p className="duo-next">
                        {incoming
                          ? `${s.players[incoming.player]} IN ${Math.max(1, Math.ceil((incoming.start + incoming.vocalOffset - (time ?? 0)) / (240 / s.beatGrid.bpm)))} BAR(S)`
                          : 'BRING IT HOME'}
                      </p>
                      {active.map((t) => (
                        <p key={t.index}>{t.lyrics.join(' / ')}</p>
                      ))}
                    </>
                  )}
                </section>
              ) : s.status === 'complete' ? (
                <>
                  {saved ? (
                    <DuoView
                      key={`${room.run}:${lastSaved.current}`}
                      initial={saved}
                      networkReadOnly
                    />
                  ) : (
                    <p>
                      Downloading both vocals and saving your combined track…{' '}
                      <Button onClick={() => void safe(() => saveCompleted(room))}>
                        Retry saving
                      </Button>
                    </p>
                  )}
                  {s.turns
                    .filter((t) => t.player === myPlayer)
                    .map((t) => (
                      <Button
                        key={t.index}
                        disabled={busy || pendingUpload}
                        onClick={() => void safe(() => retake(t))}
                      >
                        Retake my slot {t.index + 1}
                      </Button>
                    ))}
                </>
              ) : room.startAt ? (
                <Panel title="Waiting for both recordings">
                  <p>
                    {pendingUpload
                      ? 'Your recording needs to be uploaded.'
                      : 'Your mate’s recording is still being captured or uploaded.'}
                  </p>
                </Panel>
              ) : turn ? (
                <Panel
                  title={`${s.players[turn.player]} · bars ${turn.barStart + 1}–${turn.barEnd}`}
                  className={`duo-player duo-player--${turn.player}`}
                >
                  <p>{turn.challenge.prompt}</p>
                  <p className="eyebrow">
                    {turn.challenge.source === 'local-ai' ? 'LOCAL AI DIRECTOR' : 'BASIC DIRECTOR'}
                  </p>
                  {turn.player === myPlayer ? (
                    <>
                      {draft.map((line, i) => (
                        <Field key={i} label={`Bar ${i + 1}`}>
                          <input
                            className="input"
                            maxLength={240}
                            value={line}
                            onChange={(e) =>
                              setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))
                            }
                          />
                        </Field>
                      ))}
                      <Button
                        disabled={
                          busy ||
                          draft.length !== turn.lyrics.length ||
                          draft.some((l) => !l.trim())
                        }
                        onClick={() => void safe(lock)}
                      >
                        Lock my section
                      </Button>
                    </>
                  ) : (
                    <p>
                      Your mate is writing. Their locked lyrics and the next direction will appear
                      here.
                    </p>
                  )}
                </Panel>
              ) : (
                <Panel title="Ready to perform">
                  <p>
                    Headphones on. Enable voice, then ready up. Keep this tab open: one shared
                    count-in starts both beats.
                  </p>
                  <Button
                    disabled={
                      busy ||
                      voiceStatus !== 'connected' ||
                      micState.status !== 'ready' ||
                      room.members[myPlayer]?.ready
                    }
                    onClick={() => void safe(ready)}
                  >
                    Ready to perform
                  </Button>
                  {myPlayer === 0 && (
                    <Button
                      variant="primary"
                      disabled={
                        busy ||
                        voiceStatus !== 'connected' ||
                        !room.members.every((m) => m?.ready && m.online)
                      }
                      onClick={() =>
                        void safe(async () => {
                          await request('start')
                        })
                      }
                    >
                      Start shared performance
                    </Button>
                  )}
                </Panel>
              )}
              {pendingUpload && !live && (
                <Button disabled={busy} onClick={() => void safe(upload)}>
                  Retry vocal upload
                </Button>
              )}
              {myPlayer === 0 && room.startAt && !live && (
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() =>
                    void safe(async () => {
                      await request('reset')
                      setSaved(null)
                    })
                  }
                >
                  Reset performance / record again
                </Button>
              )}
              {!live && (
                <Panel title="The story so far">
                  {s.turns
                    .filter((t) => t.ready)
                    .map((t) => (
                      <p key={t.index}>
                        <b>{s.players[t.player]}</b>: {t.lyrics.join(' / ')}
                      </p>
                    ))}
                </Panel>
              )}
            </>
          )}
          <p className="studio__hint">
            Your beat plays locally; your mate’s live voice has network delay. Each microphone is
            recorded separately for the finished mix. Rooms and server recordings expire after 24
            hours; saved browser tracks stay on your device.
          </p>
        </>
      )}
    </div>
  )
}
