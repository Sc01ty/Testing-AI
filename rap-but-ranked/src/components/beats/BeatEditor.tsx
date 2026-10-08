import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { beatPlayer, useBeatPlayer, type PlayableBeat } from '../../audio/BeatPlayer'
import { BPM_MAX, BPM_MIN, clampBpm, gridFor, tidyBpm } from '../../domain/beatGrid'
import type { BpmSource } from '../../domain/types'
import { formatBpm, formatBytes, formatTime } from '../../lib/format'
import { createTapTempo } from '../../lib/tapTempo'
import { Waveform } from './Waveform'
import { Icon } from './icons'
import { settingsStore } from '../../settings/settings'
import { useSettings } from '../../settings/useSettings'

export interface BeatDraft {
  name: string
  bpm: number
  bpmSource: BpmSource
  bpmConfidence: number | null
  introOffset: number
  introOffsetSource: 'auto' | 'manual'
}

interface Props {
  mode: 'new' | 'edit'
  playable: PlayableBeat
  peaks: number[]
  durationSec: number
  fileName: string
  sizeBytes: number
  initial: BeatDraft
  /** What the analyser found (new beats only) — lets the user snap back to it. */
  detected?: { bpm: number; confidence: number; alternatives: number[]; downbeat: number }
  saving?: boolean
  error?: string | null
  onSave: (draft: BeatDraft) => void
  onCancel: () => void
}

const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
const isInteractive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('button, input, textarea, select, a, [role="slider"]')

