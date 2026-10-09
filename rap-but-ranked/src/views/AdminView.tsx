import { useEffect, useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { PageShell } from '../components/layout/PageShell'
import { TrackSheet } from '../components/social/TrackSheet'
import { fmtCount } from '../components/social/TrackCard'
import { Button } from '../components/ui/ui'
import { useAccount } from '../social/account'
import { social, type TrackCard as Card } from '../social/api'

/**
 * Moderation (admins only — the server checks). Reported and hidden tracks,
 * with restore / hide / remove, and banning a name. A ban hides everything
 * the player published and stops them earning RP or publishing.
 */
export function AdminView() {
  const account = useAccount()
  const [tracks, setTracks] = useState<Card[] | null>(null)
  const [banned, setBanned] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [banName, setBanName] = useState('')
  const [open, setOpen] = useState<Card | null>(null)

  const load = () =>
    social.admin
      .queue()
      .then((r) => (setTracks(r.tracks), setBanned(r.banned)))
      .catch((e) => (setError(e.message), setTracks([])))
  useEffect(() => {
    void load()
  }, [account?.name])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      audio.play('confirm')
      await load()
    } catch (e) {
      audio.play('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PageShell id="admin" compact>
      <div className="admin">
        {error && (
          <p className="account__error" role="alert">
            {error}
          </p>
        )}
        <section className="panel">
          <h2 className="eyebrow">Reported or hidden</h2>
          {tracks === null ? (
            <p className="tsheet__fine">Loading…</p>
          ) : tracks.length === 0 ? (
            <p className="tsheet__fine">Nothing reported. Tracks hide automatically at 3 reports and show up here.</p>
          ) : (
            <ul className="admin__list">
              {tracks.map((t) => (
                <li key={t.id} data-hidden={t.hidden ? '' : undefined}>
                  <button className="admin__title" onClick={() => setOpen(t)}>
                    <b>{t.title}</b>
                    <small>
                      {t.creator.name} · {t.reports} {t.reports === 1 ? 'report' : 'reports'} · {fmtCount(t.plays)} plays · {t.hidden ? 'HIDDEN' : 'live'}
                    </small>
                  </button>
                  <span className="admin__actions">
                    {t.hidden ? <Button onClick={() => void act(() => social.admin.track(t.id, 'restore'))}>Restore</Button> : <Button onClick={() => void act(() => social.admin.track(t.id, 'hide'))}>Hide</Button>}
                    <Button variant="danger" onClick={() => void act(() => social.admin.track(t.id, 'remove'))}>
                      Remove
                    </Button>
                    <Button variant="quiet" onClick={() => void act(() => social.admin.ban(t.creator.name, true))}>
                      Ban {t.creator.name}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="eyebrow">Bans</h2>
          <form
            className="account__row"
            onSubmit={(e) => {
              e.preventDefault()
              if (banName.trim()) void act(async () => (await social.admin.ban(banName.trim(), true), setBanName('')))
            }}
          >
            <input className="input" value={banName} onChange={(e) => setBanName(e.target.value)} placeholder="Name to ban" maxLength={20} />
            <Button type="submit" variant="danger">
              Ban
            </Button>
          </form>
          {banned.length > 0 && (
            <ul className="admin__bans">
              {banned.map((n) => (
                <li key={n}>
                  {n}{' '}
                  <Button variant="quiet" onClick={() => void act(() => social.admin.ban(n, false))}>
                    Unban
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {open && <TrackSheet card={open} onClose={() => setOpen(null)} />}
    </PageShell>
  )
}
