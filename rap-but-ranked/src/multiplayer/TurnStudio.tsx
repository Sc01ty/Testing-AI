import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { beatPlayer, useBeatPlayer, type PlayableBeat } from '../audio/BeatPlayer'
import { RecordError, TakeRecorder, type RecordPhase } from '../audio/recordTake'
import { trackPlayer, useTrackPlayer } from '../audio/trackPlayer'
import { encodeWav } from '../audio/wav'
import type { BeatMeta, TakeMeta } from '../domain/types'
import { formatTime } from '../lib/format'
import { lineSyllables } from '../lyrics/text'
import { barBeatLabel, endLabel, lengthLabel, type SectionWindow } from '../play/sectionWindow'
import { forgetTake, rememberTake } from '../play/takeAudio'
import { arrangedClips } from '../play/vocals'
import { useSettings } from '../settings/useSettings'
import { deleteTakeAudio, getBeatAudio, saveTakeAudio } from '../storage'
import { Waveform } from '../components/beats/Waveform'
import { Icon } from '../components/beats/icons'
import { VocalLane } from '../components/play/VocalLane'
import { SectionEditor } from '../components/play/SectionEditor'
import type { TurnActivity } from './roomClient'
import { turnWindow, turnZone, type DuoSession, type DuoTurn } from './session'

export interface TurnSubmission {
  lyrics: string[]
  section: SectionWindow
  take: TakeMeta
}

const PLAYER_COLORS = ['#b58cff', '#65dbe9']

interface Draft {
  lyrics: string[]
  section: SectionWindow | null
  take: TakeMeta | null
}

const draftKey = (s: DuoSession, t: DuoTurn) => `rbr.turnDraft:${s.id}:${t.index}`
function loadDraft(s: DuoSession, t: DuoTurn): Draft {
  try {
    const d = JSON.parse(sessionStorage.getItem(draftKey(s, t)) ?? 'null') as Draft | null
    if (d && d.lyrics?.length === t.lyrics.length) return d
  } catch {
    /* no saved draft */
  }
  // a redo of a finished section starts from what was submitted
  return { lyrics: t.lyrics.map((l) => l ?? ''), section: t.section ?? null, take: null }
}
export function clearTurnDraft(s: DuoSession, t: DuoTurn) {
  try {
    sessionStorage.removeItem(draftKey(s, t))
  } catch {
    /* ignore */
  }
}

/**
 * Your turn in an online room: the singleplayer studio for your own bars.
 * Write, place START / END inside your section, preview, record, play back,
 * retake, then submit — your mate watches a "get ready" screen meanwhile.
 */