export function BeatEditor({ mode, playable, peaks, durationSec, fileName, sizeBytes, initial, detected, saving, error, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(initial)
  const [bpmText, setBpmText] = useState(formatBpm(initial.bpm))
  const [shownBpm, setShownBpm] = useState(mode === 'new' ? 0 : initial.bpm)
  const [tapCount, setTapCount] = useState(0)
  const tapBtn = useRef<HTMLButtonElement>(null)
  const tapper = useRef(createTapTempo())
  const player = useBeatPlayer()
  const playing = player.playing && player.beatId === playable.id
  const loading = player.loading && player.beatId === playable.id
  const position = useCallback(() => beatPlayer.position(playable.id), [playable.id])

  // BPM counts up when it first appears — the "it found the tempo" moment
  useEffect(() => {
    if (mode !== 'new') return
    const target = initial.bpm
    const start = performance.now()
    const dur = 750
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setShownBpm(k < 1 ? Math.round(target * eased) : target)
      if (k < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setBpm = (bpm: number, source: BpmSource, confidence: number | null = null) => {
    const v = tidyBpm(clampBpm(bpm))
    setDraft((d) => ({ ...d, bpm: v, bpmSource: source, bpmConfidence: confidence }))
    setBpmText(formatBpm(v))
    setShownBpm(v)
  }

  const commitBpmText = () => {
    const v = Number(bpmText.replace(',', '.'))
    if (Number.isFinite(v) && v >= BPM_MIN && v <= BPM_MAX) {
      if (v !== draft.bpm) {
        setBpm(v, 'manual')
        audio.play('toggle')
      }
    } else {
      setBpmText(formatBpm(draft.bpm))
      audio.play('error')
    }
  }

  const tap = useCallback(() => {
    const r = tapper.current.tap()
    setTapCount(r.count)
    // replay the pulse without remounting the button (keeps keyboard focus)
    tapBtn.current?.animate(
      [{ background: 'rgb(123 69 240 / 0.5)', color: '#fff', transform: 'scale(0.94)' }, { transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
    audio.play('move')
    if (r.bpm) setBpm(r.bpm, 'tap')
  }, [])

  const setOffset = (seconds: number, source: 'auto' | 'manual' = 'manual') =>
    setDraft((d) => ({ ...d, introOffset: Math.round(Math.max(0, Math.min(durationSec - 1, seconds)) * 1000) / 1000, introOffsetSource: source }))

  const clickGrid = useMemo(() => ({ origin: draft.introOffset, secondsPerBeat: 60 / draft.bpm, beatsPerBar: 4 }), [draft.introOffset, draft.bpm])
  const togglePlay = useCallback(() => beatPlayer.toggle(playable, clickGrid), [playable, clickGrid])
  const [settings, setSettings] = useSettings()

  // with the metronome on, BPM / start changes are heard straight away: the clicks re-lock to the new grid
  useEffect(() => {
    if (!settingsStore.get().metronome || !beatPlayer.isPlaying(playable.id)) return
    void beatPlayer.play(playable, { from: beatPlayer.position(playable.id) ?? 0, grid: clickGrid })
  }, [clickGrid, settings.metronome]) // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: Space play/pause, T tap, Esc cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onCancel()
        return
      }
      if (isTyping(e.target)) return
      if (e.key === ' ' && !isInteractive(e.target)) {
        e.preventDefault()
        togglePlay()
      } else if ((e.key === 't' || e.key === 'T') && !e.repeat) {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel, tap, togglePlay])

  const grid = gridFor({ bpm: draft.bpm, introOffset: draft.introOffset, durationSec })
  const confidenceWord =
    draft.bpmConfidence === null ? '' : draft.bpmConfidence >= 0.75 ? ' · confident' : draft.bpmConfidence >= 0.45 ? ' · fairly sure' : ' · unsure'
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])
  const lowConfidence = draft.bpmSource === 'auto' && (draft.bpmConfidence ?? 0) < 0.45

  const save = () => {
    const name = draft.name.trim() || fileName.replace(/\.[^.]+$/, '')
    onSave({ ...draft, name })
  }

  return (
    <div className="beat-editor" data-mode={mode} ref={rootRef}>
      <header className="beat-editor__head">
        <span className="eyebrow">
          {mode === 'new' ? 'New beat' : 'Edit beat'} · {fileName} · {formatBytes(sizeBytes)}
        </span>
        <button className="icon-btn" onClick={onCancel} aria-label="Close" title="Close (Esc)">
          <Icon name="close" />
        </button>
      </header>

      <label className="beat-editor__name">
        <span className="visually-hidden">Beat name</span>
        <input
          className="beat-editor__name-input"
          value={draft.name}
          maxLength={60}
          placeholder="Beat name"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>

      <div className="beat-editor__wave">
        <Waveform
          peaks={peaks}
          duration={durationSec}
          height={132}
          barWidth={2}
          gap={1}
          bpm={draft.bpm}
          offset={draft.introOffset}
          barNumbers
          position={position}
          animate={playing}
          onSeek={(t) => beatPlayer.seek(playable, t)}
          onOffsetChange={(t) => setOffset(t)}
          reveal={mode === 'new'}
          label="Beat waveform. Click to seek, drag the start marker to set the intro."
        />
      </div>

      <div className="beat-editor__transport">
        <button className="transport-btn" onClick={() => beatPlayer.seek(playable, 0)} aria-label="Back to start" title="Back to start">
          <Icon name="restart" />
        </button>
        <button className="transport-btn transport-btn--main" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} data-loading={loading ? '' : undefined}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button className="transport-btn transport-btn--text" onClick={() => void beatPlayer.play(playable, { from: draft.introOffset, grid: clickGrid })}>
          <Icon name="play" size={12} /> From start marker
        </button>
        <button
          className="ibtn"
          aria-pressed={settings.metronome}
          aria-label="Metronome"
          title={settings.metronome ? 'Metronome on — clicks follow the BPM, so you can check it by ear' : 'Metronome off — turn on to check the BPM by ear'}
          onClick={() => (audio.play('toggle'), setSettings({ metronome: !settings.metronome }))}
        >
          <Icon name="metronome" size={16} />
        </button>
        <TimeReadout beatId={playable.id} duration={durationSec} playing={playing} />
        <span className="beat-editor__keys">
          <kbd>Space</kbd> play <kbd>T</kbd> tap
        </span>
      </div>

      <div className="beat-editor__stats">
        <section className="stat stat--bpm">
          <div className="stat__head">
            <span className="eyebrow">BPM</span>
            <span className={`source source--${draft.bpmSource}`}>
              {draft.bpmSource === 'auto' ? `Auto${confidenceWord}` : draft.bpmSource === 'tap' ? 'Tapped' : 'Manual'}
            </span>
          </div>
          <div className="stat__bpm-row">
            <output className="stat__bpm" aria-live="polite" data-testid="bpm-value">
              {formatBpm(shownBpm)}
            </output>
            <div className="bpm-controls">
              <div className="bpm-input">
                <button aria-label="BPM down" onClick={() => setBpm(draft.bpm - 1, 'manual')}>
                  −
                </button>
                <input
                  aria-label="BPM"
                  inputMode="decimal"
                  value={bpmText}
                  onChange={(e) => setBpmText(e.target.value)}
                  onBlur={commitBpmText}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                />
                <button aria-label="BPM up" onClick={() => setBpm(draft.bpm + 1, 'manual')}>
                  +
                </button>
              </div>
              <div className="bpm-quick">
                <button onClick={() => setBpm(draft.bpm / 2, 'manual')} title="Half-time">
                  ½×
                </button>
                <button onClick={() => setBpm(draft.bpm * 2, 'manual')} title="Double-time">
                  2×
                </button>
                {detected && draft.bpm !== tidyBpm(detected.bpm) && (
                  <button onClick={() => setBpm(detected.bpm, 'auto', detected.confidence)} title="Back to the detected tempo">
                    Auto
                  </button>
                )}
                <button className="tap-btn" ref={tapBtn} onClick={tap} title="Tap along (T)">
                  Tap{tapCount > 0 && tapCount < 4 ? ` ${tapCount}/4` : ''}
                </button>
              </div>
            </div>
          </div>
          <p className="stat__note">
            {lowConfidence
              ? 'Not sure about this one — tap along or type the BPM in.'
              : draft.bpmSource === 'auto'
                ? 'Detected from the drums. Half/double-time is common — check it by ear.'
                : `1 beat = ${grid.secondsPerBeat.toFixed(3)}s`}
          </p>
        </section>

        <section className="stat">
          <span className="eyebrow">Length</span>
          <b className="stat__big">{formatTime(durationSec)}</b>
          <p className="stat__note">
            {grid.barCount} bars of 4/4 · 1 bar = {grid.secondsPerBar.toFixed(2)}s
          </p>
        </section>

        <section className="stat">
          <div className="stat__head">
            <span className="eyebrow">Start (bar 1)</span>
            <span className={`source source--${draft.introOffsetSource}`}>{draft.introOffsetSource === 'auto' ? 'Auto' : 'Manual'}</span>
          </div>
          <b className="stat__big">{draft.introOffset.toFixed(2)}s</b>
          <div className="bpm-quick">
            <button
              onClick={() => {
                const p = beatPlayer.position(playable.id)
                if (p !== null) setOffset(p)
              }}
              title="Put bar 1 where the playhead is"
            >
              Use playhead
            </button>
            {detected ? (
              <button onClick={() => setOffset(detected.downbeat, 'auto')}>Auto</button>
            ) : (
              <button onClick={() => setOffset(0)}>0:00</button>
            )}
          </div>
          <p className="stat__note">Drag the marker on the waveform to skip a long intro.</p>
        </section>
      </div>

      <footer className="beat-editor__foot">
        {error && <p className="beat-editor__error" role="alert">{error}</p>}
        <button className="btn btn--quiet" onClick={onCancel}>
          <span>Cancel</span>
        </button>
        <button className="btn btn--primary beat-editor__save" onClick={save} disabled={saving}>
          <span>{saving ? 'Saving…' : mode === 'new' ? 'Save beat' : 'Save changes'}</span>
        </button>
      </footer>
    </div>
  )
}

function TimeReadout({ beatId, duration, playing }: { beatId: string; duration: number; playing: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useBeatPlayer() // re-render on seek/stop so the paused time is right
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const paint = () => (el.textContent = formatTime(beatPlayer.position(beatId) ?? 0))
    paint()
    if (!playing) return
    let raf = requestAnimationFrame(function tick() {
      paint()
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  })
  return (
    <span className="time-readout" style={{ '--w': '4ch' } as CSSProperties}>
      <span ref={ref}>0:00</span> / {formatTime(duration)}
    </span>
  )
}
