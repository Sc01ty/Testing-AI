import { useEffect, useState, type CSSProperties } from 'react'
import { router, useRouteParam } from '../app/router'
import { PageShell } from '../components/layout/PageShell'
import { RankEmblem } from '../components/ranked/RankEmblem'
import { AccountPanel } from '../components/social/AccountPanel'
import { TrackCard, fmtCount } from '../components/social/TrackCard'
import { TrackSheet } from '../components/social/TrackSheet'
import { Button } from '../components/ui/ui'
import { PLACEMENT_EVENTS, rankAt } from '../ranked/ladder'
import { useRankedProfile } from '../ranked/profile'
import { useAccount } from '../social/account'
import { social, type PublicProfile, type TrackCard as Card } from '../social/api'
import { feedPlayer } from '../social/feedPlayer'

/**
 * `#/profile/<name>`: a player's rank, numbers and published tracks.
 * `#/profile` with no name is you — your local rank, plus claiming a name.
 */
export function ProfileView() {
  const name = useRouteParam()
  const account = useAccount()
  const local = useRankedProfile()
  const [p, setP] = useState<PublicProfile | null>(null)
  const [tracks, setTracks] = useState<Card[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Card | null>(null)
  const isMe = !name || (account && account.name.toLowerCase() === name.toLowerCase())

  useEffect(() => {
    setP(null)
    setError(null)
    const who = name ?? account?.name
    if (!who) return
    social
      .profile(who)
      .then((r) => (setP(r.profile), setTracks(r.tracks)))
      .catch((e) => setError(e.message))
  }, [name, account?.name])
  useEffect(() => () => feedPlayer.stop(), [])

  // you, without a name yet: your local rank and the claim panel
  const rp = isMe ? local.rp : (p?.rp ?? 0)
  const events = isMe ? local.events : (p?.events ?? 0)
  const placing = events < PLACEMENT_EVENTS
  const r = rankAt(rp)
  const shownName = name ?? account?.name ?? 'You'

  return (
    <PageShell id="profile" title={shownName.toUpperCase()} compact>
      <div className="profile">
        <section className="profile__hero enter" style={{ '--i': 2 } as CSSProperties} data-tier={placing ? undefined : r.tier.id}>
          <RankEmblem rp={rp} size={150} placing={placing} />
          <div className="profile__stats">
            <span className="eyebrow">{placing ? `Placement ${events}/${PLACEMENT_EVENTS}` : 'Rank'}</span>
            <b className="profile__rank">{placing ? 'PLACING' : r.label}</b>
            {!placing && (
              <span className="profile__rp">
                {rp.toLocaleString()} RP{r.next !== null ? ` · ${r.next - rp} to ${r.nextLabel}` : ''}
              </span>
            )}
            {p?.worldRank && r.tier.id === 'hall-of-fame' && p.worldRank <= 100 && <span className="profile__world">#{p.worldRank} WORLD</span>}
            <dl className="profile__nums">
              {p?.worldRank && (
                <div>
                  <dt>Position</dt>
                  <dd>#{p.worldRank}</dd>
                </div>
              )}
              <div>
                <dt>Peak</dt>
                <dd>{rankAt(isMe ? local.peak : (p?.peak ?? 0)).label}</dd>
              </div>
              {p && (
                <>
                  <div>
                    <dt>Tracks</dt>
                    <dd>{p.tracks}</dd>
                  </div>
                  <div>
                    <dt>Listens</dt>
                    <dd>{fmtCount(p.listens)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </section>

        {isMe && (
          <section className="panel enter profile__account" style={{ '--i': 3 } as CSSProperties}>
            <AccountPanel />
            {account?.me?.admin && (
              <Button variant="ghost" onClick={() => router.navigate('admin')}>
                Moderation
              </Button>
            )}
          </section>
        )}

        {isMe && local.history.length > 0 && (
          <section className="profile__history enter" style={{ '--i': 4 } as CSSProperties}>
            <h2 className="eyebrow">Recent RP</h2>
            <ol>
              {local.history.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <span>{h.kind === 'play' ? 'Track' : h.kind === 'freestyle' ? 'Freestyle' : 'Multiplayer'} · score {h.score}</span>
                  <b data-sign={h.delta > 0 ? '+' : h.delta < 0 ? '-' : '0'}>
                    {h.delta > 0 ? '+' : ''}
                    {h.delta} RP
                  </b>
                </li>
              ))}
            </ol>
          </section>
        )}

        {error && !isMe && <p className="feed__empty">{error}</p>}
        {tracks.length > 0 && (
          <section className="profile__tracks">
            <h2 className="eyebrow">Published</h2>
            <div className="feed__list">
              {tracks.map((t, i) => (
                <TrackCard key={t.id} track={t} onOpen={setOpen} i={Math.min(i, 8) + 5} />
              ))}
            </div>
          </section>
        )}
      </div>
      {open && <TrackSheet card={open} onClose={() => setOpen(null)} onChange={(t) => setTracks((xs) => (t ? xs.map((x) => (x.id === open.id ? { ...x, ...t } : x)) : xs.filter((x) => x.id !== open.id)))} />}
    </PageShell>
  )
}
