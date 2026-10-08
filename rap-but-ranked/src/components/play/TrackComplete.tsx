import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import { vocalGain } from '../../audio/mix'
import { beatPlayer } from '../../audio/BeatPlayer'
import type { SavedBeat, Session } from '../../domain/types'
import { formatBytes } from '../../lib/format'
import { buildFullTrack, downloadTrack, roundAt } from '../../play/fullTrack'
import { sectionFor } from '../../play/sessionLogic'
import { takeBuffer } from '../../play/takeAudio'
import { finalResult } from '../../scoring/round'
import { getBeatAudio } from '../../storage'
import { Icon } from '../beats/icons'

type Tab = 'lyrics' | 'rounds'

export function TrackComplete({ session, beat, onTryAgain, onNew }: { session: Session; beat: SavedBeat; onTryAgain: () => void; onNew: () => void }) {
  const results = session.rounds.map((r) => r.result!).filter(Boolean)
  const final = finalResult(results)
  const tp = useTrackPlayer()
  const playing = tp.playing && tp.id === `full:${session.id}`
  const [tab, setTab] = useState<Tab>('lyrics')
  const [busy, setBusy] = useState<string | null>(null)
  const [nowRound, setNowRound] = useState<number | null>(null)
  const revealed = useRef(false)

  useEffect(() => {
    if (revealed.current) return
    revealed.current = true
    audio.play(final.rank === 'S' || final.rank === 'A' ? 'impactBig' : 'impact')
  }, [final.rank])

  useEffect(() => () => trackPlayer.stop(), [])

  // follow the lyrics while the full track plays
  useEffect(() => {
    if (!playing) return setNowRound(null)
    let raf = 0
    const tick = () => {
      const p = trackPlayer.position(`full:${session.id}`)
      setNowRound(p === null ? null : roundAt(session, beat, p))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, session, beat])

  const playFull = useCallback(async () => {
    if (playing) return trackPlayer.stop()
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    setBusy('Building your track…')
    try {
      const t = await buildFullTrack(session, beat, ctx)
      await trackPlayer.play(`full:${session.id}`, t.beatBuffer, t.clips, t.from, t.to)
    } finally {
      setBusy(null)
    }
  }, [playing, session, beat])

  const playRound = async (i: number) => {
    const r = session.rounds[i]
    if (!r.take) return
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    const id = `take:${r.take.id}`
    if (tp.playing && tp.id === id) return trackPlayer.stop()
    const sec = sectionFor(beat, i)
    const [b, v] = await Promise.all([beatPlayer.loadBuffer({ id: beat.id, getBlob: () => getBeatAudio(beat.id) }), takeBuffer(ctx, r.take.id)])
    if (v) await trackPlayer.play(id, b, [{ buffer: v, beatTime: r.take.beatTimeSec, gain: vocalGain(r.take.inputPeak) }], Math.max(0, sec.start - sec.grid.secondsPerBeat), sec.end + 0.4)
  }

  const download = async () => {
    setBusy('Mixing your track…')
    try {
      const size = await downloadTrack(session, beat)
      audio.play('save')
      setBusy(`Downloaded (${formatBytes(size)})`)
      setTimeout(() => setBusy(null), 2500)
    } catch (e) {
      setBusy(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="complete">
      <section className="complete__hero enter" style={{ '--i': 1 } as CSSProperties}>
        <div className="complete__titles">
          <span className="eyebrow">Track complete · {session.length} bars · {beat.name}</span>
          <h2 className="complete__name">{session.trackName}</h2>
          <span className="complete__story">{session.storyDirection}</span>
        </div>
        <div className="complete__final">
          <div className="verdict__score">
            <span className="eyebrow">Final score</span>
            <b>{final.score}</b>
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

      <section className="complete__actions enter" style={{ '--i': 3 } as CSSProperties}>
        <button className="btn btn--primary complete__play" onClick={() => void playFull()}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
          <span>{playing ? 'Stop' : 'Play full track'}</span>
        </button>
        <button className="btn btn--ghost" onClick={() => void download()}>
          <Icon name="upload" size={16} />
          <span>Download WAV</span>
        </button>
        <button className="btn btn--ghost" onClick={onTryAgain}>
          <span>Try again</span>
        </button>
        <button className="btn btn--quiet" onClick={onNew}>
          <span>New track</span>
        </button>
        {busy && <span className="complete__busy">{busy}</span>}
      </section>

      <section className="complete__tabs enter" style={{ '--i': 4 } as CSSProperties}>
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
