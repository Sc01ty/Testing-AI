import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import type { BeatMeta, FreestyleSession } from '../../domain/types'
import { barsOfWords } from '../../freestyle/score'
import { DIFFICULTY_LABEL, downloadFreestyle, freestyleMix, timing } from '../../freestyle/session'
import { formatBytes } from '../../lib/format'
import { Icon } from '../beats/icons'
import { openSavedShelf } from '../../app/navigation'
import { VocalLane } from '../play/VocalLane'
import { Landings } from './Landings'

/** A scored freestyle: rank, categories, which prompts you used, what you said, playback and export. */
export function FreestyleComplete({
  f,
  beat,
  saved = false,
  onAgain,
  onNew,
  onDelete,
}: {
  f: FreestyleSession
  beat: BeatMeta | null
  saved?: boolean
  onAgain?: () => void
  onNew?: () => void
  onDelete?: () => void
}) {
  const r = f.result!
  const { spb, spBar } = timing(f)
  const tp = useTrackPlayer()
  const id = `fs:${f.id}`
  const playing = tp.playing && tp.id === id
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mix, setMix] = useState<Awaited<ReturnType<typeof freestyleMix>> | null>(null)
  const total = f.bars * spBar

  useEffect(() => {
    let live = true
    audio.unlock()
    const ctx = audio.context
    if (ctx) void freestyleMix(f, ctx, !!beat).then((m) => live && setMix(m))
    return () => {
      live = false
      trackPlayer.stop()
    }
  }, [f, beat])

  const play = useCallback(
    async (from?: number) => {
      if (!mix) return
      if (playing && from === undefined) return trackPlayer.stop()
      audio.unlock()
      await trackPlayer.play(id, mix.beatBuffer, mix.clips, Math.max(mix.from, Math.min(mix.to - 0.5, from ?? mix.from)), mix.to, { loop: mix.loop })
    },
    [mix, playing, id],
  )

  const download = async () => {
    setBusy('Mixing…')
    try {
      const size = await downloadFreestyle(f, !!beat)
      audio.play('save')
      setBusy(`Downloaded (${formatBytes(size)})`)
      setTimeout(() => setBusy(null), 2500)
    } catch (e) {
      setBusy(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const lines = useMemo(() => (f.transcript ? barsOfWords(f.transcript.words, f.bars, spBar) : null), [f.transcript, f.bars, spBar])
  const evidence = useMemo(() => new Set(r.prompts.flatMap((p) => p.evidence)), [r.prompts])
  const position = useCallback(() => trackPlayer.position(id), [id])

  return (
    <div className="complete fs-complete">
      <section className="complete__hero enter" style={{ '--i': 1 } as CSSProperties}>
        <div className="complete__titles">
          <span className="eyebrow">
            {saved ? 'Saved freestyle' : 'Freestyle complete'} · {DIFFICULTY_LABEL[f.difficulty]} · {f.bars} bars · {beat?.name ?? `${f.beatName} (beat deleted)`}
          </span>
          <h2 className="complete__name">{f.name}</h2>
        </div>
        <div className="complete__final">
          <div className="verdict__score">
            <span className="eyebrow">Freestyle score</span>
            <b>{r.score}</b>
          </div>
          <div className={`rank-letter rank-letter--${r.rank} complete__rank`} aria-label={`Freestyle rank ${r.rank}`}>
            {r.rank}
          </div>
        </div>
      </section>

      <section className="complete__cats enter" style={{ '--i': 2 } as CSSProperties}>
        {r.categories.map((c) => (
          <div key={c.category} className="cat cat--compact" data-state="shown" style={{ '--score': c.score } as CSSProperties} title={c.reasons.join(' · ')}>
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

      {f.ball ? (
        <section className="enter" style={{ '--i': 3 } as CSSProperties} aria-label="Landings">
          <Landings f={f} />
        </section>
      ) : (
      <section className="fs-prompts enter" style={{ '--i': 3 } as CSSProperties} aria-label="Prompts">
        {r.prompts.map((p) => (
          <span key={`${p.bar}-${p.word}`} className="fs-chip" data-hit={r.transcribed ? (p.hit ? 'yes' : 'no') : undefined} title={p.hit ? `You said: ${p.evidence.join(', ')}` : r.transcribed ? 'Not heard' : ''}>
            <small>bar {p.bar + 1}</small>
            {p.word}
            {r.transcribed && <b>{p.hit ? '✓' : '✗'}</b>}
            <small>{r.transcribed ? p.hit ? `“${p.evidence.join(' … ')}”` : 'Not clearly used' : 'Not evaluated'}</small>
          </span>
        ))}
      </section>
      )}

      <section className="song-timeline enter" style={{ '--i': 4 } as CSSProperties} aria-label="Freestyle timeline">
        <div className="fs-live__bars fs-live__bars--small" aria-hidden style={{ '--bars': f.bars } as CSSProperties}>
          {Array.from({ length: f.bars }, (_, i) => {
            const p = f.prompts.find((x) => x.bar === i)
            return (
              <i key={i} data-prompt={p ? '' : undefined} style={{ '--fill': 0 } as CSSProperties}>
                {p && <em>{p.word}</em>}
              </i>
            )
          })}
        </div>
        <div className="timeline__lane">
          <span className="timeline__label">You</span>
          <div onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            void play(-spb + ((e.clientX - rect.left) / rect.width) * (total + 0.6 + spb))
          }} style={{ cursor: 'pointer' }}>
            <VocalLane peaks={f.take?.peaks ?? null} from={f.take?.startTime ?? 0} to={(f.take?.startTime ?? 0) + (f.take?.durationSec ?? 0)} viewFrom={-spb} viewTo={total + 0.6} position={playing ? position : undefined} animate={playing} />
          </div>
        </div>
      </section>

      <section className="complete__actions enter" style={{ '--i': 5 } as CSSProperties}>
        <button className="btn btn--primary complete__play" onClick={() => void play()} disabled={!mix}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
          <span>{playing ? 'Stop' : 'Play freestyle'}</span>
        </button>
        <button className="btn btn--ghost" onClick={() => void download()}>
          <Icon name="download" size={16} />
          <span>Download WAV</span>
        </button>
        {onAgain && (
          <button className="btn btn--primary" onClick={onAgain}>
            <span>Retry same settings</span>
          </button>
        )}
        {onNew && (
          <button className="btn btn--quiet" onClick={onNew}>
            <span>Change setup</span>
          </button>
        )}
        {onDelete &&
          (confirmDelete ? (
            <span className="complete__confirm">
              Delete this freestyle?
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

      <section className="complete__tabs enter" style={{ '--i': 6 } as CSSProperties}>
        <ul className="feedback">
          {r.feedback.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {r.categories.flatMap((c) => c.reasons.slice(0, 2).map((reason) => <li key={`${c.category}${reason}`}><b>{c.label}:</b> {reason}</li>))}
        </ul>
        <h3 className="fs-transcript__title eyebrow">What we heard {f.transcript ? `· transcribed on this device (${f.transcript.model})` : ''}</h3>
        {lines ? (
          <ol className="lyrics-sheet fs-transcript">
            {lines.map((l, i) => {
              const p = f.prompts.find((x) => x.bar === i)
              return (
                <li key={i} className="fs-transcript__bar">
                  <span className="lyrics-sheet__n">{i + 1}</span>
                  <p>
                    {p && <span className="fs-transcript__prompt">{p.word}</span>}
                    {l.length ? l.map((w, k) => <span key={k} className={evidence.has(w) ? 'fs-hit' : undefined}>{w} </span>) : <span className="fs-silent">…</span>}
                  </p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="studio__hint">No transcript for this one{f.result?.transcribed === false ? ' — speech recognition was off or unavailable, so only timing and continuity were scored' : ''}.</p>
        )}
      </section>
    </div>
  )
}
