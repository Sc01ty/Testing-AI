import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { trackPlayer, useTrackPlayer } from '../audio/trackPlayer'
import { TakeRecorder } from '../audio/recordTake'
import { encodeWav } from '../audio/wav'
import { useMic } from '../audio/mic'
import { FreestyleRecorder } from '../freestyle/recorder'
import { BeatSelect } from '../components/beats/BeatSelect'
import { Panel, Field, Segmented, Button } from '../components/ui/ui'
import { VocalLane } from '../components/play/VocalLane'
import { useBeats } from '../storage/useBeats'
import { getBeat, getBeatAudio, saveTakeAudio } from '../storage'
import { lengthsFor } from '../play/sessionLogic'
import { rememberTake, takeSamples } from '../play/takeAudio'
import { finalResult } from '../scoring/round'
import {
  newDuo,
  activeTurns,
  duoChallenge,
  scoreDuoTurn,
  duoObservations,
  type DuoSession,
  type DuoTurn,
} from './session'
import { saveDuo, listDuos, getDuo } from './store'
import {localModel} from '../director/localModel'
import {settingsStore} from '../settings/settings'
import {AiStatus} from '../components/play/AiStatus'
import { duoMix, downloadDuo } from './audio'
import type { TrackLength } from '../domain/types'
import './duo.css'

