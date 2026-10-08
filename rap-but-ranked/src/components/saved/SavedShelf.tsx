import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { trackPlayer, useTrackPlayer } from '../../audio/trackPlayer'
import { router } from '../../app/router'
import { SAVED_OPEN_KEY as OPEN_KEY } from '../../app/navigation'
import type { BeatMeta } from '../../domain/types'
import { DIFFICULTY_LABEL, downloadFreestyle, freestyleMix } from '../../freestyle/session'
import { formatBytes } from '../../lib/format'
import { buildFullTrack, downloadTrack } from '../../play/fullTrack'
import { gridOf } from '../../play/sessionLogic'
import { finalResult } from '../../scoring/round'
import { deleteFreestyle, deleteSession, listSaved, onSavedChange, type SavedItem } from '../../storage'
import { Icon } from '../beats/icons'
import { FreestyleComplete } from '../freestyle/FreestyleComplete'
import { TrackComplete, type Tab } from '../play/TrackComplete'
import '../play/play.css'
import { DuoView } from '../../multiplayer/DuoView'
import { deleteDuo } from '../../multiplayer/store'

/**
 * BEATS → SAVED: every finished track and scored freestyle, kept on this
 * device with its vocals and timing, so it plays back exactly as made.
 */

export function SavedShelf({ beats }: { beats: BeatMeta[] | null }) {
  const [items, setItems] = useState<SavedItem[] | null>(null)
  const [open, setOpen] = useState<{ id: string; tab?: Tab } | null>(() => {
    try {
      const id = sessionStorage.getItem(OPEN_KEY)
      return id ? { id } : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    let alive = true
    const load = () => void listSaved().then((x) => alive && setItems(x))
    load()
    const off = onSavedChange(load)
    return () => {
      alive = false
      off()
      trackPlayer.stop()
    }
  }, [])

  const show = (o: { id: string; tab?: Tab } | null) => {
    try {
      if (o) sessionStorage.setItem(OPEN_KEY, o.id)
      else sessionStorage.removeItem(OPEN_KEY)
    } catch {
      /* ignore */
    }
    trackPlayer.stop()
    setOpen(o)
  }

  const beatFor = (id: string) => beats?.find((b) => b.id === id) ?? null
  const remove = async (it: SavedItem) => {
    trackPlayer.stop()
    audio.play('back')
    if(it.kind==='multiplayer') await deleteDuo(it.id)
    else if (it.kind === 'track') await deleteSession(it.id)
    else await deleteFreestyle(it.id)
    if (open?.id === it.id) show(null)
  }

  if (items === null) return <p className="eyebrow">Loading…</p>

  const current = open ? items.find((i) => i.id === open.id) : null
  if (open && current) {
    return (
      <div className="saved-detail">
        <button className="btn btn--quiet saved-detail__back" onClick={() => (audio.play('back'), show(null))}>
          <span>← All saved</span>
        </button>
        {current.kind === 'multiplayer' ? <DuoView initial={current.duo}/> : current.kind === 'track' ? (
          <TrackComplete key={current.id} session={current.session} beat={beatFor(current.session.beatId)} saved initialTab={open.tab} onDelete={() => void remove(current)} />
        ) : (
          <FreestyleComplete key={current.id} f={current.freestyle} beat={beatFor(current.freestyle.beatId)} saved onDelete={() => void remove(current)} />
        )}
      </div>
    )
  }

  if (!items.length)
    return (
      <div className="empty enter" style={{ '--i': 4 } as CSSProperties}>
        <h2 className="empty__title">Nothing saved yet</h2>
        <p className="empty__sub">Finish a track in Play or a freestyle in Freestyle and it lands here — vocals, lyrics, scores and all.</p>
        <div className="empty__actions">
          <button className="btn btn--primary" onClick={() => router.navigate('play')}>
            <span>Play</span>
          </button>
          <button className="btn btn--ghost" onClick={() => router.navigate('freestyle')}>
            <span>Freestyle</span>
          </button>
        </div>
      </div>
    )

  return (
    <ul className="saved-list" aria-label="Saved raps">
      {items.map((it, i) => (
        it.kind==='multiplayer'?<li key={it.id} className="saved-row"><span className="saved-kind">MULTIPLAYER</span><button className="saved-row__main" onClick={()=>show({id:it.id})}><b>{it.duo.trackName}</b><span className="saved-row__meta">{it.duo.players.join(' × ')} · {it.duo.length} bars · {it.duo.beatName}</span></button><button className="btn btn--quiet" onClick={()=>{if(window.confirm(`Delete ${it.duo.trackName}?`))void remove(it)}}>Delete</button></li>:<SavedRow key={it.id} item={it} index={i} beat={beatFor(it.kind === 'track' ? it.session.beatId : it.freestyle.beatId)} onOpen={(tab) => (audio.play('confirm'), show({ id: it.id, tab }))} onDelete={() => void remove(it)} />
      ))}
    </ul>
  )
}

function SavedRow({ item, index, beat, onOpen, onDelete }: { item: Exclude<SavedItem,{kind:'multiplayer'}>; index: number; beat: BeatMeta | null; onOpen: (tab?: Tab) => void; onDelete: () => void }) {
  const tp = useTrackPlayer()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const isTrack = item.kind === 'track'
  const playId = isTrack ? `full:${item.id}` : `fs:${item.id}`
  const playing = tp.playing && tp.id === playId

  const result = isTrack ? finalResult(item.session.rounds.map((r) => r.result!).filter(Boolean)) : item.freestyle.result!
  const name = isTrack ? item.session.trackName : item.freestyle.name
  const beatName = beat?.name ?? `${isTrack ? item.session.beatName : item.freestyle.beatName} (deleted)`
  const meta = isTrack
    ? ['Singleplayer', `${item.session.length} bars`, beatName, item.session.startingTopic]
    : ['Freestyle', DIFFICULTY_LABEL[item.freestyle.difficulty], `${item.freestyle.bars} bars`, beatName]
  const date = new Date(item.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  const play = useCallback(async () => {
    if (playing) return trackPlayer.stop()
    audio.unlock()
    const ctx = audio.context
    if (!ctx) return
    setBusy('Loading…')
    try {
      if (item.kind === 'track') {
        const g = gridOf(item.session, beat)!
        const t = await buildFullTrack(item.session, { id: item.session.beatId, ...g }, ctx, { withBeat: !!beat })
        await trackPlayer.play(playId, t.beatBuffer, t.clips, t.from, t.to)
      } else {
        const m = await freestyleMix(item.freestyle, ctx, !!beat)
        await trackPlayer.play(playId, m.beatBuffer, m.clips, m.from, m.to, { loop: m.loop })
      }
    } finally {
      setBusy(null)
    }
  }, [playing, item, beat, playId])

  const download = async () => {
    setBusy('Mixing…')
    try {
      const size = item.kind === 'track' ? await downloadTrack(item.session, { id: item.session.beatId, ...gridOf(item.session, beat)! }) : await downloadFreestyle(item.freestyle, !!beat)
      audio.play('save')
      setBusy(formatBytes(size))
      setTimeout(() => setBusy(null), 2000)
    } catch {
      setBusy('Export failed')
    }
  }

  return (
    <li className="saved-row enter" style={{ '--i': 4 + Math.min(index, 8) } as CSSProperties} data-playing={playing ? '' : undefined}>
      <span className={`rank-letter rank-letter--${result.rank} saved-row__rank`} aria-label={`Rank ${result.rank}`}>
        {result.rank}
      </span>
      <button className="saved-row__main" onClick={() => onOpen()}>
        <b className="saved-row__name">{name}</b>
        <span className="saved-row__meta">
          <span className={`saved-kind saved-kind--${item.kind}`}>{meta[0]}</span> {meta.slice(1).join(' · ')} · {date}
        </span>
      </button>
      <span className="saved-row__score">
        <span className="eyebrow">Score</span>
        <b>{result.score}</b>
      </span>
      <span className="saved-row__actions">
        <button className="tbtn tbtn--small" onClick={() => void play()} aria-pressed={playing} aria-label={`${playing ? 'Stop' : 'Play'} ${name}`}>
          <Icon name={playing ? 'pause' : 'play'} size={13} /> {playing ? 'Stop' : 'Play'}
        </button>
        <button className="ibtn" title={isTrack ? 'Lyrics' : 'What you said'} aria-label={`Lyrics of ${name}`} onClick={() => onOpen('lyrics')}>
          <Icon name="lyrics" size={15} />
        </button>
        {isTrack && (
          <button className="ibtn" title="Scores & round history" aria-label={`Round history of ${name}`} onClick={() => onOpen('rounds')}>
            <Icon name="history" size={15} />
          </button>
        )}
        <button className="ibtn" title="Download WAV" aria-label={`Download ${name}`} onClick={() => void download()}>
          <Icon name="download" size={15} />
        </button>
        {confirming ? (
          <span className="saved-row__confirm">
            Delete?
            <button className="btn btn--quiet" onClick={() => setConfirming(false)}>
              <span>Keep</span>
            </button>
            <button className="btn btn--danger" onClick={onDelete}>
              <span>Delete</span>
            </button>
          </span>
        ) : (
          <button className="ibtn" title="Delete" aria-label={`Delete ${name}`} onClick={() => (audio.play('toggle'), setConfirming(true))}>
            <Icon name="trash" size={15} />
          </button>
        )}
        {busy && <span className="saved-row__busy">{busy}</span>}
      </span>
    </li>
  )
}
