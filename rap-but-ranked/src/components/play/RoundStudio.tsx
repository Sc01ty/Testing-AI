import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { beatPlayer, useBeatPlayer, type PlayableBeat } from '../../audio/BeatPlayer'
import { mic, useMic } from '../../audio/mic'
import { vocalGain } from '../../audio/mix'
import { RecordError, TakeRecorder, type RecordPhase } from '../../audio/recordTake'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import { encodeWav } from '../../audio/wav'
import type { Round, SavedBeat, Session } from '../../domain/types'
import { formatTime } from '../../lib/format'
import { lineSyllables } from '../../lyrics/text'
import { barsDone, runningScore, sectionFor, totalRounds } from '../../play/sessionLogic'
import { forgetTake, rememberTake, takeBuffer } from '../../play/takeAudio'
import { deleteTakeAudio, getBeatAudio, saveTakeAudio } from '../../storage'
import { Waveform } from '../beats/Waveform'
import { Icon } from '../beats/icons'
import { VocalLane } from './VocalLane'

/**
 * One round: read the challenge, write two bars, preview the exact two bars
 * of the beat, record over them, listen back, then submit.
 */
export function RoundStudio({
  session,
  round,
  beat,
  update,
  onSubmit,
  onHelp,
}: {
  session: Session
  round: Round
  beat: SavedBeat
  update: (fn: (s: Session) => Session, opts?: { debounce?: boolean }) => void
  onSubmit: () => void
  onHelp: () => void
}) {
  const sec = useMemo(() => sectionFor(beat, round.index), [beat, round.index])
  const spb = sec.grid.secondsPerBeat
  const viewFrom = Math.max(0, sec.start - sec.grid.secondsPerBar)
  const viewTo = Math.min(beat.durationSec, sec.end + spb)
  const playable: PlayableBeat = useMemo(() => ({ id: beat.id, getBlob: () => getBeatAudio(beat.id) }), [beat.id])
  const player = useBeatPlayer()
  const tp = useTrackPlayer()
  const micState = useMic()
  const recorder = useRef<TakeRecorder | null>(null)
  const [phase, setPhase] = useState<RecordPhase | 'idle'>('idle')
  const [count, setCount] = useState<number | null>(null)
  const [live, setLive] = useState<{ peaks: number[]; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recording = phase !== 'idle'
  const previewing = player.playing && player.beatId === beat.id
  const takeId = round.take?.id ?? null
  const playingBack = tp.playing && tp.id === `take:${takeId}`
  const total = totalRounds(session)
  const running = runningScore(session)

  // stop everything when leaving the round
  useEffect(
    () => () => {
      recorder.current?.cancel()
      beatPlayer.stop()
      trackPlayer.stop()
    },
    [],
  )

  const setLine = (i: 0 | 1, text: string) =>
    update((s) => ({ ...s, rounds: s.rounds.map((r) => (r.index === round.index ? { ...r, lyrics: (i === 0 ? [text, r.lyrics[1]] : [r.lyrics[0], text]) as [string, string] } : r)) }), { debounce: true })

  const preview = () => {
    trackPlayer.stop()
    if (previewing) beatPlayer.pause()
    else void beatPlayer.play(playable, { from: sec.start, to: sec.end })
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
      const take = await rec.record(
        { beat: playable, sectionStart: sec.start, sectionEnd: sec.end, secondsPerBeat: spb, beatsPerBar: beat.beatsPerBar },
        {
          onPhase: (p) => {
            setPhase(p)
            if (p === 'recording') audio.play('move')
          },
          onCount: (c) => setCount(c),
          onLive: (peaks, progress) => setLive({ peaks, progress }),
        },
      )
      if (!take) return
      const id = `${session.id}:${round.index}:${Date.now()}`
      rememberTake(id, { samples: take.samples, sampleRate: take.sampleRate })
      await saveTakeAudio(id, session.id, encodeWav([take.samples], take.sampleRate))
      const old = round.take?.id
      if (old) {
        forgetTake(old)
        void deleteTakeAudio(old)
      }
      update((s) => ({
        ...s,
        rounds: s.rounds.map((r) =>
          r.index === round.index
            ? {
                ...r,
                take: {
                  id,
                  beatId: beat.id,
                  barStart: sec.firstBar,
                  barCount: 2,
                  beatTimeSec: take.beatTimeSec,
                  sectionStartSec: take.sectionStart,
                  sectionEndSec: take.sectionEnd,
                  durationSec: take.durationSec,
                  sampleRate: take.sampleRate,
                  latencySec: take.latencySec,
                  inputPeak: take.inputPeak,
                  peaks: take.peaks,
                  recordedAt: Date.now(),
                },
              }
            : r,
        ),
      }))
      if (take.inputPeak < 0.01) setError("That take is almost silent — the mic didn't pick you up. Check the level meter and your input device in Settings.")
    } catch (e) {
      audio.play('error')
      setError(e instanceof RecordError ? e.message : `Recording failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      recorder.current = null
      setPhase('idle')
      setCount(null)
      setLive(null)
    }
  }, [recording, playable, sec, spb, beat, session.id, round.index, round.take?.id, update])

  const playback = async () => {
    if (!round.take) return
    if (playingBack) return trackPlayer.stop()
    beatPlayer.stop()
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    const [beatBuf, vocal] = await Promise.all([beatPlayer.loadBuffer(playable), takeBuffer(ctx, round.take.id)])
    if (!vocal) return setError('This take could not be loaded.')
    await trackPlayer.play(`take:${round.take.id}`, beatBuf, [{ buffer: vocal, beatTime: round.take.beatTimeSec, gain: vocalGain(round.take.inputPeak) }], Math.max(0, sec.start - spb), Math.min(beat.durationSec, sec.end + spb * 0.5))
  }

  // keyboard: Esc stops a recording
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

  const ready = round.lyrics[0].trim().length > 0 && round.lyrics[1].trim().length > 0
  const canSubmit = ready && !!round.take && !recording
  const position = useCallback(() => {
    if (playingBack) return trackPlayer.position(`take:${takeId}`)
    return beatPlayer.position(beat.id)
  }, [playingBack, takeId, beat.id])
  const relPosition = useCallback(() => {
    const p = position()
    return p === null ? null : p - viewFrom
  }, [position, viewFrom])

  const peaksWindow = useMemo(() => {
    const n = beat.peaks.length
    const a = Math.floor((viewFrom / beat.durationSec) * n)
    const b = Math.ceil((viewTo / beat.durationSec) * n)
    return beat.peaks.slice(a, b)
  }, [beat.peaks, beat.durationSec, viewFrom, viewTo])

  const firstBarInView = Math.floor((viewFrom - beat.introOffset) / sec.grid.secondsPerBar + 1e-6)
  const gridOffset = beat.introOffset + firstBarInView * sec.grid.secondsPerBar - viewFrom
  const takeFrom = round.take?.beatTimeSec ?? sec.start - spb
  const takeTo = round.take ? round.take.beatTimeSec + round.take.durationSec : sec.end + 0.45

  return (
    <div className="studio">
      <div className="studio__top enter" style={{ '--i': 1 } as CSSProperties}>
        <div className="progress" aria-label={`${barsDone(session)} of ${session.length} bars done`}>
          {Array.from({ length: session.length }, (_, i) => (
            <i key={i} data-state={i < barsDone(session) ? 'done' : i < barsDone(session) + 2 ? 'now' : undefined} />
          ))}
        </div>
        <div className="studio__meta">
          <span className="eyebrow">
            {barsDone(session)} / {session.length} bars
          </span>
          <span className="rank-mini" data-rank={running?.rank ?? '–'} title="Current rank">
            <span className="eyebrow">Rank</span> <b>{running?.rank ?? '—'}</b>
          </span>
          <button className="btn btn--ghost studio__help" onClick={() => (audio.play('confirm'), onHelp())}>
            <span>Help</span>
          </button>
        </div>
      </div>

      <section className="challenge enter" style={{ '--i': 2 } as CSSProperties} key={round.index}>
        <span className="eyebrow">
          Challenge {round.index + 1} / {total} · bars {sec.firstBar + 1}–{sec.firstBar + 2} · {round.challenge.storyBeat}
          <span className={`source-tag source-tag--${round.challenge.source}`}>{round.challenge.source === 'local-ai' ? 'Rap AI' : 'Basic director'}</span>
        </span>
        <h2 className="challenge__prompt">{round.challenge.prompt}</h2>
      </section>

      <section className="bars enter" style={{ '--i': 3 } as CSSProperties}>
        {[0, 1].map((i) => (
          <label key={i} className="bar-line">
            <span className="bar-line__n">{sec.firstBar + i + 1}</span>
            <input
              className="bar-line__input"
              value={round.lyrics[i]}
              placeholder={i === 0 ? 'Bar one — your words' : 'Bar two — land it'}
              maxLength={140}
              onChange={(e) => setLine(i as 0 | 1, e.target.value)}
              aria-label={`Bar ${i + 1}`}
              disabled={recording}
            />
            <span className="bar-line__syll" title="Approximate syllables">
              {lineSyllables(round.lyrics[i]) || ''}
            </span>
          </label>
        ))}
      </section>

      <section className="timeline enter" style={{ '--i': 4 } as CSSProperties} data-recording={recording ? '' : undefined}>
        <div className="timeline__lane timeline__lane--beat">
          <span className="timeline__label">Beat</span>
          <Waveform
            peaks={peaksWindow}
            duration={viewTo - viewFrom}
            height={86}
            bpm={beat.bpm}
            beatsPerBar={beat.beatsPerBar}
            offset={gridOffset}
            dimIntro={false}
            barNumbers
            barNumberStart={firstBarInView + 1}
            highlight={[sec.start - viewFrom, sec.end - viewFrom]}
            position={relPosition}
            animate={previewing || playingBack}
            label={`Beat, bars ${sec.firstBar + 1} to ${sec.firstBar + 2}`}
          />
        </div>
        <div className="timeline__lane">
          <span className="timeline__label">You</span>
          <VocalLane
            peaks={live ? live.peaks : (round.take?.peaks ?? null)}
            from={live ? sec.start - spb : takeFrom}
            to={live ? sec.end + 0.45 : takeTo}
            viewFrom={viewFrom}
            viewTo={viewTo}
            recording={!!live}
            progress={live?.progress}
            position={playingBack ? position : undefined}
            animate={playingBack}
          />
          {!round.take && !live && <span className="timeline__empty">Your take appears here</span>}
        </div>
        {count !== null && (
          <div className="countdown" key={count} aria-live="assertive">
            {count}
          </div>
        )}
        {phase === 'recording' && count === null && <div className="rec-dot">REC</div>}
      </section>

      <section className="transport enter" style={{ '--i': 5 } as CSSProperties}>
        <button className="tbtn" onClick={preview} disabled={recording} aria-pressed={previewing}>
          <Icon name={previewing ? 'pause' : 'play'} size={16} /> {previewing ? 'Stop' : 'Preview bars'}
        </button>
        <button className="tbtn tbtn--rec" onClick={() => void record()} data-active={recording ? '' : undefined} aria-label={recording ? 'Stop recording' : round.take ? 'Record again' : 'Record'}>
          <span className="tbtn__rec-dot" />
          {phase === 'preparing' ? 'Getting ready…' : phase === 'countin' ? 'Count-in…' : phase === 'recording' ? 'Stop' : round.take ? 'Retake' : 'Record'}
        </button>
        {round.take && !recording && (
          <button className="tbtn" onClick={() => void playback()} aria-pressed={playingBack}>
            <Icon name={playingBack ? 'pause' : 'play'} size={16} /> {playingBack ? 'Stop' : 'Play back'}
          </button>
        )}
        <MicMeter active={micState.status === 'ready'} />
        <button className="btn btn--primary transport__submit" disabled={!canSubmit} onClick={() => (trackPlayer.stop(), beatPlayer.stop(), onSubmit())}>
          <span>Submit</span>
        </button>
      </section>

      <p className="studio__hint enter" style={{ '--i': 6 } as CSSProperties} role={error || micState.message ? 'alert' : undefined}>
        {error ??
          micState.message ??
          (!ready
            ? 'Write both bars, then record them.'
            : !round.take
              ? `🎧 Headphones on, then Record — you get a bar of count-in (3, 2, 1), then rap bars ${sec.firstBar + 1}–${sec.firstBar + 2}. It stops by itself.`
              : `Take saved (${formatTime(round.take.durationSec)}). Play it back, retake, or submit.`)}
      </p>
    </div>
  )
}

/** Live input level, so you can see the mic is hearing you before you record. */
function MicMeter({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      ref.current?.style.setProperty('--lvl', mic.level().toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return (
    <span className="mic-meter" data-active={active ? '' : undefined} title={active ? 'Mic level' : 'The mic turns on when you first record'}>
      <Icon name="mic" size={15} />
      <span className="mic-meter__bar" ref={ref}>
        <i />
      </span>
    </span>
  )
}
