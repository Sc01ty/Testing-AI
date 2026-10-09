import { useCallback, useEffect, useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { PageShell } from '../components/layout/PageShell'
import { AccountPanel } from '../components/social/AccountPanel'
import { PublishSheet } from '../components/social/PublishSheet'
import { Sheet } from '../components/social/Sheet'
import { TrackCard } from '../components/social/TrackCard'
import { TrackSheet } from '../components/social/TrackSheet'
import { Button } from '../components/ui/ui'
import { useAccount } from '../social/account'
import { social, type TrackCard as Card } from '../social/api'
import { feedPlayer } from '../social/feedPlayer'

type Sort = 'new' | 'trending'

/** Everyone's published tracks. Top right: + PUBLISH RAP. */
export function FeedView() {
  const account = useAccount()
  const [sort, setSort] = useState<Sort>('new')
  const [tracks, setTracks] = useState<Card[] | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Card | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [naming, setNaming] = useState(false)

  const load = useCallback(async (s: Sort, before?: number) => {
    setError(null)
    try {
      const r = await social.feed(s, before)
      setTracks((prev) => (before && prev ? [...prev, ...r.tracks] : r.tracks))
      setNext(r.next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (!before) setTracks([])
    }
  }, [])

  useEffect(() => {
    setTracks(null)
    void load(sort)
  }, [sort, load, account?.name])
  useEffect(() => () => feedPlayer.stop(), [])

  const replace = (id: string, t: Card | null) => setTracks((xs) => (xs ? (t ? xs.map((x) => (x.id === id ? { ...x, ...t } : x)) : xs.filter((x) => x.id !== id)) : xs))

  return (
    <PageShell
      id="feed"
      side={
        <span className="feed-side">
          {!account && (
            <Button variant="ghost" onClick={() => setNaming(true)}>
              Claim a name
            </Button>
          )}
          <Button variant="primary" onClick={() => setPublishing(true)}>
            + Publish rap
          </Button>
        </span>
      }
    >
      <div className="feed">
        <div className="tabs enter" role="tablist" style={{ '--i': 3 } as React.CSSProperties}>
          {(['new', 'trending'] as Sort[]).map((s) => (
            <button key={s} role="tab" className="tab" aria-selected={sort === s} onClick={() => (audio.play('toggle'), setSort(s))}>
              {s === 'new' ? 'New' : 'Trending'}
            </button>
          ))}
        </div>

        {error && (
          <p className="feed__empty" role="alert">
            {error}{' '}
            <Button variant="quiet" onClick={() => void load(sort)}>
              Retry
            </Button>
          </p>
        )}
        {tracks === null ? (
          <div className="feed__list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tcard tcard--skeleton" />
            ))}
          </div>
        ) : tracks.length === 0 && !error ? (
          <div className="feed__empty enter">
            <b>Nothing here yet.</b>
            <span>{sort === 'trending' ? 'Nothing’s been played this week.' : 'Be the first: finish a track and publish it.'}</span>
            <Button variant="primary" onClick={() => setPublishing(true)}>
              + Publish rap
            </Button>
          </div>
        ) : (
          <div className="feed__list">
            {tracks.map((t, i) => (
              <TrackCard key={t.id} track={t} onOpen={setOpen} i={Math.min(i, 8) + 4} />
            ))}
            {next && (
              <Button variant="quiet" onClick={() => void load(sort, next)}>
                Load more
              </Button>
            )}
          </div>
        )}
      </div>

      {open && <TrackSheet card={open} onClose={() => setOpen(null)} onChange={(t) => replace(open.id, t)} />}
      {publishing && (
        <PublishSheet
          onClose={() => setPublishing(false)}
          onPublished={(t) => {
            setSort('new')
            setTracks((xs) => [t, ...(xs ?? []).filter((x) => x.id !== t.id)])
          }}
        />
      )}
      {naming && (
        <Sheet title="Your name" onClose={() => setNaming(false)}>
          <AccountPanel onDone={() => setNaming(false)} />
        </Sheet>
      )}
    </PageShell>
  )
}
