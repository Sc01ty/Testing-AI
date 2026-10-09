import type { CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { router } from '../../app/router'
import { PLACEMENT_EVENTS, rankAt } from '../../ranked/ladder'
import type { TrackCard as Card } from '../../social/api'
import { feedPlayer, useFeedPlayer } from '../../social/feedPlayer'
import { Icon } from '../beats/icons'
import { RankEmblem } from '../ranked/RankEmblem'

export const KIND_LABEL = { track: 'Track', freestyle: 'Freestyle', room: 'Multiplayer' } as const

export function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
export function fmtCount(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString()
}
export function ago(at: number) {
  const s = (Date.now() - at) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(at).toLocaleDateString()
}

/** A published track: play it in place, open it for lyrics and scores, tap the creator for their profile. */
export function TrackCard({ track, onOpen, position, i = 0 }: { track: Card; onOpen: (t: Card) => void; position?: number; i?: number }) {
  const p = useFeedPlayer()
  const mine = p.id === track.id
  const placing = track.creator.events < PLACEMENT_EVENTS
  const progress = mine && p.duration ? p.time / p.duration : 0
  return (
    <article className="tcard enter" style={{ '--i': i, '--p': progress } as CSSProperties} data-playing={mine && p.playing ? '' : undefined} data-tier={placing ? undefined : rankAt(track.creator.rp).tier.id}>
      {position !== undefined && <span className="tcard__pos">#{position}</span>}
      <button
        className="tcard__play"
        aria-label={mine && p.playing ? `Pause ${track.title}` : `Play ${track.title}`}
        onClick={() => {
          audio.play('toggle')
          feedPlayer.toggle(track.id, track.duration)
        }}
      >
        <Icon name={mine && p.playing ? 'pause' : 'play'} size={18} />
      </button>
      <button className="tcard__main" onClick={() => (audio.play('confirm'), onOpen(track))}>
        <span className="tcard__title">{track.title}</span>
        <span className="tcard__meta">
          {KIND_LABEL[track.kind]} · {track.bars} bars · {fmtTime(track.duration)} · {ago(track.created)}
        </span>
        {track.caption && <span className="tcard__caption">{track.caption}</span>}
      </button>
      <button
        className="tcard__creator"
        onClick={() => {
          audio.play('confirm')
          router.navigate('profile', track.creator.name)
        }}
        title={`${track.creator.name}'s profile`}
      >
        <RankEmblem rp={track.creator.rp} size={30} divisions={false} placing={placing} />
        <span>
          <b>{track.creator.name}</b>
          <small>{placing ? 'Placing' : rankAt(track.creator.rp).label}</small>
        </span>
      </button>
      <span className="tcard__score" data-grade={track.grade}>
        <b>{track.score}</b>
        <small>{track.grade}</small>
      </span>
      <span className="tcard__stats">
        <span title="Listens">▶ {fmtCount(track.plays)}</span>
        <span title="Likes" data-on={track.liked ? '' : undefined}>
          ♥ {fmtCount(track.likes)}
        </span>
      </span>
      <i className="tcard__progress" aria-hidden />
    </article>
  )
}
