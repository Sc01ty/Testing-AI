import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { beatPlayer, useBeatPlayer, type PlayableBeat } from '../../audio/BeatPlayer'
import { mic, useMic } from '../../audio/mic'
import { RecordError, TakeRecorder, type RecordPhase } from '../../audio/recordTake'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import { encodeWav } from '../../audio/wav'
import type { Round, SavedBeat, Session } from '../../domain/types'
import { formatTime } from '../../lib/format'
import { lineSyllables } from '../../lyrics/text'
import { hotStreak } from '../../ranked/ladder'
import { barsDone, gridOf, roundSections, runningScore, setRoundSection, totalRounds } from '../../play/sessionLogic'
import { barBeatLabel, endLabel, lengthLabel } from '../../play/sectionWindow'
import { forgetTake, rememberTake } from '../../play/takeAudio'
import { arrangedClips } from '../../play/vocals'
import { useSettings } from '../../settings/useSettings'
import { deleteTakeAudio, getBeatAudio, saveTakeAudio } from '../../storage'
import { Waveform } from '../beats/Waveform'
import { Icon } from '../beats/icons'
import { VocalLane } from './VocalLane'
import { SectionEditor } from './SectionEditor'
import { SongStrip, type VocalShape } from './SongTimeline'

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
  const sections = useMemo(() => roundSections(session, beat), [session, beat])
  const sec = sections[round.index]
  const spb = sec.grid.secondsPerBeat
  const viewFrom = Math.max(0, Math.min(sec.zone.min, sec.start) - sec.grid.secondsPerBar)
  const viewTo = Math.min(beat.durationSec, Math.max(sec.zone.max, sec.end) + spb)
  const playable: PlayableBeat = useMemo(() => ({ id: beat.id, getBlob: () => getBeatAudio(beat.id) }), [beat.id])
  const player = useBeatPlayer()
  const tp = useTrackPlayer()
  const [settings, setSettings] = useSettings()
  const clickGrid = useMemo(() => ({ origin: beat.introOffset, secondsPerBeat: spb, beatsPerBar: beat.beatsPerBar }), [beat.introOffset, spb, beat.beatsPerBar])
  const prevTake = session.rounds[round.index - 1]?.take ?? null
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
  // the take was recorded for a different START/END → it has to be recorded again
  const stale = !!round.take && (Math.abs(round.take.sectionStartSec - sec.start) > 1e-3 || Math.abs(round.take.sectionEndSec - sec.end) > 1e-3)
  const moveSection = (w: { start: number; end: number }) => {
    if (previewing) beatPlayer.stop()
    update((s) => setRoundSection(s, round.index, w), { debounce: true })
  }
  const slotStrip = useMemo(() => {
    const bar = sec.grid.secondsPerBar
    const out = sections.map((x) => ({ start: x.start, end: x.end }))
    for (let i = out.length; i < total; i++) out.push({ start: out[i - 1].end, end: out[i - 1].end + 2 * bar })
    return out
  }, [sections, total, sec.grid.secondsPerBar])
  const where = (t: number) => barBeatLabel(t, beat.introOffset, spb, beat.beatsPerBar)
  const whereEnd = (t: number) => endLabel(t, beat.introOffset, spb, beat.beatsPerBar)

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
    if (previewing) beatPlayer.stop()
    else void beatPlayer.play(playable, { from: sec.start, to: sec.end, loop: settings.previewLoop, grid: clickGrid })
  }

  const toggleLoop = () => {
    const on = !settings.previewLoop
    audio.play('toggle')
    setSettings({ previewLoop: on })
    if (previewing) beatPlayer.setLoop(on)
  }

  const toggleMetronome = () => {
    audio.play('toggle')
    setSettings({ metronome: !settings.metronome })
  }

  const record = useCallback(async () => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    setError(null)
    beatPlayer.stop() // (also stops a looping preview before the count-in)
    trackPlayer.stop()
    const rec = new TakeRecorder()
    recorder.current = rec
    try {
      audio.unlock()
      const ctx = audio.context
      // your last take plays through the count-in, so this one flows out of it
      const leadIn = settings.hearLastTake && prevTake && ctx ? await arrangedClips(ctx, [prevTake]).catch(() => []) : []
      const take = await rec.record(
        { beat: playable, sectionStart: sec.start, sectionEnd: sec.end, secondsPerBeat: spb, beatsPerBar: beat.beatsPerBar, gridOrigin: beat.introOffset, leadIn },
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
  }, [recording, playable, sec, spb, beat, session.id, round.index, round.take?.id, update, settings.hearLastTake, prevTake])

  const playback = async () => {
    if (!round.take) return
    if (playingBack) return trackPlayer.stop()
    beatPlayer.stop()
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    // hear how it joins: your previous bars lead straight into this take
    const takes = prevTake ? [prevTake, round.take] : [round.take]
    const [beatBuf, clips] = await Promise.all([beatPlayer.loadBuffer(playable), arrangedClips(ctx, takes)])
    if (!clips.some((c) => c.beatTime === round.take!.beatTimeSec)) return setError('This take could not be loaded.')
    const from = prevTake ? sec.start - sec.grid.secondsPerBar : sec.start - spb
    await trackPlayer.play(`take:${round.take.id}`, beatBuf, clips, Math.max(0, from), Math.min(beat.durationSec, sec.end + spb * 0.5))
  }

  const songVocals: VocalShape[] = useMemo(
    () =>
      session.rounds
        .filter((r) => r.take && r.result)
        .map((r) => ({ key: r.take!.id, peaks: r.take!.peaks, start: r.take!.beatTimeSec, duration: r.take!.durationSec, region: [r.take!.sectionStartSec, r.take!.sectionEndSec] as [number, number] })),
    [session.rounds],
  )

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
  const canSubmit = ready && !!round.take && !recording && !stale
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
        <div className="progress">
          <SongStrip grid={gridOf(session, beat)!} bars={session.length} vocals={songVocals} current={round.index} sections={slotStrip} />
        </div>
        <div className="studio__meta">
          <span className="eyebrow">
            {barsDone(session)} / {session.length} bars
          </span>
          <span className="rank-mini" data-rank={running?.rank ?? '–'} title="Track grade so far">
            <span className="eyebrow">Grade</span> <b>{running?.rank ?? '—'}</b>
          </span>
          <StreakChip session={session} />
          <button className="btn btn--ghost studio__help" onClick={() => (audio.play('confirm'), onHelp())}>
            <span>Help</span>
          </button>
        </div>
      </div>

      <section className="challenge enter" style={{ '--i': 2 } as CSSProperties} key={round.index}>
        <span className="eyebrow">
          Challenge {round.index + 1} / {total} · {where(sec.start)} → {whereEnd(sec.end)} · {round.challenge.storyBeat}
          <span className={`source-tag source-tag--${round.challenge.source}`}>{round.challenge.source === 'local-ai' ? 'Rap AI' : 'Basic director'}</span>
        </span>
        <h2 className="challenge__prompt">{round.challenge.prompt}</h2>
        {round.challenge.spec?.trainingHint && <details><summary>Optional coach tip</summary><p className="studio__hint">{round.challenge.spec.trainingHint}</p></details>}
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
          <div className="timeline__wave">
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
            label="Beat waveform around this section"
          />
          <SectionEditor
            zone={sec.zone}
            value={{ start: sec.start, end: sec.end }}
            onChange={moveSection}
            viewFrom={viewFrom}
            viewTo={viewTo}
            secondsPerBar={sec.grid.secondsPerBar}
            beatsPerBar={beat.beatsPerBar}
            disabled={recording}
          />
          </div>
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

      <p className="studio__section enter" style={{ '--i': 5 } as CSSProperties}>
        <span>
          START <b>{where(sec.start)}</b> · END <b>{whereEnd(sec.end)}</b> · <b>{lengthLabel(sec, sec.grid.secondsPerBar)}</b> (2 bars max)
        </span>
        <span>{stale ? <span data-stale="">Section moved — record again to fit it.</span> : 'Drag START / END to place your bars. ← → nudges a beat, Shift a bar.'}</span>
      </p>

      <section className="transport enter" style={{ '--i': 5 } as CSSProperties}>
        <span className="tgroup">
          <button className="tbtn" onClick={preview} disabled={recording} aria-pressed={previewing}>
            <Icon name={previewing ? 'pause' : 'play'} size={16} /> {previewing ? 'Stop' : 'Preview bars'}
          </button>
          <button
            className="ibtn"
            onClick={toggleLoop}
            disabled={recording}
            aria-pressed={settings.previewLoop}
            aria-label="Loop preview"
            title={settings.previewLoop ? 'Loop on — preview repeats these two bars until you stop it' : 'Loop off'}
          >
            <Icon name="loop" size={16} />
          </button>
          <button
            className="ibtn"
            onClick={toggleMetronome}
            aria-pressed={settings.metronome}
            aria-label="Metronome"
            title={settings.metronome ? 'Metronome on (volume in Settings) — never in your track' : 'Metronome off'}
          >
            <Icon name="metronome" size={16} />
          </button>
        </span>
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
              ? `🎧 Headphones on, then Record — you get a bar of count-in (3, 2, 1)${prevTake && settings.hearLastTake ? ' over the end of your last take' : ''}, then rap from ${where(sec.start)} until ${whereEnd(sec.end)}. It stops by itself.`
              : stale
                ? 'You moved the section since this take. Record again so it lands between START and END.'
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

/** A/S rounds in a row: 3 makes the track HOT (+10% RP). */
function StreakChip({ session }: { session: Session }) {
  const ranks = session.rounds.filter((r) => r.result).map((r) => r.result!.rank)
  if (hotStreak(ranks)) return <span className="streak-chip" data-hot="" title="3 rounds in a row at A or S: +10% RP on this track">HOT STREAK · +10% RP</span>
  let run = 0
  for (let i = ranks.length - 1; i >= 0 && (ranks[i] === 'A' || ranks[i] === 'S'); i--) run++
  if (!run) return null
  return <span className="streak-chip" title="Get 3 rounds in a row at A or S for +10% RP">{run}/3 A-or-better for HOT</span>
}
