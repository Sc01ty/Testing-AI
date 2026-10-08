import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { audio } from '../audio/AudioEngine'
import { readBeatsTab, writeBeatsTab, type BeatsTab } from '../app/navigation'
import { beatPlayer, type PlayableBeat } from '../audio/BeatPlayer'
import { AddBeatFlow } from '../components/beats/AddBeatFlow'
import { BeatEditor, type BeatDraft } from '../components/beats/BeatEditor'
import { BeatRow } from '../components/beats/BeatRow'
import { Icon } from '../components/beats/icons'
import { PageShell } from '../components/layout/PageShell'
import { SavedShelf } from '../components/saved/SavedShelf'
import { Button } from '../components/ui/ui'
import type { SavedBeat } from '../domain/types'
import { formatBytes } from '../lib/format'
import { deleteBeat, getBeat, getBeatAudio, updateBeat } from '../storage/beatLibrary'
import { useBeats } from '../storage/useBeats'
import { listSaved, onSavedChange } from '../storage'
import '../components/beats/beats.css'

export function BeatsView() {
  const { beats, error } = useBeats()
  const [adding, setAdding] = useState<{ file: File | null; key: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const [pageDrag, setPageDrag] = useState(false)
  const dragDepth = useRef(0)
  const [tab, setTabState] = useState<BeatsTab>(readBeatsTab)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [usage, setUsage] = useState<Map<string, number>>(new Map())
  const setTab = (t: BeatsTab) => {
    writeBeatsTab(t)
    setTabState(t)
  }
  useEffect(() => {
    const load = () =>
      void listSaved().then((x) => {
        setSavedCount(x.length)
        const m = new Map<string, number>()
        for (const it of x) {
          const id = it.kind === 'track' ? it.session.beatId : it.freestyle.beatId
          m.set(id, (m.get(id) ?? 0) + 1)
        }
        setUsage(m)
      })
    load()
    return onSavedChange(load)
  }, [])

  // one player for the whole app: leaving the library stops the preview
  useEffect(() => () => beatPlayer.stop(), [])

  // The whole screen is a drop target (title, empty space, list — anywhere),
  // and a dropped file never makes the browser navigate away to it.
  const addingRef = useRef(adding)
  addingRef.current = adding
  useEffect(() => {
    const isFileDrag = (e: DragEvent | globalThis.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e) || addingRef.current) return
      dragDepth.current++
      setPageDrag(true)
    }
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setPageDrag(false)
    }
    const over = (e: globalThis.DragEvent) => e.preventDefault()
    const drop = (e: globalThis.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setPageDrag(false)
      const file = e.dataTransfer?.files?.[0]
      if (file && !addingRef.current) {
        setTab('beats')
        setEditing(null)
        setAdding({ file, key: Date.now() })
      }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const openAdd = (file: File | null = null) => {
    setEditing(null)
    setAdding({ file, key: Date.now() })
  }

  const totalBytes = (beats ?? []).reduce((a, b) => a + b.sizeBytes, 0)
  const count = beats?.length ?? 0

  return (
    <PageShell id="beats">
      <div className="library">
        <div className="tabs library__tabs enter" role="tablist" style={{ '--i': 2 } as CSSProperties}>
          {(['beats', 'saved'] as BeatsTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className="tab"
              onClick={() => {
                if (tab === t) return
                audio.play('toggle')
                beatPlayer.stop()
                setTab(t)
              }}
            >
              {t === 'beats' ? 'Beats' : 'Saved'}
              <span className="tab__count">{t === 'beats' ? (beats?.length ?? '') : (savedCount ?? '')}</span>
            </button>
          ))}
        </div>

        {tab === 'saved' ? (
          <SavedShelf beats={beats} />
        ) : (
          <>
        <div className="library__bar enter" style={{ '--i': 3 } as CSSProperties}>
          <span className="eyebrow" data-testid="beat-count">
            {beats === null ? 'Loading…' : `${count} ${count === 1 ? 'beat' : 'beats'}${count ? ` · ${formatBytes(totalBytes)}` : ''}`}
          </span>
          {!adding && count > 0 && (
            <Button variant="primary" hoverSound="hover" icon={<Icon name="plus" size={16} />} onClick={() => openAdd()}>
              Add beat
            </Button>
          )}
        </div>

        {error && (
          <p className="library__error" role="alert">
            {error}
          </p>
        )}

        {adding && (
          <AddBeatFlow
            key={adding.key}
            initialFile={adding.file}
            onClose={() => setAdding(null)}
            onSaved={(id) => {
              setAdding(null)
              setNewId(id)
              window.setTimeout(() => setNewId((n) => (n === id ? null : n)), 2400)
            }}
          />
        )}

        {beats !== null && count === 0 && !adding && <EmptyState onAdd={() => openAdd()} />}

        {count > 0 && (
          <ul className="beat-list" aria-label="Your beats">
            {beats!.map((b, i) =>
              editing === b.id ? (
                <li key={b.id} className="beat-list__editor">
                  <EditBeat id={b.id} onClose={() => setEditing(null)} />
                </li>
              ) : (
                <BeatRow
                  key={b.id}
                  beat={b}
                  index={i}
                  isNew={newId === b.id}
                  usedBy={usage.get(b.id) ?? 0}
                  onEdit={() => {
                    audio.play('confirm')
                    setAdding(null)
                    setEditing(b.id)
                  }}
                  onDelete={async () => {
                    beatPlayer.forget(b.id)
                    await deleteBeat(b.id)
                  }}
                />
              ),
            )}
          </ul>
        )}
          </>
        )}

        {pageDrag && (
          <div className="page-drop" aria-hidden>
            <span>Drop to add beat</span>
          </div>
        )}
      </div>
    </PageShell>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty enter" style={{ '--i': 4 } as CSSProperties}>
      <div className="empty__art" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <h2 className="empty__title">No beats yet</h2>
      <p className="empty__sub">Upload your first beat to start building tracks.</p>
      <Button variant="primary" hoverSound="hover" icon={<Icon name="plus" size={16} />} onClick={onAdd} className="empty__cta">
        Add beat
      </Button>
      <span className="empty__hint">or drop an MP3 / WAV anywhere</span>
    </div>
  )
}

function EditBeat({ id, onClose }: { id: string; onClose: () => void }) {
  const [beat, setBeat] = useState<SavedBeat | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void getBeat(id).then(setBeat)
  }, [id])

  if (!beat) return <div className="beat-editor beat-editor--loading" />

  const playable: PlayableBeat = { id: beat.id, getBlob: () => getBeatAudio(beat.id) }
  const save = async (d: BeatDraft) => {
    setSaving(true)
    try {
      await updateBeat(beat.id, d)
      audio.play('save')
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save changes.')
      setSaving(false)
    }
  }

  return (
    <BeatEditor
      mode="edit"
      playable={playable}
      peaks={beat.peaks}
      durationSec={beat.durationSec}
      fileName={beat.fileName}
      sizeBytes={beat.sizeBytes}
      initial={{
        name: beat.name,
        bpm: beat.bpm,
        bpmSource: beat.bpmSource,
        bpmConfidence: beat.bpmConfidence,
        introOffset: beat.introOffset,
        introOffsetSource: beat.introOffsetSource,
      }}
      saving={saving}
      error={err}
      onSave={(d) => void save(d)}
      onCancel={() => {
        audio.play('back')
        onClose()
      }}
    />
  )
}