export function DuoView({ initial, onLeave }: { initial?: DuoSession; onLeave?: () => void }) {
  const [s, setS] = useState<DuoSession | null>(initial ?? null)
  const [resume, setResume] = useState<DuoSession | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState<number | null>(null),
    [count, setCount] = useState<number | null>(null)
  const [phase, setPhase] = useState(''),
    [peaks, setPeaks] = useState<number[] | null>(null)
  const recorder = useRef<FreestyleRecorder | TakeRecorder | null>(null)
  const mic = useMic(),
    tp = useTrackPlayer()
  useEffect(() => {
    void localModel.detect().then(()=>{if(settingsStore.get().aiMode==='local' && localModel.getState().status==='cached')void localModel.load()})
    if(!initial){const id=sessionStorage.getItem('rbr.duoOpen');if(id)void getDuo(id).then(saved=>{if(saved)setS(saved)})}
    if (!initial)
      void listDuos().then((all) =>
        setResume(
          all
            .filter((x) => x.status === 'preparing')
            .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
        ),
      )
    return () => {
      recorder.current?.cancel()
      trackPlayer.stop()
    }
  }, [])
  const persist = async (next: DuoSession) => {
    setS(next)
    try {
      if(!initial)sessionStorage.setItem('rbr.duoOpen',next.id)
      await saveDuo(next)
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }
  const safe = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setTime(null)
      setCount(null)
      setPhase('')
    }
  }
  const prepare = async () => {
    if (!s) return
    const i = s.turns.findIndex((t) => !t.ready),
      turn = s.turns[i]
    if (!turn || turn.lyrics.some((l) => !l.trim())) return
    let next = {
      ...s,
      turns: s.turns.map((t) => (t.index === i ? { ...t, ready: true } : t)),
      storyDirection: s.turns
        .slice(0, i + 1)
        .map((t) => `${s.players[t.player]}: ${t.lyrics.join(' ')}`)
        .join(' ')
        .slice(-700),
    }
    if (i + 1 < s.turns.length) {
      const challenge = await duoChallenge(next, i + 1)
      next = {
        ...next,
        turns: next.turns.map((t) => (t.index === i + 1 ? { ...t, challenge } : t)),
      }
    }
    await persist(next)
  }
  const perform = async () => {
    if (!s) return
    const r = new FreestyleRecorder()
    recorder.current = r
    const spb = 60 / s.beatGrid.bpm,
      origin = s.beatGrid.introOffset
    const rec = await r.record(
      {
        beat: { id: s.beatId, getBlob: () => getBeatAudio(s.beatId) },
        loop: { start: origin, end: s.turns.at(-1)!.end },
        bars: s.length,
        secondsPerBeat: spb,
        beatsPerBar: s.beatGrid.beatsPerBar,
      },
      {
        onTime: (t) => setTime(origin + t),
        onCount: setCount,
        onPhase: setPhase,
        onLive: setPeaks,
      },
    )
    if (!rec) return
    const id = `${s.id}:master:${Date.now()}`
    await saveTakeAudio(id, s.id, encodeWav([rec.samples], rec.sampleRate))
    rememberTake(id, rec)
    const startTime = origin + rec.startTime
    const master = {
      id,
      beatId: s.beatId,
      barStart: 0,
      barCount: s.length,
      beatTimeSec: startTime,
      sectionStartSec: origin,
      sectionEndSec: s.turns.at(-1)!.end,
      durationSec: rec.durationSec,
      sampleRate: rec.sampleRate,
      latencySec: rec.latencySec,
      inputPeak: rec.inputPeak,
      peaks: rec.peaks,
      recordedAt: Date.now(),
    }
    const next = {
      ...s,
      status: 'complete' as const,
      master,
      turns: s.turns.map((t) => ({
        ...t,
        take: null,
        captureId: id,
        result: scoreDuoTurn(s, t, { samples: rec.samples, sampleRate: rec.sampleRate, startTime }),
      })),
    }
    await persist(next)
  }
  const retake = async (t: DuoTurn) => {
    if (!s) return
    const r = new TakeRecorder()
    recorder.current = r
    audio.unlock()
    const ctx = audio.context
    if (!ctx) throw new Error('Audio unavailable')
    const m = await duoMix(s, ctx)
    const rec = await r.record(
      {
        beat: { id: s.beatId, getBlob: () => getBeatAudio(s.beatId) },
        sectionStart: t.start + t.vocalOffset,
        sectionEnd: t.end,
        secondsPerBeat: 60 / s.beatGrid.bpm,
        beatsPerBar: s.beatGrid.beatsPerBar,
        gridOrigin: s.beatGrid.introOffset,
        leadIn: m.clips,
      },
      { onCount: setCount, onPhase: setPhase, onLive: (p) => setPeaks(p) },
    )
    if (!rec) return
    const id = `${s.id}:turn:${t.index}:${Date.now()}`
    await saveTakeAudio(id, s.id, encodeWav([rec.samples], rec.sampleRate))
    rememberTake(id, rec)
    const take = {
      id,
      beatId: s.beatId,
      barStart: t.barStart,
      barCount: t.barEnd - t.barStart,
      beatTimeSec: rec.beatTimeSec,
      sectionStartSec: t.start,
      sectionEndSec: t.end,
      durationSec: rec.durationSec,
      sampleRate: rec.sampleRate,
      latencySec: rec.latencySec,
      inputPeak: rec.inputPeak,
      peaks: rec.peaks,
      recordedAt: Date.now(),
    }
    await persist({
      ...s,
      turns: s.turns.map((x) =>
        x.index === t.index
          ? {
              ...x,
              take,
              captureId: id,
              result: scoreDuoTurn(s, t, {
                samples: rec.samples,
                sampleRate: rec.sampleRate,
                startTime: rec.beatTimeSec,
              }),
            }
          : x,
      ),
    })
  }
  const play = async () => {
    if (!s) return
    if (tp.playing) return trackPlayer.stop()
    audio.unlock()
    if (!audio.context) return
    const m = await duoMix(s, audio.context)
    await trackPlayer.play(`duo:${s.id}`, m.beatBuffer, m.clips, m.from, m.to)
  }
  if (!s)
    return (
      <>
        {onLeave && (
          <Button variant="quiet" onClick={onLeave}>
            ← Singleplayer / Multiplayer
          </Button>
        )}
        <DuoSetup
          resume={resume}
          onResume={() => {
            if (resume) sessionStorage.setItem('rbr.duoOpen', resume.id)
            setS(resume)
          }}
          onStart={(values) =>
            void safe(async () => {
              const beat = await getBeat(values.beatId)
              if (!beat) throw new Error('Select a beat')
              const next = newDuo({ ...values, beat })
              next.turns[0].challenge = await duoChallenge(next, 0)
              await persist(next)
            })
          }
          busy={busy}
          error={error}
        />
      </>
    )
  const turn = s.turns.find((t) => !t.ready),
    allReady = !turn
  const active = time === null ? [] : activeTurns(s, time)
  const next = time === null ? null : s.turns.find((t) => t.start + t.vocalOffset > time)
  const results = s.turns.flatMap((t) => (t.result ? [t.result] : [])),
    final = finalResult(results)
  const live = time !== null || count !== null || phase === 'preparing' || phase === 'recording'
  return (
    <div className="duo">
      <div className="play-session__bar">
        <b>{s.trackName}</b>
        <span>
          {s.players.join(' × ')} · {s.beatName} · {s.style === 'standard' ? '4' : '2'} bars each
        </span>
        {onLeave && (
          <Button variant="quiet" disabled={busy} onClick={onLeave}>
            Back to modes
          </Button>
        )}
        {!initial && s.status==='complete' && <Button variant="quiet" disabled={busy} onClick={()=>{sessionStorage.removeItem('rbr.duoOpen');setS(null);setResume(null)}}>New duo track</Button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {live ? (
        <section className="duo-live" aria-label="Performance mode">
          <p className="eyebrow">
            PERFORMANCE MODE · {phase} · MIC {mic.status === 'ready' ? 'LIVE' : mic.status}
          </p>
          {count !== null ? (
            <div className="countdown">{count}</div>
          ) : (
            <>
              <h2>{active.map((t) => s.players[t.player]).join(' + ') || 'GET READY'}</h2>
              <p>{active.map((t) => `PLAYER ${t.player + 1} — NOW`).join(' · ')}</p>
              <p className="duo-next">
                {next
                  ? `${s.players[next.player]} IN ${Math.max(1, Math.ceil((next.start + next.vocalOffset - (time ?? 0)) / ((60 / s.beatGrid.bpm) * s.beatGrid.beatsPerBar)))} BAR(S)`
                  : 'BRING IT HOME'}
              </p>
              {active.map((t) => (
                <p key={t.index}>{t.lyrics.join(' / ')}</p>
              ))}
            </>
          )}
          <VocalLane
            peaks={peaks}
            from={s.turns[0].start}
            to={s.turns.at(-1)!.end}
            viewFrom={s.turns[0].start}
            viewTo={s.turns.at(-1)!.end}
            recording
          />
          <Button variant="quiet" onClick={() => recorder.current?.cancel()}>
            Cancel performance
          </Button>
        </section>
      ) : s.status === 'preparing' ? (
        <>
          <DuoTimeline s={s} />
          {turn ? (
            <Panel
              title={`PLAYER ${turn.player + 1} · ${s.players[turn.player]} · bars ${turn.barStart + 1}–${turn.barEnd}`}
              className={`duo-player duo-player--${turn.player}`}
            >
              <p className="duo-challenge">{turn.challenge.prompt}</p>
              <p className="eyebrow">
                {turn.challenge.source === 'local-ai' ? 'LOCAL AI DIRECTOR' : 'BASIC DIRECTOR'} ·{' '}
                {turn.index + 1}/{s.turns.length} SECTIONS
              </p>
              {turn.lyrics.map((line, i) => (
                <Field key={i} label={`Bar ${i + 1}`}>
                  <input
                    className="input"
                    maxLength={240}
                    value={line}
                    disabled={busy}
                    onChange={(e) => {
                      const lyrics = [...turn.lyrics]
                      lyrics[i] = e.target.value
                      void persist({
                        ...s,
                        turns: s.turns.map((t) => (t.index === turn.index ? { ...t, lyrics } : t)),
                      }).catch(()=>undefined)
                    }}
                  />
                </Field>
              ))}
              <AiStatus compact/>
              <Button
                variant="primary"
                disabled={busy || turn.lyrics.some((l) => !l.trim())}
                onClick={() => void safe(prepare)}
              >
                {busy ? 'Directing…' : 'Lock section & direct next player'}
              </Button>
            </Panel>
          ) : (
            <Panel title="Both players ready">
              <p>
                Your lyrics are prepared. One count-in, one continuous beat. Names change; the music
                keeps going.
              </p>
              <Button
                variant="primary"
                disabled={busy || !allReady}
                onClick={() => void safe(perform)}
              >
                Start performance
              </Button>
            </Panel>
          )}
          <p className="studio__hint">
            Headphones on. One shared mic captures both voices; overlap cannot be scored per voice.
          </p>
        </>
      ) : (
        <>
          <section className="complete__hero">
            <div>
              <p className="eyebrow">MULTIPLAYER · TRACK COMPLETE</p>
              <h2 className="complete__name">{s.trackName}</h2>
            </div>
            <div className="complete__final">
              <span>
                COMBINED TRACK SCORE <b>{final.score}</b>
              </span>
              <span className={`rank-letter rank-letter--${final.rank}`}>{final.rank}</span>
            </div>
          </section>
          <DuoTimeline s={s} />
          <div className="complete__actions">
            <Button variant="primary" disabled={busy} onClick={() => void safe(play)}>
              {tp.playing ? 'Stop' : 'Play duo track'}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void safe(async () => {
                  await downloadDuo(s)
                })
              }
            >
              Download WAV
            </Button>
            <Button disabled={busy} onClick={() => void safe(perform)}>
              Perform whole track again
            </Button>
          </div>
          <div className="duo-summaries">
            {s.players.map((name, p) => {
              const own = s.turns.filter((t) => t.player === p && t.result)
              const result = finalResult(own.map((t) => t.result!))
              return (
                <Panel
                  key={p}
                  title={`PLAYER ${p + 1} · ${name}`}
                  className={`duo-player duo-player--${p}`}
                >
                  <p>
                    Writing {result.writing ?? '—'} · Performance{' '}
                    {result.performance ?? 'not attributed'} · {result.rank}
                  </p>
                  <p>{own[0]?.result?.feedback.join(' ')}</p>
                </Panel>
              )
            })}
          </div>
          <Panel title="Shared story · evidence">
            <ul>
              {duoObservations(s).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Panel>
          <p className="studio__hint">
            The final rank averages measured round feedback. Writing is judged from typed lyrics.
            Overlapping shared-mic sections have no individual performance score. For an overlap
            retake, both players repeat the overlapping words in that fixed slot; the mic cannot
            extract one voice from the original.
          </p>
          {s.turns.map((t) => (
            <Panel
              key={t.index}
              title={`${s.players[t.player]} · bars ${t.barStart + 1}–${t.barEnd}`}
              className={`duo-player duo-player--${t.player}`}
            >
              <p>{t.challenge.prompt}</p>
              <ol>
                {t.lyrics.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
              <p>{t.result?.feedback.join(' ')}</p>
              <Button disabled={busy} onClick={() => void safe(() => retake(t))}>
                Retake slot {t.index + 1}
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  void safe(async () => {
                    const data = await takeSamples((t.take ?? s.master)!.id)
                    if (data)
                      await persist({
                        ...s,
                        turns: s.turns.map((x) =>
                          x.index === t.index
                            ? {
                                ...x,
                                result: scoreDuoTurn(s, t, {
                                  ...data,
                                  startTime: (t.take ?? s.master)!.beatTimeSec,
                                }),
                              }
                            : x,
                        ),
                      })
                  })
                }
              >
                Inspect writing & timing
              </Button>
              {t.boundary === 'overlap' && (
                <p className="duo-overlap">OVERLAP · enters one beat early</p>
              )}
            </Panel>
          ))}
        </>
      )}
    </div>
  )
}

