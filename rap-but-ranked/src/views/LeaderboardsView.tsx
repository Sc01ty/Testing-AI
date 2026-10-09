import { useEffect, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { router } from '../app/router'
import { PageShell } from '../components/layout/PageShell'
import { RankEmblem } from '../components/ranked/RankEmblem'
import { TrackCard } from '../components/social/TrackCard'
import { TrackSheet } from '../components/social/TrackSheet'
import { Button } from '../components/ui/ui'
import { rankAt } from '../ranked/ladder'
import { useAccount } from '../social/account'
import { social, type Board, type BoardRow, type TrackCard as Card } from '../social/api'
import { feedPlayer } from '../social/feedPlayer'

const BOARDS: { id: Board; label: string; sub: string }[] = [
  { id: 'ranked', label: 'Ranked', sub: 'Highest RP. Top 100.' },
  { id: 'listened', label: 'Most listened', sub: 'All-time plays.' },
  { id: 'trending', label: 'Trending', sub: 'Gaining listens this week.' },
  { id: 'scores', label: 'Top scores', sub: 'Highest-scoring tracks.' },
]

export function LeaderboardsView() {
  const account = useAccount()
  const [board, setBoard] = useState<Board>('ranked')
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Card | null>(null)

  const load = (b: Board) => {
    setRows(null)
    setError(null)
    social
      .leaderboard(b)
      .then((r) => setRows(r.rows))
      .catch((e) => (setError(e.message), setRows([])))
  }
  useEffect(() => load(board), [board])
  useEffect(() => () => feedPlayer.stop(), [])

  const meta = BOARDS.find((b) => b.id === board)!
  const me = account?.name.toLowerCase()

  return (
    <PageShell id="leaderboards">
      <div className="boards">
        <div className="tabs enter" role="tablist" style={{ '--i': 3 } as CSSProperties}>
          {BOARDS.map((b) => (
            <button key={b.id} role="tab" className="tab" aria-selected={board === b.id} onClick={() => (audio.play('toggle'), setBoard(b.id))}>
              {b.label}
            </button>
          ))}
        </div>
        <p className="boards__sub enter" style={{ '--i': 4 } as CSSProperties}>
          {meta.sub}
          {board === 'ranked' && account?.me?.worldRank ? ` You’re #${account.me.worldRank}.` : ''}
        </p>

        {error && (
          <p className="feed__empty" role="alert">
            {error}{' '}
            <Button variant="quiet" onClick={() => load(board)}>
              Retry
            </Button>
          </p>
        )}
        {rows === null ? (
          <div className="feed__list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tcard tcard--skeleton" />
            ))}
          </div>
        ) : rows.length === 0 && !error ? (
          <div className="feed__empty">
            <b>No one here yet.</b>
            <span>{board === 'ranked' ? 'Claim a name and finish 3 pieces to get placed.' : 'Publish a track from the Feed.'}</span>
          </div>
        ) : (
          <ol className="board">
            {rows.map((r, i) =>
              r.kind === 'player' ? (
                <li key={r.name} className="board__row enter" style={{ '--i': Math.min(i, 10) + 5 } as CSSProperties} data-me={me === r.name.toLowerCase() ? '' : undefined} data-top={r.position <= 3 ? r.position : undefined} data-tier={rankAt(r.rp).tier.id}>
                  <span className="board__pos">#{r.position}</span>
                  <button className="board__player" onClick={() => (audio.play('confirm'), router.navigate('profile', r.name))}>
                    <RankEmblem rp={r.rp} size={40} />
                    <span>
                      <b>{r.name}</b>
                      <small>{rankAt(r.rp).label}</small>
                    </span>
                  </button>
                  <span className="board__rp">
                    <b>{r.rp.toLocaleString()}</b> RP
                  </span>
                </li>
              ) : (
                <li key={r.track.id} className="board__track">
                  <TrackCard track={r.track} position={r.position} onOpen={setOpen} i={Math.min(i, 10) + 5} />
                </li>
              ),
            )}
          </ol>
        )}
      </div>
      {open && (
        <TrackSheet
          card={open}
          onClose={() => setOpen(null)}
          onChange={(t) => setRows((xs) => xs?.map((x) => (x.kind === 'track' && x.track.id === open.id ? (t ? { ...x, track: { ...x.track, ...t } } : x) : x)) ?? null)}
        />
      )}
    </PageShell>
  )
}
