import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { analyseBeat, AnalysisError, isSupportedAudio, nameFromFile, type AnalysisStep, type BeatAnalysis } from '../../audio/analysis/analyseBeat'
import { audio } from '../../audio/AudioEngine'
import { beatPlayer, type PlayableBeat } from '../../audio/BeatPlayer'
import { tidyBpm } from '../../domain/beatGrid'
import { MAX_BEAT_BYTES, saveBeat } from '../../storage/beatLibrary'
import { formatBytes } from '../../lib/format'
import { BeatEditor, type BeatDraft } from './BeatEditor'
import { Icon } from './icons'

/**
 * Add Beat: pick → analysing → setup → saved.
 * Lives inline at the top of the library (not a modal) so the new beat can
 * drop straight into the list underneath.
 */
type Stage =
  | { kind: 'pick' }
  | { kind: 'analysing'; file: File; step: AnalysisStep }
  | { kind: 'setup'; file: File; analysis: BeatAnalysis; playable: PlayableBeat }
  | { kind: 'error'; message: string }

const STEPS: { id: AnalysisStep; label: string }[] = [
  { id: 'decode', label: 'Decoding audio' },
  { id: 'waveform', label: 'Drawing waveform' },
  { id: 'tempo', label: 'Detecting tempo' },
]

/** Keep the analysing state on screen long enough to read (real analysis is often faster). */
const MIN_ANALYSE_MS = 1100

export function AddBeatFlow({ initialFile, onClose, onSaved }: { initialFile?: File | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const runId = useRef(0)
  const draftId = useRef<string | null>(null)

  const discardDraft = () => {
    if (draftId.current) beatPlayer.forget(draftId.current)
    draftId.current = null
  }
  useEffect(() => discardDraft, [])

  const start = useCallback(async (file: File) => {
    if (!isSupportedAudio(file)) {
      audio.play('error')
      setStage({ kind: 'error', message: `“${file.name}” isn't an MP3 or WAV.` })
      return
    }
    if (file.size > MAX_BEAT_BYTES) {
      audio.play('error')
      setStage({ kind: 'error', message: `That file is ${formatBytes(file.size)} — the limit is 80 MB.` })
      return
    }
    discardDraft()
    const id = ++runId.current
    audio.play('swish')
    setStage({ kind: 'analysing', file, step: 'decode' })
    const began = performance.now()
    try {
      const { analysis, buffer } = await analyseBeat(file, (step) => id === runId.current && setStage({ kind: 'analysing', file, step }))
      const wait = MIN_ANALYSE_MS - (performance.now() - began)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      if (id !== runId.current) return
      const playable: PlayableBeat = { id: `draft:${id}:${file.name}`, buffer }
      draftId.current = playable.id
      void beatPlayer.preload(playable)
      audio.play('impact')
      setStage({ kind: 'setup', file, analysis, playable })
    } catch (e) {
      if (id !== runId.current) return
      audio.play('error')
      setStage({ kind: 'error', message: e instanceof AnalysisError ? e.message : 'Something went wrong reading that file.' })
    }
  }, [])

  useEffect(() => {
    if (initialFile) void start(initialFile)
  }, [initialFile, start])

  const choose = () => inputRef.current?.click()

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void start(file)
  }

  const save = async (draft: BeatDraft) => {
    if (stage.kind !== 'setup') return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveBeat({
        name: draft.name,
        fileName: stage.file.name,
        mimeType: stage.file.type || (stage.file.name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
        sizeBytes: stage.file.size,
        durationSec: stage.analysis.durationSec,
        bpm: draft.bpm,
        bpmSource: draft.bpmSource,
        bpmConfidence: draft.bpmConfidence,
        introOffset: draft.introOffset,
        introOffsetSource: draft.introOffsetSource,
        beatsPerBar: 4,
        peaks: stage.analysis.peaks,
        blob: stage.file,
      })
      beatPlayer.stop()
      discardDraft()
      audio.play('save')
      onSaved(saved.id)
    } catch (e) {
      audio.play('error')
      setSaveError(e instanceof Error ? e.message : 'Could not save the beat.')
      setSaving(false)
    }
  }

  const cancel = () => {
    runId.current++
    beatPlayer.stop()
    discardDraft()
    audio.play('back')
    onClose()
  }

  return (
    <section className="add-beat" data-stage={stage.kind} aria-label="Add a beat">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
        hidden
        data-testid="beat-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void start(f)
        }}
      />

      {(stage.kind === 'pick' || stage.kind === 'error') && (
        <div
          className="drop"
          data-drag={dragOver ? '' : undefined}
          data-error={stage.kind === 'error' ? '' : undefined}
          key={stage.kind === 'error' ? stage.message : 'pick'}
          onClick={choose}
          onDragEnter={(e) => {
            e.preventDefault()
            if (!dragOver) audio.play('hover')
            setDragOver(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
          }}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose())}
        >
          <button
            className="icon-btn drop__close"
            onClick={(e) => {
              e.stopPropagation()
              cancel()
            }}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
          <div className="drop__wave" aria-hidden>
            {Array.from({ length: 28 }, (_, i) => (
              <span key={i} style={{ '--d': `${i * -0.08}s` } as CSSProperties} />
            ))}
          </div>
          <h2 className="drop__title">{stage.kind === 'error' ? "That didn't work" : dragOver ? 'Drop it' : 'Drop a beat here'}</h2>
          <p className="drop__sub">{stage.kind === 'error' ? stage.message : 'MP3 or WAV · or click to choose a file'}</p>
          <div className="drop__chips">
            <span>MP3</span>
            <span>WAV</span>
          </div>
        </div>
      )}

      {stage.kind === 'analysing' && <Analysing file={stage.file} step={stage.step} />}

      {stage.kind === 'setup' && (
        <BeatEditor
          mode="new"
          playable={stage.playable}
          peaks={stage.analysis.peaks}
          durationSec={stage.analysis.durationSec}
          fileName={stage.file.name}
          sizeBytes={stage.file.size}
          detected={{ ...stage.analysis.tempo, bpm: tidyBpm(stage.analysis.tempo.bpm) }}
          initial={{
            name: nameFromFile(stage.file.name),
            bpm: tidyBpm(stage.analysis.tempo.bpm),
            bpmSource: 'auto',
            bpmConfidence: Math.round(stage.analysis.tempo.confidence * 100) / 100,
            introOffset: Math.round(stage.analysis.tempo.downbeat * 1000) / 1000,
            introOffsetSource: 'auto',
          }}
          saving={saving}
          error={saveError}
          onSave={(d) => void save(d)}
          onCancel={cancel}
        />
      )}
    </section>
  )
}

function Analysing({ file, step }: { file: File; step: AnalysisStep }) {
  const index = STEPS.findIndex((s) => s.id === step)
  return (
    <div className="analysing" role="status" aria-live="polite">
      <div className="analysing__scan" aria-hidden>
        {Array.from({ length: 64 }, (_, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
        <i className="analysing__beam" />
      </div>
      <div className="analysing__text">
        <span className="eyebrow">Analysing</span>
        <h2 className="analysing__file">{file.name}</h2>
        <span className="analysing__size">{formatBytes(file.size)}</span>
      </div>
      <ol className="analysing__steps">
        {STEPS.map((s, i) => (
          <li key={s.id} data-state={i < index ? 'done' : i === index ? 'active' : 'pending'}>
            <span className="analysing__dot">{i < index && <Icon name="check" size={12} />}</span>
            {s.label}
            {i === index && '…'}
          </li>
        ))}
      </ol>
    </div>
  )
}
