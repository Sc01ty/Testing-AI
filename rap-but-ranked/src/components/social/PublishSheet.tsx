import { useEffect, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { useAccount } from '../../social/account'
import { social, type TrackCard } from '../../social/api'
import { kindOf, renderForFeed, sourceIdOf, summaryOf, titleOf } from '../../social/publish'
import { listSaved, type SavedItem } from '../../storage'
import { Button } from '../ui/ui'
import { AccountPanel } from './AccountPanel'
import { Sheet } from './Sheet'
import { KIND_LABEL } from './TrackCard'

/**
 * + PUBLISH RAP: pick something from Saved, give it a title and caption,
 * and it goes on the Feed as its finished mix. Only pieces made in the app.
 */
export function PublishSheet({ onClose, onPublished }: { onClose: () => void; onPublished: (t: TrackCard) => void }) {
  const account = useAccount()
  const [items, setItems] = useState<SavedItem[] | null>(null)
  const [published, setPublished] = useState<Record<string, string>>({})
  const [pick, setPick] = useState<SavedItem | null>(null)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listSaved().then(setItems)
  }, [])
  useEffect(() => {
    if (!account || !items?.length) return
    social
      .published(items.map(sourceIdOf))
      .then((r) => setPublished(r.published))
      .catch(() => {})
  }, [account, items])

  const go = async () => {
    if (!pick) return
    setError(null)
    try {
      setBusy('Mixing your track…')
      const { wav, duration } = await renderForFeed(pick)
      setBusy('Uploading…')
      const r = await social.publish({ ...summaryOf(pick), duration: Math.round(duration * 10) / 10, title: title.trim(), caption: caption.trim() }, wav)
      audio.play('publish')
      onPublished(r.track)
      onClose()
    } catch (e) {
      audio.play('error')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!account)
    return (
      <Sheet title="Publish a rap" onClose={onClose}>
        <AccountPanel reason="Your tracks go on the Feed under your name. Claim one first — it takes a second." />
      </Sheet>
    )

  return (
    <Sheet title={pick ? 'Publish' : 'Publish a rap'} onClose={onClose} wide={!pick}>
      {!pick ? (
        items === null ? (
          <p className="tsheet__fine">Loading your saved tracks…</p>
        ) : items.length === 0 ? (
          <p className="tsheet__fine">Nothing saved yet. Finish a track, a freestyle or a multiplayer track and it’ll show up here.</p>
        ) : (
          <ul className="pick-list">
            {items.map((it) => {
              const s = summaryOf(it)
              const done = published[sourceIdOf(it)]
              return (
                <li key={it.id}>
                  <button
                    className="pick"
                    disabled={!!done}
                    onClick={() => {
                      audio.play('confirm')
                      setPick(it)
                      setTitle(titleOf(it).slice(0, 60))
                    }}
                  >
                    <span className="pick__kind">{KIND_LABEL[kindOf(it)]}</span>
                    <b className="pick__title">{titleOf(it)}</b>
                    <span className="pick__meta">
                      {s.bars} bars · {s.beat} · {new Date(it.at).toLocaleDateString()}
                    </span>
                    <span className="pick__score" data-grade={s.grade}>
                      {done ? 'Published' : `${s.score} · ${s.grade}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <form
          className="publish-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) void go()
          }}
        >
          <p className="tsheet__fine">
            {KIND_LABEL[kindOf(pick)]} · {summaryOf(pick).bars} bars · score {summaryOf(pick).score} ({summaryOf(pick).grade}). The finished mix and your lyrics go public under <b>{account.name}</b>.
          </p>
          <label className="field">
            <span className="field__label">
              <span className="eyebrow">Title</span>
            </span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required />
          </label>
          <label className="field">
            <span className="field__label">
              <span className="eyebrow">Caption</span>
              <span className="eyebrow">optional</span>
            </span>
            <textarea className="input publish-form__caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} rows={2} placeholder="What’s it about?" />
          </label>
          {error && (
            <p className="account__error" role="alert">
              {error}
            </p>
          )}
          <div className="account__row">
            <Button variant="quiet" type="button" onClick={() => setPick(null)} disabled={!!busy}>
              Back
            </Button>
            <Button variant="primary" type="submit" disabled={!!busy || !title.trim()} clickSound={null}>
              {busy ?? 'Publish to the Feed'}
            </Button>
          </div>
          <p className="account__fine">Anyone can listen. Tracks with hate, slurs or harassment get reported and taken down, and the name can be banned.</p>
        </form>
      )}
    </Sheet>
  )
}
