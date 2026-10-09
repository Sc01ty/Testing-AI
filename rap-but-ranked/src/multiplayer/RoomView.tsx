import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Field, Panel, Segmented } from '../components/ui/ui'
import { includedBeats, type IncludedBeat } from '../storage/includedBeats'
import { saveTakeAudio, getTakeAudio, deleteTakeAudio } from '../storage'
import { ensureLexicon } from '../coach/lexicon'
import { audio } from '../audio/AudioEngine'
import { mic } from '../audio/mic'
import { rememberTake, takeSamples } from '../play/takeAudio'
import type { TrackLength } from '../domain/types'
import { barBeatLabel, endLabel } from '../play/sectionWindow'
import { newDuo, duoChallenge, scoreDuoTurn, turnWindow, type DuoSession, type DuoTurn } from './session'
import { roomRequest, roomAudio, type RoomAccess, type RoomState, type TurnActivity } from './roomClient'
import { RoomVoice } from './voice'
import { saveDuo, getDuo } from './store'
import { DuoView } from './DuoView'
import { TurnStudio, clearTurnDraft, type TurnSubmission } from './TurnStudio'
import { waitingTip } from './tips'
import { localModel } from '../director/localModel'
import { settingsStore } from '../settings/settings'
import './duo.css'

const ACCESS_KEY = 'rbr.onlineRoom'

/**
 * Online rooms, turn by turn. The player whose section it is gets the full
 * studio (write → place START/END → preview → record → play back → submit);
 * the other player sees who's on, what they're doing and a writing tip, and
 * becomes the active player as soon as the section is submitted.
 */
