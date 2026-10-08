import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { PlayableBeat } from '../../audio/BeatPlayer'
import { RecordError } from '../../audio/recordTake'
import type { FreestyleSession } from '../../domain/types'
import { promptIndexAt } from '../../freestyle/prompts'
import { FreestyleRecorder, type FreestyleRecording } from '../../freestyle/recorder'
import { timing } from '../../freestyle/session'
import { formatTime } from '../../lib/format'
import { useSettings } from '../../settings/useSettings'
import { useMic } from '../../audio/mic'
import { getBeatAudio } from '../../storage'
import { Icon } from '../beats/icons'
import { VocalLane } from '../play/VocalLane'

/**
 * The freestyle itself: the beat loops, a word lands every few bars, the
 * mic records the whole thing as one take. Starts as soon as it mounts.
 */
export function FreestyleLive({
  session,
  onDone,
  onCancel,
}: {
  session: FreestyleSession
  onDone: (rec: FreestyleRecording) => void
  onCancel: (error?: string) => void
}) {
  const { spb, spBar } = timing(session)
  const total = session.bars * spBar
  const [phase, setPhase] = useState<'preparing' | 'countin' | 'live' | 'finishing'>('preparing')
  const [count, setCount] = useState<number | null>(null)
  const [t, setT] = useState(-spBar)
  const [live, setLive] = useState<number[] | null>(null)
  const [settings, setSettings] = useSettings()
  const mic = useMic()
  const recorder = useRef<FreestyleRecorder | null>(null)
  const playable: PlayableBeat = useMemo(() => ({ id: session.beatId, getBlob: () => getBeatAudio(session.beatId) }), [session.beatId])

  useEffect(() => {
    const rec = new FreestyleRecorder()
    recorder.current = rec
    let alive = true
    rec
      .record(
        { beat: playable, loop: session.loop, bars: session.bars, secondsPerBeat: spb, beatsPerBar: session.beatGrid.beatsPerBar },
        {
          onPhase: (p) => alive && setPhase(p),
          onCount: (c) => alive && setCount(c),
          onTime: (x) => alive && setT(x),
          onLive: (p) => alive && setLive(p),
        },
      )
      .then((r) => {
        if (!alive) return
        if (r) onDone(r)
        else onCancel()
      })
      .catch((e) => alive && onCancel(e instanceof RecordError ? e.message : `Recording failed: ${e instanceof Error ? e.message : String(e)}`))
    return () => {
      alive = false
      rec.cancel()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc abandons the take
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      recorder.current?.cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const bar = Math.max(0, Math.min(session.bars - 1, Math.floor(t / spBar)))
  const idx = promptIndexAt(session.prompts, bar)
  const prompt = session.prompts[idx]
  const next = session.prompts[idx + 1]
  const barsToNext = next ? next.bar - bar : null
  const chaos = session.difficulty === 'chaos'

  // a soft hit when a new word lands
  const lastIdx = useRef(-1)
  useEffect(() => {
    if (phase !== 'live' || idx === lastIdx.current) return
    lastIdx.current = idx
    audio.play('swish')
  }, [idx, phase])

  return (
    <div className="fs-live" data-phase={phase}>
      <div className="fs-live__top">
        <span className="fs-live__stat">
          <span className="eyebrow">Bar</span>
          <b>{t < 0 ? '—' : `${bar + 1} / ${session.bars}`}</b>
        </span>
        <span className="fs-live__stat">
          <span className="eyebrow">Time</span>
          <b>
            {formatTime(Math.max(0, Math.min(total, t)))} / {formatTime(total)}
          </b>
        </span>
        <span className="fs-live__tools">
          <button
            className="ibtn"
            aria-pressed={settings.metronome}
            aria-label="Metronome"
            title="Metronome (never in your recording's mix)"
            onClick={() => (audio.play('toggle'), setSettings({ metronome: !settings.metronome }))}
          >
            <Icon name="metronome" size={16} />
          </button>
          <button className="tbtn tbtn--rec" data-active="" onClick={() => recorder.current?.stop()} disabled={phase === 'preparing' || phase === 'finishing'}>
            <span className="tbtn__rec-dot" /> {phase === 'finishing' ? 'Saving…' : 'Stop'}
          </button>
        </span>
      </div>

      <div className="fs-live__stage" aria-live="polite">
        <p className="eyebrow">{session.beatName} · {Math.round(session.beatGrid.bpm)} BPM · {session.category ?? 'mixed'} · MIC {mic.status==='ready'?'LIVE':mic.status}</p>
        {count !== null ? (
          <span className="countdown countdown--inline" key={`c${count}`}>
            {count}
          </span>
        ) : phase === 'preparing' ? (
          <span className="fs-live__ready">Getting the mic ready…</span>
        ) : (
          <span className="fs-live__word prompt-preview__word" key={`${idx}-${prompt.word}`}>
            {prompt.word.toUpperCase()}
          </span>
        )}
        {phase !== 'preparing' && count === null && (
          <span className="fs-live__next">
            {next ? (chaos ? 'Next: ???' : `Next · ${next.word.toUpperCase()} · in ${barsToNext} bar${barsToNext === 1 ? '' : 's'}`) : 'Last one — bring it home'}
          </span>
        )}
        {phase === 'countin' && <span className="fs-live__first">First word: {session.prompts[0].word.toUpperCase()}</span>}
      </div>

      <div className="fs-live__bars" aria-hidden style={{ '--bars': session.bars } as CSSProperties}>
        {Array.from({ length: session.bars }, (_, i) => {
          const fill = Math.max(0, Math.min(1, (t - i * spBar) / spBar))
          const p = session.prompts.find((x) => x.bar === i)
          return (
            <i key={i} data-prompt={p ? '' : undefined} style={{ '--fill': fill } as CSSProperties}>
              {p && !chaos && <em>{p.word}</em>}
            </i>
          )
        })}
      </div>
      <div className="fs-queue" aria-label="Challenge progression">{session.prompts.slice(Math.max(0,idx-1),idx+3).map(p=><span key={p.bar} data-active={p.bar===prompt.bar}>{p.bar===prompt.bar?'NOW · ':p.bar<bar?'PASSED · ':'NEXT · '}{chaos && p.bar>bar?'???':p.word}</span>)}</div>

      <div className="timeline fs-live__lane" data-recording={phase === 'live' ? '' : undefined}>
        <div className="timeline__lane">
          <span className="timeline__label">You</span>
          <VocalLane peaks={live} from={-spb} to={total + 0.6} viewFrom={-spb} viewTo={total + 0.6} recording={phase === 'live'} progress={Math.max(0, Math.min(1, (t + spb) / (total + 0.6 + spb)))} />
        </div>
      </div>
      <p className="studio__hint">Keep going — no stopping. Work each word in before the next one lands. Esc throws the take away.</p>
    </div>
  )
}