export function TurnStudio({
  session,
  turn,
  beat,
  busy,
  redo = false,
  hearPrevious = true,
  onSubmit,
  onActivity,
  onCancel,
}: {
  session: DuoSession
  turn: DuoTurn
  beat: Pick<BeatMeta, 'id' | 'peaks' | 'durationSec' | 'bpm' | 'introOffset' | 'beatsPerBar'>
  busy: boolean
  redo?: boolean
  /** Relay: the previous section leads into your count-in and playback. Parallel: off — no spoilers before the finished song. */
  hearPrevious?: boolean
  onSubmit: (s: TurnSubmission) => void
  onActivity: (a: TurnActivity) => void
  onCancel?: () => void
}) {
  const [draft, setDraftState] = useState<Draft>(() => loadDraft(session, turn))
  const setDraft = (fn: (d: Draft) => Draft) =>
    setDraftState((d) => {
      const next = fn(d)
      try {
        sessionStorage.setItem(draftKey(session, turn), JSON.stringify(next))
      } catch {
        /* storage full or blocked: the draft just won't survive a refresh */
      }
      return next
    })
  const grid = session.beatGrid
  const spb = 60 / grid.bpm
  const bar = spb * grid.beatsPerBar
  const zone = useMemo(() => turnZone(session, turn), [session, turn])
  const win = useMemo(() => turnWindow(session, { ...turn, section: draft.section }), [session, turn, draft.section])
  const viewFrom = Math.max(0, zone.min - bar)
  const viewTo = Math.min(beat.durationSec, zone.max + spb)
  const playable: PlayableBeat = useMemo(() => ({ id: session.beatId, getBlob: () => getBeatAudio(session.beatId) }), [session.beatId])
  const player = useBeatPlayer()
  const tp = useTrackPlayer()
  const [settings, setSettings] = useSettings()
  const clickGrid = useMemo(() => ({ origin: grid.introOffset, secondsPerBeat: spb, beatsPerBar: grid.beatsPerBar }), [grid.introOffset, spb, grid.beatsPerBar])
  const prev = session.turns[turn.index - 1]
  const prevTake = (hearPrevious && prev?.take) || null
  const recorder = useRef<TakeRecorder | null>(null)
  const [phase, setPhase] = useState<RecordPhase | 'idle'>('idle')
  const [count, setCount] = useState<number | null>(null)
  const [live, setLive] = useState<{ peaks: number[]; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recording = phase !== 'idle'
  const previewing = player.playing && player.beatId === session.beatId
  const take = draft.take
  const playingBack = tp.playing && tp.id === `turn:${take?.id}`
  const stale = !!take && (Math.abs(take.sectionStartSec - win.start) > 1e-3 || Math.abs(take.sectionEndSec - win.end) > 1e-3)
  const where = (t: number) => barBeatLabel(t, grid.introOffset, spb, grid.beatsPerBar)
  const whereEnd = (t: number) => endLabel(t, grid.introOffset, spb, grid.beatsPerBar)
  const color = PLAYER_COLORS[turn.player]

  // tell the room what you're doing, so your mate's screen can say it
  const activity: TurnActivity = recording ? (take ? 'retaking' : 'recording') : previewing || playingBack ? 'previewing' : take ? 'reviewing' : 'writing'
  useEffect(() => {
    if (!busy) onActivity(activity)
  }, [activity, busy, onActivity])

  useEffect(
    () => () => {
      recorder.current?.cancel()
      beatPlayer.stop()
      trackPlayer.stop()
    },
    [],
  )

  const setLine = (i: number, text: string) => setDraft((d) => ({ ...d, lyrics: d.lyrics.map((l, j) => (j === i ? text : l)) }))
  const moveSection = (w: SectionWindow) => {
    if (previewing) beatPlayer.stop()
    setDraft((d) => ({ ...d, section: w }))
  }

  const preview = () => {
    trackPlayer.stop()
    if (previewing) beatPlayer.stop()
    else void beatPlayer.play(playable, { from: win.start, to: win.end, loop: settings.previewLoop, grid: clickGrid })
  }

  const record = useCallback(async () => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    setError(null)
    beatPlayer.stop()
    trackPlayer.stop()
    const rec = new TakeRecorder()
    recorder.current = rec
    try {
      audio.unlock()
      const ctx = audio.context
      // your mate's last bars play through the count-in, so you come in off their handoff
      const leadIn = settings.hearLastTake && prevTake && ctx ? await arrangedClips(ctx, [prevTake]).catch(() => []) : []
      const r = await rec.record(
        { beat: playable, sectionStart: win.start, sectionEnd: win.end, secondsPerBeat: spb, beatsPerBar: grid.beatsPerBar, gridOrigin: grid.introOffset, leadIn },
        {
          onPhase: (p) => {
            setPhase(p)
            if (p === 'recording') audio.play('move')
          },
          onCount: setCount,
          onLive: (peaks, progress) => setLive({ peaks, progress }),
        },
      )
      if (!r) return
      const id = `${session.id}:turn${turn.index}:${Date.now()}`
      rememberTake(id, { samples: r.samples, sampleRate: r.sampleRate })
      await saveTakeAudio(id, session.id, encodeWav([r.samples], r.sampleRate))
      const old = draft.take?.id
      if (old) {
        forgetTake(old)
        void deleteTakeAudio(old)
      }
      setDraft((d) => ({
        ...d,
        section: win,
        take: {
          id,
          beatId: session.beatId,
          barStart: Math.floor((win.start - grid.introOffset) / bar + 1e-6),
          barCount: Math.round((win.end - win.start) / bar),
          beatTimeSec: r.beatTimeSec,
          sectionStartSec: r.sectionStart,
          sectionEndSec: r.sectionEnd,
          durationSec: r.durationSec,
          sampleRate: r.sampleRate,
          latencySec: r.latencySec,
          inputPeak: r.inputPeak,
          peaks: r.peaks,
          recordedAt: Date.now(),
        },
      }))
      if (r.inputPeak < 0.01) setError("That take is almost silent — the mic didn't pick you up. Check your input in Settings.")
    } catch (e) {
      audio.play('error')
      setError(e instanceof RecordError ? e.message : `Recording failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      recorder.current = null
      setPhase('idle')
      setCount(null)
      setLive(null)
    }
  }, [recording, playable, win, spb, bar, grid, session.id, session.beatId, turn.index, draft.take, settings.hearLastTake, prevTake])

  const playback = async () => {
    if (!take) return
    if (playingBack) return trackPlayer.stop()
    beatPlayer.stop()
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    const takes = prevTake ? [prevTake, take] : [take]
    const [beatBuf, clips] = await Promise.all([beatPlayer.loadBuffer(playable), arrangedClips(ctx, takes)])
    if (!clips.some((c) => c.id === take.id)) return setError('This take could not be loaded.')
    await trackPlayer.play(`turn:${take.id}`, beatBuf, clips, Math.max(0, win.start - (prevTake ? bar : spb)), Math.min(beat.durationSec, win.end + spb * 0.5))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && recorder.current) {
        e.preventDefault()
        e.stopImmediatePropagation()
        recorder.current.cancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const written = draft.lyrics.every((l) => l.trim())
  const canSubmit = written && !!take && !recording && !stale && !busy
  const position = useCallback(() => (playingBack ? trackPlayer.position(`turn:${take?.id}`) : beatPlayer.position(session.beatId)), [playingBack, take?.id, session.beatId])
  const relPosition = useCallback(() => {
    const p = position()
    return p === null ? null : p - viewFrom
  }, [position, viewFrom])
  const peaksWindow = useMemo(() => {
    const n = beat.peaks.length
    return beat.peaks.slice(Math.floor((viewFrom / beat.durationSec) * n), Math.ceil((viewTo / beat.durationSec) * n))
  }, [beat.peaks, beat.durationSec, viewFrom, viewTo])
  const firstBarInView = Math.floor((viewFrom - grid.introOffset) / bar + 1e-6)
  const gridOffset = grid.introOffset + firstBarInView * bar - viewFrom

  return (
    <div className="studio turn-studio" style={{ '--duo-color': color } as CSSProperties} data-testid="turn-studio">
      <section className="challenge enter" style={{ '--i': 1 } as CSSProperties} key={turn.index}>
        <span className="eyebrow">
          <span className="turn-you">YOUR TURN</span> · {session.players[turn.player]} · section {turn.index + 1} / {session.turns.length} · {where(zone.min)} → {whereEnd(zone.max)}
          <span className={`source-tag source-tag--${turn.challenge.source}`}>{turn.challenge.source === 'local-ai' ? 'Rap AI' : 'Basic director'}</span>
        </span>
        <h2 className="challenge__prompt">{turn.challenge.prompt}</h2>
        {redo && <p className="studio__hint">Redoing your finished section. Your mate keeps theirs; only this slot is replaced.</p>}
      </section>

      <section className="bars enter" style={{ '--i': 2 } as CSSProperties}>
        {draft.lyrics.map((line, i) => (
          <label key={i} className="bar-line">
            <span className="bar-line__n">{turn.barStart + i + 1}</span>
            <input
              className="bar-line__input"
              value={line}
              placeholder={i === draft.lyrics.length - 1 ? 'Last bar — land it' : `Bar ${i + 1} — your words`}
              maxLength={140}
              onChange={(e) => setLine(i, e.target.value)}
              aria-label={`Bar ${i + 1}`}
              disabled={recording || busy}
            />
            <span className="bar-line__syll" title="Approximate syllables">
              {lineSyllables(line) || ''}
            </span>
          </label>
        ))}
      </section>

      <section className="timeline enter" style={{ '--i': 3 } as CSSProperties} data-recording={recording ? '' : undefined}>
        <div className="timeline__lane timeline__lane--beat">
          <span className="timeline__label">Beat</span>
          <div className="timeline__wave">
            <Waveform
              peaks={peaksWindow}
              duration={viewTo - viewFrom}
              height={86}
              bpm={grid.bpm}
              beatsPerBar={grid.beatsPerBar}
              offset={gridOffset}
              dimIntro={false}
              barNumbers
              barNumberStart={firstBarInView + 1}
              highlight={[win.start - viewFrom, win.end - viewFrom]}
              position={relPosition}
              animate={previewing || playingBack}
              label="Beat waveform around your section"
            />
            <SectionEditor
              zone={zone}
              value={win}
              onChange={moveSection}
              viewFrom={viewFrom}
              viewTo={viewTo}
              secondsPerBar={bar}
              beatsPerBar={grid.beatsPerBar}
              disabled={recording || busy}
              accent={color}
            />
          </div>
        </div>
        <div className="timeline__lane">
          <span className="timeline__label">You</span>
          <VocalLane
            peaks={live ? live.peaks : (take?.peaks ?? null)}
            from={live ? win.start - spb : (take?.beatTimeSec ?? win.start - spb)}
            to={live ? win.end + 0.45 : take ? take.beatTimeSec + take.durationSec : win.end + 0.45}
            viewFrom={viewFrom}
            viewTo={viewTo}
            recording={!!live}
            progress={live?.progress}
            position={playingBack ? position : undefined}
            animate={playingBack}
          />
          {!take && !live && <span className="timeline__empty">Your take appears here</span>}
        </div>
        {count !== null && (
          <div className="countdown" key={count} aria-live="assertive">
            {count}
          </div>
        )}
        {phase === 'recording' && count === null && <div className="rec-dot">REC</div>}
      </section>

      <p className="studio__section enter" style={{ '--i': 4 } as CSSProperties}>
        <span>
          START <b>{where(win.start)}</b> · END <b>{whereEnd(win.end)}</b> · <b>{lengthLabel(win, bar)}</b> ({lengthLabel({ start: 0, end: zone.maxLen }, bar)} max — the next section is your mate’s)
        </span>
        <span>{stale ? <span data-stale="">Section moved — record again to fit it.</span> : 'Drag START / END to trim or slide your bars.'}</span>
      </p>

      <section className="transport enter" style={{ '--i': 5 } as CSSProperties}>
        <span className="tgroup">
          <button className="tbtn" onClick={preview} disabled={recording || busy} aria-pressed={previewing}>
            <Icon name={previewing ? 'pause' : 'play'} size={16} /> {previewing ? 'Stop' : 'Preview bars'}
          </button>
          <button
            className="ibtn"
            onClick={() => {
              audio.play('toggle')
              setSettings({ previewLoop: !settings.previewLoop })
              if (previewing) beatPlayer.setLoop(!settings.previewLoop)
            }}
            disabled={recording}
            aria-pressed={settings.previewLoop}
            aria-label="Loop preview"
          >
            <Icon name="loop" size={16} />
          </button>
          <button className="ibtn" onClick={() => (audio.play('toggle'), setSettings({ metronome: !settings.metronome }))} aria-pressed={settings.metronome} aria-label="Metronome">
            <Icon name="metronome" size={16} />
          </button>
        </span>
        <button className="tbtn tbtn--rec" onClick={() => void record()} disabled={busy} data-active={recording ? '' : undefined} aria-label={recording ? 'Stop recording' : take ? 'Record again' : 'Record'}>
          <span className="tbtn__rec-dot" />
          {phase === 'preparing' ? 'Getting ready…' : phase === 'countin' ? 'Count-in…' : phase === 'recording' ? 'Stop' : take ? 'Retake' : 'Record'}
        </button>
        {take && !recording && (
          <button className="tbtn" onClick={() => void playback()} aria-pressed={playingBack} disabled={busy}>
            <Icon name={playingBack ? 'pause' : 'play'} size={16} /> {playingBack ? 'Stop' : 'Play back'}
          </button>
        )}
        {onCancel && (
          <button className="btn btn--ghost" onClick={onCancel} disabled={recording || busy}>
            <span>Cancel</span>
          </button>
        )}
        <button
          className="btn btn--primary transport__submit"
          disabled={!canSubmit}
          onClick={() => {
            trackPlayer.stop()
            beatPlayer.stop()
            audio.play('confirm')
            onSubmit({ lyrics: draft.lyrics.map((l) => l.trim()), section: win, take: take! })
          }}
        >
          <span>{busy ? 'Sending…' : 'Submit turn'}</span>
        </button>
      </section>

      <p className="studio__hint enter" style={{ '--i': 6 } as CSSProperties} role={error ? 'alert' : undefined}>
        {error ??
          (!written
            ? `Write all ${draft.lyrics.length} bars, then record them.`
            : !take
              ? `🎧 Headphones on, then Record — a bar of count-in${prevTake && settings.hearLastTake ? ` over ${session.players[prev!.player]}'s last bars` : ''}, then rap from ${where(win.start)} until ${whereEnd(win.end)}. It stops by itself.`
              : stale
                ? 'You moved the section since this take. Record again so it lands between START and END.'
                : `Take ready (${formatTime(take.durationSec)}). Play it back, retake, or submit — then it's your mate's go.`)}
      </p>
    </div>
  )
}