export function RoomView({ onLeave }: { onLeave: () => void }) {
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [voiceStatus, setVoiceStatus] = useState('off'),
    [muted, setMuted] = useState(false)
  const [saved, setSaved] = useState<DuoSession | null>(null),
    [redo, setRedo] = useState<DuoTurn | null>(null),
    [newTrack, setNewTrack] = useState(false)
  const currentRoom = useRef<RoomState | null>(null),
    voice = useRef<RoomVoice | null>(null),
    mounted = useRef(true)
  const voiceInbox = useRef<Record<string, unknown>[]>([]),
    saving = useRef(false),
    lastSaved = useRef(''),
    synced = useRef(new Set<string>()),
    sentActivity = useRef('')
  useEffect(() => {
    mounted.current = true
    void includedBeats().then((b) => {
      setCatalogue(b)
      if (b[0]) setBeatId(b[0].id)
      else setError('Could not load the included beats. Reload the page to retry.')
    })
    void localModel.detect().then(() => {
      if (settingsStore.get().aiMode === 'local' && localModel.getState().status === 'cached') void localModel.load()
    })
    return () => {
      mounted.current = false
      voice.current?.close()
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
  async function request(action: string, values: Record<string, unknown> = {}, blob?: Blob, auth = access) {
    const result = await roomRequest(action, auth, values, blob)
    if (result.unchanged && currentRoom.current) result.session = currentRoom.current.session
    accept(result)
    return result
  }
  async function safe(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      if (mounted.current) {
        audio.play('error')
        setError(e instanceof Error ? e.message : String(e))
      }
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
    myPlayer = access?.player ?? 0,
    mate = (1 - myPlayer) as 0 | 1,
    turn = s?.status === 'active' ? (s.turns.find((t) => !t.take) ?? null) : null,
    beat = s ? catalogue.find((b) => b.id === s.beatId) : undefined

  async function join(action: 'create' | 'join') {
    const next = await request(action, { name, code: code.trim().toUpperCase() }, undefined, null)
    const auth = { code: next.code, token: next.token!, player: next.player }
    setAccess(auth)
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(auth))
  }
  async function configure() {
    const b = catalogue.find((x) => x.id === beatId)
    if (!b || !room) return
    const next = newDuo({ players: [room.members[0]!.name, room.members[1]?.name ?? 'Waiting for player'], trackName, beat: b, topic, length, style, boundary })
    next.mode = 'online'
    next.turns[0].challenge = await duoChallenge(next, 0)
    await request('configure', { session: next })
    setSaved(null)
    setNewTrack(false)
  }

  // your mate's takes come down as soon as they're submitted: they lead into your count-in
  useEffect(() => {
    if (!access || !s) return
    for (const t of s.turns) {
      const id = t.take?.id
      if (!id || synced.current.has(id)) continue
      synced.current.add(id)
      void (async () => {
        if (!(await getTakeAudio(id))) await saveTakeAudio(id, s.id, await roomAudio(access, id))
      })().catch(() => synced.current.delete(id))
    }
  }, [room?.version, s?.id])

  const reportActivity = useCallback(
    (state: TurnActivity) => {
      if (!access || sentActivity.current === state) return
      sentActivity.current = state
      void roomRequest('activity', access, { state }).catch(() => (sentActivity.current = ''))
    },
    [access],
  )

  async function submitTurn(t: DuoTurn, sub: TurnSubmission) {
    if (!s) return
    reportActivity('submitting')
    await ensureLexicon()
    const [data, blob] = await Promise.all([takeSamples(sub.take.id), getTakeAudio(sub.take.id)])
    if (!data || !blob) throw new Error('Your take could not be loaded. Record it again.')
    const done: DuoTurn = { ...t, lyrics: sub.lyrics, section: sub.section, take: sub.take }
    const withTake = { ...s, turns: s.turns.map((x) => (x.index === t.index ? done : x)) }
    const result = scoreDuoTurn(withTake, done, { samples: data.samples, sampleRate: data.sampleRate, startTime: sub.take.beatTimeSec })
    const isRedo = s.status === 'complete'
    const scored = { ...withTake, turns: withTake.turns.map((x) => (x.index === t.index ? { ...done, result } : x)) }
    const challenge = !isRedo && s.turns[t.index + 1] ? await duoChallenge(scored, t.index + 1) : undefined
    const state = await request('submit', { index: t.index, lyrics: sub.lyrics, section: sub.section, take: sub.take, result, challenge }, blob)
    const stored = state.session?.turns[t.index]?.take
    if (stored) {
      // keep the audio under the room's id so nobody downloads their own take back
      await saveTakeAudio(stored.id, s.id, blob)
      rememberTake(stored.id, data)
      synced.current.add(stored.id)
    }
    void deleteTakeAudio(sub.take.id)
    clearTurnDraft(s, t)
    sentActivity.current = ''
    setRedo(null)
    audio.play('impact')
  }

  async function enableVoice() {
    audio.unlock()
    if (!(await mic.ensure())) throw new Error(mic.getState().message ?? 'Enable your microphone.')
    if (voice.current && (['failed', 'disconnected'].includes(voiceStatus) || voiceStatus.startsWith('Voice:'))) {
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

  async function saveCompleted(state: RoomState) {
    if (!access || !state.session || saving.current) return
    saving.current = true
    try {
      const local = await getDuo(state.session.id)
      const session = { ...state.session, adlibs: local?.adlibs }
      for (const t of session.turns) if (t.take && !(await getTakeAudio(t.take.id))) await saveTakeAudio(t.take.id, session.id, await roomAudio(access, t.take.id))
      await saveDuo(session)
      setSaved(session)
      lastSaved.current = `${session.id}:${state.version}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the combined track.')
    } finally {
      saving.current = false
      const latest = currentRoom.current
      if (latest?.session?.status === 'complete' && latest.version !== state.version) void saveCompleted(latest)
    }
  }
  useEffect(() => {
    if (room?.session?.status === 'complete' && lastSaved.current !== `${room.session.id}:${room.version}`) void saveCompleted(room)
    if (room?.session?.status !== 'complete') setSaved(null)
  }, [room?.session?.status, room?.version])

  async function leave() {
    if (access) await request('leave').catch(() => undefined)
    voice.current?.close()
    sessionStorage.removeItem(ACCESS_KEY)
    onLeave()
  }

  if (location.hostname === 'sc01ty.github.io')
    return (
      <Panel title="Play online">
        <p>Online rooms run on Scotty Systems.</p>
        <a className="btn btn--primary" href="https://scottysystems.it.com/rap-but-ranked/#/play">
          Open Rap But Ranked multiplayer
        </a>
      </Panel>
    )

  const configPanel = (
    <Panel title="Choose your shared track">
      <Field label="Track name">
        <input className="input" placeholder="Our track" maxLength={40} value={trackName} onChange={(e) => setTrackName(e.target.value)} />
      </Field>
      <Field label="Beat">
        <select aria-label="Beat" className="input select" value={beatId} onChange={(e) => setBeatId(e.target.value)}>
          {catalogue.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {Math.round(b.bpm)} BPM
            </option>
          ))}
        </select>
      </Field>
      <Field label="Topic">
        <input className="input" placeholder="What are you both rapping about?" maxLength={80} value={topic} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <Segmented
        label="Total length"
        value={length}
        onChange={setLength}
        options={([8, 16, 32] as TrackLength[]).map((n) => {
          const b = catalogue.find((x) => x.id === beatId)
          return { value: n, label: `${n} bars`, disabled: !!b && (n * 240) / b.bpm + b.introOffset > b.durationSec }
        })}
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
      <Button variant="primary" disabled={busy || !topic.trim() || !beatId} onClick={() => void safe(configure)}>
        Start shared track
      </Button>
    </Panel>
  )

  return (
    <div className="duo room">
      <Button variant="quiet" disabled={busy} onClick={() => void safe(leave)}>
        ← Singleplayer / Multiplayer
      </Button>
      {!s && <h1 className="room-title">{access ? 'YOUR LOBBY' : 'MULTIPLAYER'}</h1>}
      {error && <p role="alert">{error}</p>}
      {!access ? (
        <>
          <p>Two computers. One track. Create a room and send your mate the code.</p>
          <Field label="Your name">
            <input className="input" placeholder="Your name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="duo-summaries">
            <Panel title="Host a track">
              <p>You choose the beat and topic. You go first.</p>
              <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void safe(() => join('create'))}>
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
              <Button disabled={busy || !name.trim() || code.length !== 7} onClick={() => void safe(() => join('join'))}>
                Join lobby
              </Button>
            </Panel>
          </div>
        </>
      ) : !room ? (
        <p>Connecting to your lobby…</p>
      ) : (
        <>
          {!s ? (
            <Panel title="ROOM CODE">
              <div className="room-code" data-testid="room-code">
                {access.code}
              </div>
              <Button variant="quiet" onClick={() => void safe(async () => navigator.clipboard.writeText(access.code))}>
                Copy code
              </Button>
              <p>{memberLine(room)}</p>
            </Panel>
          ) : (
            <p className="room-bar">
              <span>
                ROOM <b data-testid="room-code">{access.code}</b>
              </span>
              <span>{memberLine(room)}</span>
            </p>
          )}
          {!s || newTrack ? (
            myPlayer === 0 ? (
              <>
                {configPanel}
                {newTrack && (
                  <Button variant="quiet" onClick={() => setNewTrack(false)}>
                    Back to the finished track
                  </Button>
                )}
              </>
            ) : (
              <p>The host is choosing your shared beat and topic.</p>
            )
          ) : (
            <>
              <header className="room-track">
                <h1 className="room-track__title">{s.trackName}</h1>
                <p>
                  {s.beatName} · {s.length} bars · <span className="duo-name duo-player--0">{s.players[0]}</span> × <span className="duo-name duo-player--1">{s.players[1]}</span>
                </p>
              </header>
              <TurnStrip s={s} current={turn?.index ?? null} me={myPlayer} />
              {redo ? (
                beat && (
                  <TurnStudio
                    key={`${s.id}:redo:${redo.index}`}
                    session={s}
                    turn={redo}
                    beat={beat}
                    busy={busy}
                    redo
                    onSubmit={(sub) => void safe(() => submitTurn(redo, sub))}
                    onActivity={reportActivity}
                    onCancel={() => setRedo(null)}
                  />
                )
              ) : s.status === 'complete' ? (
                <>
                  {saved ? (
                    <DuoView key={lastSaved.current} initial={saved} networkReadOnly />
                  ) : (
                    <p>
                      Downloading both vocals and saving your combined track… <Button onClick={() => void safe(() => saveCompleted(room))}>Retry saving</Button>
                    </p>
                  )}
                  <div className="room-actions">
                    {s.turns
                      .filter((t) => t.player === myPlayer)
                      .map((t) => (
                        <Button key={t.index} disabled={busy} onClick={() => setRedo(t)}>
                          Redo my section {t.index + 1}
                        </Button>
                      ))}
                    {myPlayer === 0 && (
                      <Button variant="primary" disabled={busy} onClick={() => setNewTrack(true)}>
                        New track in this room
                      </Button>
                    )}
                  </div>
                </>
              ) : turn ? (
                <>
                  <LastTurn s={s} before={turn.index} />
                  {turn.player === myPlayer ? (
                    beat ? (
                      <TurnStudio
                        key={`${s.id}:${turn.index}`}
                        session={s}
                        turn={turn}
                        beat={beat}
                        busy={busy}
                        onSubmit={(sub) => void safe(() => submitTurn(turn, sub))}
                        onActivity={reportActivity}
                      />
                    ) : (
                      <p>Loading the beat…</p>
                    )
                  ) : (
                    <Waiting s={s} turn={turn} me={myPlayer} activity={room.activity?.[mate] ?? null} online={!!room.members[mate]?.online} joined={!!room.members[mate]} />
                  )}
                </>
              ) : null}
              {s.status !== 'complete' && !redo && <StorySoFar s={s} />}
              <div className="room-voice">
                <span>
                  VOICE CHAT · {voiceStatus === 'failed' ? 'Could not connect. Try another network and re-enable voice.' : voiceStatus === 'off' ? 'off (optional)' : voiceStatus}
                </span>
                <Button disabled={busy} onClick={() => void safe(enableVoice)}>
                  {voice.current ? 'Reconnect voice' : 'Enable voice chat'}
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
            </>
          )}
          <p className="studio__hint">
            Take turns: whoever's up gets the studio, the other gets ready. Each of you records on your own computer; submitted takes are shared with the room for the finished mix. Wear headphones if voice chat is on. Rooms and server recordings expire after 24 hours; saved tracks stay in your browser.
          </p>
        </>
      )}
    </div>
  )
}

function memberLine(room: RoomState) {
  return room.members.map((m, i) => (m ? `${m.name} · ${m.online ? 'connected' : 'reconnecting'}` : `Waiting for player ${i + 1}`)).join(' / ')
}

/** Every section in order: who has it, which bars, and how it went. */
function TurnStrip({ s, current, me }: { s: DuoSession; current: number | null; me: 0 | 1 }) {
  return (
    <div className="duo-timeline" aria-label="Turn order">
      {s.turns.map((t) => (
        <div key={t.index} className={`duo-slot duo-player--${t.player}`} style={{ flex: t.barEnd - t.barStart }} data-state={t.take ? 'done' : t.index === current ? 'now' : 'next'}>
          <span>
            {s.players[t.player]}
            {t.player === me ? ' (you)' : ''}
          </span>
          <b>
            {t.barStart + 1}–{t.barEnd}
          </b>
          <small>{t.result ? `${t.result.rank} · ${t.result.score}` : t.index === current ? 'NOW' : 'NEXT'}</small>
        </div>
      ))}
    </div>
  )
}

/** The section that was just submitted: a quick score reveal both players see. */
function LastTurn({ s, before }: { s: DuoSession; before: number }) {
  const t = s.turns[before - 1]
  if (!t?.result) return null
  return (
    <section className={`turn-result duo-player--${t.player}`} key={t.take?.id} aria-label="Last turn result">
      <span className="eyebrow">
        {s.players[t.player]} · bars {t.barStart + 1}–{t.barEnd}
      </span>
      <b className="turn-result__rank" data-rank={t.result.rank}>
        {t.result.rank}
      </b>
      <span className="turn-result__score">{t.result.score}</span>
      <p>{t.result.feedback[0]}</p>
    </section>
  )
}

const DOING: Record<TurnActivity, string> = {
  writing: 'IS WRITING',
  previewing: 'IS RUNNING THE BEAT',
  recording: 'IS RAPPING',
  reviewing: 'IS CHECKING THE TAKE',
  submitting: 'IS LOCKING IT IN',
}

/** The other player's screen while it isn't their turn. */
function Waiting({ s, turn, me, activity, online, joined }: { s: DuoSession; turn: DuoTurn; me: 0 | 1; activity: { state: TurnActivity } | null; online: boolean; joined: boolean }) {
  const next = s.turns.find((t) => t.index > turn.index && t.player === me)
  const win = turnWindow(s, turn)
  const spb = 60 / s.beatGrid.bpm
  const where = (t: number) => barBeatLabel(t, s.beatGrid.introOffset, spb, s.beatGrid.beatsPerBar)
  const doing = !joined ? 'HASN’T JOINED YET' : !online ? 'IS RECONNECTING' : DOING[activity?.state ?? 'writing']
  return (
    <section className={`waiting duo-player--${turn.player} enter`} aria-label="Waiting for your turn" data-activity={activity?.state ?? 'writing'} style={{ '--i': 1 } as CSSProperties}>
      <span className="eyebrow">
        PLAYER {turn.player + 1} · {where(win.start)} → {endLabel(win.end, s.beatGrid.introOffset, spb, s.beatGrid.beatsPerBar)}
      </span>
      <h2 className="waiting__who">
        {activity?.state === 'recording' && <span className="waiting__live" aria-hidden />}
        {s.players[turn.player]} {doing}
      </h2>
      <p className="waiting__next">{next ? `GET READY FOR YOUR TURN · bars ${next.barStart + 1}–${next.barEnd}` : 'LAST SECTION — LISTEN FOR THE FINISH'}</p>
      <p className="waiting__challenge">
        <span className="eyebrow">Their challenge</span> {turn.challenge.prompt}
      </p>
      <aside className="waiting__tip">
        <span className="eyebrow">Small tip</span>
        <p>{waitingTip(s, turn.index)}</p>
      </aside>
    </section>
  )
}

function StorySoFar({ s }: { s: DuoSession }) {
  const done = s.turns.filter((t) => t.take)
  if (!done.length) return null
  return (
    <Panel title="The story so far">
      {done.map((t) => (
        <p key={t.index} className={`duo-player--${t.player} story-line`}>
          <b>{s.players[t.player]}</b>: {t.lyrics.join(' / ')}
        </p>
      ))}
    </Panel>
  )
}
