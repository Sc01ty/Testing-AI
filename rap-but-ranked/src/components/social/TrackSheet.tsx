import { useEffect, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { router } from '../../app/router'
import { PLACEMENT_EVENTS, rankAt } from '../../ranked/ladder'
import { useAccount } from '../../social/account'
import { social, type TrackCard as Card, type TrackDetail } from '../../social/api'
import { feedPlayer, useFeedPlayer } from '../../social/feedPlayer'
import { Icon } from '../beats/icons'
import { RankEmblem } from '../ranked/RankEmblem'
import { Button } from '../ui/ui'
import { AccountPanel } from './AccountPanel'
import { Sheet } from './Sheet'
import { ago, fmtCount, fmtTime, KIND_LABEL } from './TrackCard'

const REASONS = ['Hate or slurs', 'Harassing someone', 'Sexual content', 'Not made in the app / stolen', 'Spam', 'Something else']

/** One published track, opened: playback with seeking, lyrics, scores, like, report. */
export function TrackSheet({ card, onClose, onChange }: { card: Card; onClose: () => void; onChange?: (t: Card | null) => void }) {
  const account = useAccount()
  const p = useFeedPlayer()
  const [t, setT] = useState<TrackDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needName, setNeedName] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const mine = p.id === card.id
  const own = account?.name.toLowerCase() === card.creator.name.toLowerCase()

  useEffect(() => {
    let live = true
    social
      .track(card.id)
      .then((r) => live && setT(r.track))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [card.id])

  useEffect(
    () =>
      feedPlayer.onPlayCounted((id, plays) => {
        if (id !== card.id) return
        setT((x) => (x ? { ...x, plays } : x))
        onChange?.({ ...card, plays })
      }),
    [card, onChange],
  )

  const view = t ?? { ...card, lyrics: [], breakdown: [], rounds: [] }
  const placing = view.creator.events < PLACEMENT_EVENTS

  const like = async () => {
    if (!account) return setNeedName(true)
    const on = !view.liked
    audio.play(on ? 'like' : 'toggle')
    setT((x) => (x ? { ...x, liked: on, likes: x.likes + (on ? 1 : -1) } : x))
    try {
      const r = await social.like(card.id, on)
      setT((x) => (x ? { ...x, liked: r.liked, likes: r.likes } : x))
      onChange?.({ ...card, liked: r.liked, likes: r.likes })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const report = async (reason: string) => {
    try {
      await social.report(card.id, reason)
      setReported(true)
      setReporting(false)
      audio.play('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const unpublish = async () => {
    try {
      await social.unpublish(card.id)
      audio.play('remove')
      if (mine) feedPlayer.stop()
      onChange?.(null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet title={view.title} onClose={onClose} wide>
      {needName ? (
        <AccountPanel reason="Claim a name to like tracks." onDone={() => setNeedName(false)} />
      ) : (
        <div className="tsheet" data-tier={placing ? undefined : rankAt(view.creator.rp).tier.id}>
          <div className="tsheet__top">
            <button className="tsheet__play" onClick={() => (audio.play('toggle'), feedPlayer.toggle(card.id, card.duration))} aria-label={mine && p.playing ? 'Pause' : 'Play'}>
              <Icon name={mine && p.playing ? 'pause' : 'play'} size={26} />
            </button>
            <div className="tsheet__seek">
              <input
                type="range"
                min={0}
                max={Math.max(1, mine ? p.duration || view.duration : view.duration)}
                step={0.1}
                value={mine ? p.time : 0}
                onChange={(e) => (mine ? feedPlayer.seek(Number(e.target.value)) : feedPlayer.toggle(card.id, card.duration))}
                aria-label="Seek"
                style={{ '--p': mine && p.duration ? p.time / p.duration : 0 } as CSSProperties}
              />
              <span>
                {fmtTime(mine ? p.time : 0)} / {fmtTime(mine && p.duration ? p.duration : view.duration)}
              </span>
            </div>
            <div className="tsheet__score" data-grade={view.grade}>
              <b>{view.score}</b>
              <span>{view.grade}</span>
            </div>
          </div>

          <div className="tsheet__row">
            <button className="tsheet__creator" onClick={() => (audio.play('confirm'), onClose(), router.navigate('profile', view.creator.name))}>
              <RankEmblem rp={view.creator.rp} size={44} placing={placing} />
              <span>
                <b>{view.creator.name}</b>
                <small>{placing ? 'Placing' : rankAt(view.creator.rp).label}</small>
              </span>
            </button>
            <span className="tsheet__meta">
              {KIND_LABEL[view.kind]} · {view.bars} bars · {view.beat || 'beat'} · {ago(view.created)}
            </span>
            <span className="tsheet__actions">
              <span className="tsheet__plays">▶ {fmtCount(view.plays)}</span>
              <button className="tsheet__like" data-on={view.liked ? '' : undefined} onClick={() => void like()} aria-pressed={view.liked}>
                ♥ {fmtCount(view.likes)}
              </button>
            </span>
          </div>

          {view.caption && <p className="tsheet__caption">{view.caption}</p>}

          {(view.breakdown.length > 0 || view.rounds.length > 0) && (
            <div className="tsheet__scores">
              {view.breakdown.map((b) => (
                <span key={b.label} className="tsheet__cat" style={{ '--score': b.score } as CSSProperties}>
                  <span>{b.label}</span>
                  <b>{b.score}</b>
                  <i />
                </span>
              ))}
              {view.rounds.length > 0 && (
                <span className="tsheet__rounds" aria-label="Round grades">
                  {view.rounds.map((r, i) => (
                    <i key={i} data-grade={r.grade} title={`Round ${i + 1}: ${r.grade} · ${r.score}`}>
                      {r.grade}
                    </i>
                  ))}
                </span>
              )}
            </div>
          )}

          {t && t.lyrics.length > 0 && (
            <ol className="tsheet__lyrics">
              {t.lyrics.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          )}
          {t && t.lyrics.length === 0 && <p className="tsheet__fine">No lyrics with this one.</p>}

          {error && (
            <p className="account__error" role="alert">
              {error}
            </p>
          )}

          <div className="tsheet__foot">
            {own ? (
              confirmRemove ? (
                <span className="tsheet__confirm">
                  Take “{view.title}” off the Feed?
                  <Button variant="quiet" onClick={() => setConfirmRemove(false)}>
                    Keep
                  </Button>
                  <Button variant="danger" onClick={() => void unpublish()}>
                    Unpublish
                  </Button>
                </span>
              ) : (
                <Button variant="quiet" onClick={() => setConfirmRemove(true)}>
                  Unpublish
                </Button>
              )
            ) : reported ? (
              <span className="tsheet__fine">Thanks — reported. Tracks with several reports are hidden until they’re checked.</span>
            ) : reporting ? (
              <span className="tsheet__report">
                <span className="eyebrow">Why?</span>
                {REASONS.map((r) => (
                  <button key={r} className="chip" onClick={() => void report(r)}>
                    {r}
                  </button>
                ))}
                <button className="chip chip--quiet" onClick={() => setReporting(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <Button variant="quiet" onClick={() => setReporting(true)}>
                Report
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
