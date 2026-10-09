import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AdlibPanel } from './AdlibPanel'
import { saveSession } from '../../storage'
import { audio } from '../../audio/AudioEngine'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import type { VocalClip } from '../../audio/mix'
import type { BeatMeta, Session } from '../../domain/types'
import { formatBytes } from '../../lib/format'
import { buildFullTrack, downloadTrack, roundAt } from '../../play/fullTrack'
import { gridOf, roundSection } from '../../play/sessionLogic'
import { arrangedClips } from '../../play/vocals'
import { finalResult } from '../../scoring/round'
import { Waveform } from '../beats/Waveform'
import { Icon } from '../beats/icons'
import { openSavedShelf } from '../../app/navigation'
import { VocalRegions, type VocalShape } from './SongTimeline'

export type Tab = 'lyrics' | 'rounds'

/**
 * A finished song: final rank, the whole song on one timeline, playback,
 * lyrics, round history and export. Shown when a track completes, and again
 * from BEATS → SAVED (`saved`). If the beat was deleted, the vocals still
 * play on their own.
 */
export function TrackComplete({
  session: originalSession,
  beat,
  saved = false,
  initialTab = 'lyrics',
  onTryAgain,
  onNew,
  onDelete,
}: {
  session: Session
  beat: BeatMeta | null
  saved?: boolean
  initialTab?: Tab
  onTryAgain?: () => void
  onNew?: () => void
  onDelete?: () => void
}) {
  const [session,setSession] = useState(originalSession)
  useEffect(()=>setSession(originalSession),[originalSession])
  const results = session.rounds.map((r) => r.result!).filter(Boolean)
  const final = finalResult(results)
  const grid = gridOf(session, beat)!
  const tp = useTrackPlayer()
  const fullId = `full:${session.id}`
  const playing = tp.playing && tp.id === fullId
  const [tab, setTab] = useState<Tab>(initialTab)
  const [busy, setBusy] = useState<string | null>(null)
  const [nowRound, setNowRound] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [track, setTrack] = useState<Awaited<ReturnType<typeof buildFullTrack>> | null>(null)
  const revealed = useRef(false)

  useEffect(() => {
    if (revealed.current || saved) return
    revealed.current = true
    audio.play(final.rank === 'S' || final.rank === 'A' ? 'impactBig' : 'impact')
  }, [final.rank, saved])

  useEffect(() => () => trackPlayer.stop(), [])

  // arrange the vocals once (drawn on the timeline, reused for playback)
  useEffect(() => {
    let live = true
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    const b = beat ? { ...beat, ...grid } : { id: session.beatId, ...grid }
    void buildFullTrack(session, b, ctx, { withBeat: !!beat }).then((t) => live && setTrack(t))
    return () => {
      live = false
    }
  }, [session, beat]) // eslint-disable-line react-hooks/exhaustive-deps

  // follow the lyrics while the full track plays
  useEffect(() => {
    if (!playing) return setNowRound(null)
    let raf = 0
    const tick = () => {
      const p = trackPlayer.position(fullId)
      setNowRound(p === null ? null : roundAt(session, grid, p))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, session, grid, fullId])

  const playFrom = useCallback(
    async (t?: number) => {
      if (!track) return
      audio.unlock()
      await trackPlayer.play(fullId, track.beatBuffer, track.clips, Math.max(track.from, Math.min(track.to - 0.5, t ?? track.from)), track.to)
    },
    [track, fullId],
  )

  const playFull = useCallback(async () => {
    if (playing) return trackPlayer.stop()
    if (!track) {
      setBusy('Building your track…')
      return
    }
    await playFrom()
  }, [playing, track, playFrom])

  useEffect(() => {
    if (track && busy === 'Building your track…') setBusy(null)
  }, [track, busy])

  const playRound = async (i: number) => {
    const r = session.rounds[i]
    if (!r.take) return
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    const id = `take:${r.take.id}`
    if (tp.playing && tp.id === id) return trackPlayer.stop()
    const sec = roundSection(session, grid, i)
    const clips: VocalClip[] = await arrangedClips(ctx, [r.take])
    await trackPlayer.play(id, track?.beatBuffer ?? null, clips, Math.max(0, sec.start - sec.grid.secondsPerBeat), sec.end + 0.4)
  }

  const download = async () => {
    setBusy('Mixing your track…')
    try {
      const size = await downloadTrack(session, beat ? { ...beat, ...grid } : { id: session.beatId, ...grid })
      audio.play('save')
      setBusy(`Downloaded (${formatBytes(size)})`)
      setTimeout(() => setBusy(null), 2500)
    } catch (e) {
      setBusy(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // timeline: beat lane + vocal regions where they really are
  const shapes: VocalShape[] = useMemo(() => {
    const byId = new Map(session.rounds.filter((r) => r.take).map((r) => [r.take!.id, r]))
    return (track?.clips ?? []).filter(c => byId.has(c.id ?? '')).map((c) => {
      const r = byId.get(c.id ?? '')!
      return {
        key: c.id ?? '',
        peaks: r.take!.peaks,
        start: r.take!.beatTimeSec,
        duration: r.take!.durationSec,
        region: c.region ? ([c.region.start, c.region.end] as [number, number]) : undefined,
        label: `${r.index * 2 + 1}–${r.index * 2 + 2}`,
      }
    })
  }, [track, session.rounds])
  const beatWindow = useMemo(() => {
    if (!beat || !track) return null
    const n = beat.peaks.length
    return beat.peaks.slice(Math.floor((track.from / beat.durationSec) * n), Math.ceil((track.to / beat.durationSec) * n))
  }, [beat, track])
  const position = useCallback(() => trackPlayer.position(fullId), [fullId])
  const relPosition = useCallback(() => {
    const p = trackPlayer.position(fullId)
    return p === null || !track ? null : p - track.from
  }, [fullId, track])
  const nowKey = nowRound !== null ? (session.rounds[nowRound]?.take?.id ?? null) : null
  const firstBarInView = track ? Math.floor((track.from - grid.introOffset) / ((60 / grid.bpm) * grid.beatsPerBar) + 1e-6) : 0
  const gridOffset = track ? grid.introOffset + firstBarInView * ((60 / grid.bpm) * grid.beatsPerBar) - track.from : 0

  return (
    <div className="complete">
      <section className="complete__hero enter" style={{ '--i': 1 } as CSSProperties}>
        <div className="complete__titles">
          <span className="eyebrow">
            {saved ? 'Saved' : 'Track complete'} · {session.length} bars · {beat?.name ?? `${session.beatName} (beat deleted)`}
          </span>
          <h2 className="complete__name">{session.trackName}</h2>
          <span className="complete__story">{session.storyDirection}</span>
        </div>
        <div className="complete__final">
          <div className="verdict__score">
            <span className="eyebrow">Final score</span>
            <b>{final.score}</b>
            {final.writing !== null && (
              <span className="verdict__split">
                Writing {final.writing}
                {final.performance !== null ? ` · Performance ${final.performance}` : ''}
              </span>
            )}
          </div>
          <div className={`rank-letter rank-letter--${final.rank} complete__rank`} aria-label={`Final rank ${final.rank}`}>
            {final.rank}
          </div>
        </div>
      </section>

      <section className="complete__cats enter" style={{ '--i': 2 } as CSSProperties}>
        {final.averages.map((c) => (
          <div key={c.category} className="cat cat--compact" data-state="shown" style={{ '--score': c.score } as CSSProperties}>
            <div className="cat__row">
              <span className="cat__label">{c.label}</span>
              <span className="cat__score">{c.score}</span>
            </div>
            <div className="cat__bar">
              <i />
            </div>
          </div>
        ))}
      </section>

      <section className="song-timeline enter" style={{ '--i': 3 } as CSSProperties} aria-label="Song timeline">
        {beat && beatWindow && track && (
          <div className="timeline__lane timeline__lane--beat">
            <span className="timeline__label">Beat</span>
            <Waveform
              peaks={beatWindow}
              duration={track.to - track.from}
              height={54}
              bpm={grid.bpm}
              beatsPerBar={grid.beatsPerBar}
              offset={gridOffset}
              dimIntro={false}
              barNumbers
              barNumberStart={firstBarInView + 1}
              position={relPosition}
              animate={playing}
              onSeek={(t) => void playFrom(track.from + t)}
              label="Beat under the whole song"
            />
          </div>
        )}
        <div className="timeline__lane">
          <span className="timeline__label">You</span>
          {track ? (
            <VocalRegions vocals={shapes} from={track.from} to={track.to} position={position} animate={playing} now={nowKey} onSeek={(t) => void playFrom(t)} />
          ) : (
            <div className="vocal-regions vocal-regions--loading" style={{ height: 70 }} />
          )}
        </div>
      </section>

      <section className="complete__actions enter" style={{ '--i': 4 } as CSSProperties}>
        <button className="btn btn--primary complete__play" onClick={() => void playFull()} disabled={!track && !playing}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
          <span>{playing ? 'Stop' : 'Play full track'}</span>
        </button>
        <button className="btn btn--ghost" onClick={() => void download()}>
          <Icon name="download" size={16} />
          <span>Download WAV</span>
        </button>
        {onTryAgain && (
          <button className="btn btn--ghost" onClick={onTryAgain}>
            <span>Try again</span>
          </button>
        )}
        {onNew && (
          <button className="btn btn--quiet" onClick={onNew}>
            <span>New track</span>
          </button>
        )}
        {onDelete &&
          (confirmDelete ? (
            <span className="complete__confirm">
              Delete “{session.trackName}” and its vocals?
              <button className="btn btn--quiet" onClick={() => setConfirmDelete(false)}>
                <span>Keep</span>
              </button>
              <button className="btn btn--danger" onClick={onDelete}>
                <span>Delete</span>
              </button>
            </span>
          ) : (
            <button className="btn btn--quiet" onClick={() => (audio.play('toggle'), setConfirmDelete(true))}>
              <Icon name="trash" size={15} />
              <span>Delete</span>
            </button>
          ))}
        {busy && <span className="complete__busy">{busy}</span>}
        {!saved && !busy && (
          <button className="btn btn--quiet complete__saved-link" onClick={() => (audio.play('confirm'), openSavedShelf())}>
            <span>Saved · open in BEATS → SAVED</span>
          </button>
        )}
      </section>

      <AdlibPanel sessionId={session.id} beatId={session.beatId} bpm={grid.bpm} beatsPerBar={grid.beatsPerBar} layers={session.adlibs}
        makeBacking={async()=>{audio.unlock();return buildFullTrack({...session,adlibs:[]},beat?{...beat,...grid}:{id:session.beatId,...grid},audio.context!,{withBeat:!!beat})}}
        onKeep={async(adlibs)=>{trackPlayer.stop();const next={...session,adlibs,updatedAt:Date.now()};await saveSession(next);setSession(next)}}/>

      <section className="complete__tabs enter" style={{ '--i': 5 } as CSSProperties}>
        <div className="tabs" role="tablist">
          {(['lyrics', 'rounds'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => (audio.play('toggle'), setTab(t))}>
              {t === 'lyrics' ? 'Lyrics' : 'Round history'}
            </button>
          ))}
        </div>
        {tab === 'lyrics' ? (
          <ol className="lyrics-sheet">
            {session.rounds.map((r) => (
              <li key={r.index} data-now={nowRound === r.index ? '' : undefined}>
                <span className="lyrics-sheet__n">{r.index * 2 + 1}</span>
                <p>{r.lyrics[0]}</p>
                <span className="lyrics-sheet__n">{r.index * 2 + 2}</span>
                <p>{r.lyrics[1]}</p>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="history">
            {session.rounds.map((r) => (
              <li key={r.index} className="history__round">
                <div className="history__head">
                  <span className="eyebrow">
                    Round {r.index + 1} · {r.challenge.source === 'local-ai' ? 'Rap AI' : 'Basic director'}
                  </span>
                  <span className={`rank-chip-sm rank-chip-sm--${r.result?.rank}`}>
                    {r.result?.rank} · {r.result?.score}
                  </span>
                </div>
                <p className="history__prompt">{r.challenge.prompt}</p>
                <p className="history__bars">
                  {r.lyrics[0]}
                  <br />
                  {r.lyrics[1]}
                </p>
                <div className="history__cats">
                  {r.result?.categories.map((c) => (
                    <span key={c.category} title={c.reasons.join(' · ')}>
                      {c.label} <b>{c.score}</b>
                    </span>
                  ))}
                </div>
                {r.take && (
                  <button className="tbtn tbtn--small" onClick={() => void playRound(r.index)}>
                    <Icon name={tp.playing && tp.id === `take:${r.take.id}` ? 'pause' : 'play'} size={13} /> Take
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