function DuoTimeline({ s }: { s: DuoSession }) {
  return (
    <div className="duo-timeline" aria-label="Shared song timeline">
      {s.turns.map((t) => (
        <div
          key={t.index}
          className={`duo-slot duo-player--${t.player}`}
          data-overlap={t.boundary === 'overlap'}
          style={{ flex: t.barEnd - t.barStart }}
        >
          <span>
            PLAYER {t.player + 1} · {s.players[t.player]}
          </span>
          <b>
            {t.barStart + 1}–{t.barEnd}
          </b>
          {t.boundary === 'overlap' && <small>↔ 1 BEAT OVERLAP</small>}
          <small>{t.ready ? 'READY' : 'WRITE'}</small>
        </div>
      ))}
    </div>
  )
}

function DuoSetup({
  resume,
  onResume,
  onStart,
  busy,
  error,
}: {
  resume: DuoSession | null
  onResume: () => void
  onStart: (v: {
    players: [string, string]
    trackName: string
    beatId: string
    topic: string
    length: TrackLength
    style: DuoSession['style']
    boundary: DuoTurn['boundary']
  }) => void
  busy: boolean
  error: string | null
}) {
  const { beats } = useBeats()
  const [players, setPlayers] = useState<[string, string]>(['', '']),
    [trackName, setName] = useState(''),
    [beatId, setBeat] = useState(''),
    [topic, setTopic] = useState(''),
    [length, setLength] = useState<TrackLength>(16),
    [style, setStyle] = useState<DuoSession['style']>('standard'),
    [boundary, setBoundary] = useState<DuoTurn['boundary']>('clean')
  const beat = beats?.find((b) => b.id === beatId),
    allowed = beat ? lengthsFor(beat) : []
  useEffect(() => {
    if (allowed.length && !allowed.includes(length)) setLength(allowed.at(-1)!)
  }, [beatId, allowed.join(',')])
  return (
    <div className="duo-setup">
      <p className="eyebrow">LOCAL MULTIPLAYER · TWO PLAYERS · ONE COMPUTER</p>
      {resume && <Button onClick={onResume}>Continue {resume.trackName}</Button>}
      <div className="duo-summaries">
        {players.map((p, i) => (
          <Field key={i} label={`Player ${i + 1}`}>
            <input
              className={`input duo-player--${i}`}
              placeholder={`Player ${i + 1} name`}
              maxLength={30}
              value={p}
              onChange={(e) => {
                const next = [...players] as [string, string]
                next[i] = e.target.value
                setPlayers(next)
              }}
            />
          </Field>
        ))}
      </div>
      <Field label="Track name">
        <input
          className="input"
          value={trackName}
          placeholder="Our track"
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Beat">
        <BeatSelect value={beatId || undefined} onChange={setBeat} />
      </Field>
      <Field label="Topic">
        <input
          className="input"
          value={topic}
          placeholder="What are you both rapping about?"
          maxLength={80}
          onChange={(e) => setTopic(e.target.value)}
        />
      </Field>
      <Field label="Total length">
        <Segmented
          label="Total length"
          value={length}
          onChange={setLength}
          options={([8, 16, 32] as TrackLength[]).map((n) => ({
            value: n,
            label: `${n} bars`,
            disabled: !allowed.includes(n),
          }))}
        />
      </Field>
      <Field label="Turn style">
        <Segmented
          label="Turn style"
          value={style}
          onChange={setStyle}
          options={[
            { value: 'standard', label: 'Standard · 4 bars each' },
            { value: 'quick', label: 'Quick Trade · 2 bars each' },
          ]}
        />
      </Field>
      <Field label="Handoff">
        <Segmented
          label="Handoff"
          value={boundary}
          onChange={setBoundary}
          options={[
            { value: 'clean', label: 'Clean' },
            { value: 'overlap', label: 'Overlap · 1 beat early' },
          ]}
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="primary"
        disabled={
          busy ||
          !beat ||
          !allowed.includes(length) ||
          !topic.trim() ||
          players.some((p) => !p.trim())
        }
        onClick={() => onStart({ players, trackName, beatId, topic, length, style, boundary })}
      >
        Prepare duo track
      </Button>
    </div>
  )
}
