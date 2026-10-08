import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { Challenge, DirectorSource, RoundResult } from '../../domain/types'
import { isReducedMotion } from '../../motion/motion'

/**
 * The judging reveal. Categories land one at a time, then the round score,
 * then the rank. Meanwhile the director (AI or basic) is working out the
 * next challenge; it appears when both are done. Click / Space skips ahead.
 */
const WORKING: Record<string, string> = {
  rhyme: 'checking rhyme structure…',
  prompt: 'matching your bars to the challenge…',
  story: 'following the story…',
  flow: 'lining your syllables up with the beat…',
  originality: 'checking for clichés…',
}

const STEP_MS = 1250
const FIRST_MS = 1100

export function Judging({
  roundNumber,
  totalRounds,
  result,
  directorSource,
  director,
  isLast,
  onContinue,
}: {
  roundNumber: number
  totalRounds: number
  result: RoundResult
  directorSource: DirectorSource
  /** null while the director is still thinking */
  director: { analysis: string; next: Challenge | null } | null
  isLast: boolean
  onContinue: () => void
}) {
  // stage: 0 = listening, 1..5 = categories revealed, 6 = round score, 7 = rank, 8 = feedback/next
  const [stage, setStage] = useState(isReducedMotion() ? 8 : 0)
  const timers = useRef<number[]>([])
  const cats = result.categories

  useEffect(() => {
    if (stage >= 8) return
    const delay = stage === 0 ? FIRST_MS : stage === 5 ? 900 : stage === 6 ? 900 : stage === 7 ? 1100 : STEP_MS
    const t = window.setTimeout(() => setStage((s) => s + 1), delay)
    timers.current.push(t)
    return () => clearTimeout(t)
  }, [stage])

  const verdictRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  // keep the reveal on screen on smaller displays
  useEffect(() => {
    if (stage === 6) verdictRef.current?.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
    if (stage === 8) afterRef.current?.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
  }, [stage])

  useEffect(() => {
    if (stage >= 1 && stage <= 5) audio.play('toggle')
    if (stage === 6) audio.play('impact')
    if (stage === 7) audio.play(result.rank === 'S' || result.rank === 'A' ? 'impactBig' : 'impact')
    if (stage === 8) audio.play('swish')
  }, [stage, result.rank])

  const skip = () => setStage(8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      if (stage < 8) skip()
      else if (director) onContinue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, director, onContinue])

  return (
    <div className="judging" onClick={() => stage < 8 && skip()} data-stage={stage}>
      <header className="judging__head">
        <span className="eyebrow">
          Round {roundNumber} / {totalRounds}
        </span>
        <h2 className="judging__listening" data-done={stage > 0 ? '' : undefined}>
          {stage === 0 ? (directorSource === 'local-ai' ? 'Rap AI is listening' : 'The judge is listening') : 'Results'}
          {stage === 0 && <span className="dots" aria-hidden><i />
              <i />
              <i /></span>}
        </h2>
      </header>

      <ol className="cats">
        {cats.map((c, i) => {
          const shown = stage > i + 1 || stage >= 6
          const working = stage === i + 1
          return (
            <li key={c.category} className="cat" data-state={shown ? 'shown' : working ? 'working' : 'pending'} style={{ '--score': c.score } as CSSProperties}>
              <div className="cat__row">
                <span className="cat__label">{c.label}</span>
                <span className="cat__basis">{c.basis === 'audio' ? 'from your recording' : 'from your lyrics'}</span>
                <span className="cat__score">{shown ? <CountUp to={c.score} /> : working ? '' : '—'}</span>
              </div>
              <div className="cat__bar">
                <i />
              </div>
              <p className="cat__reason">{working ? WORKING[c.category] : shown ? c.reasons[0] : ''}</p>
            </li>
          )
        })}
      </ol>

      <div className="verdict" ref={verdictRef} data-shown={stage >= 6 ? '' : undefined}>
        <div className="verdict__score">
          <span className="eyebrow">Round score</span>
          <b>{stage >= 6 ? <CountUp to={result.score} ms={700} /> : '—'}</b>
        </div>
        <div className={`verdict__rank rank-letter rank-letter--${result.rank}`} data-shown={stage >= 7 ? '' : undefined} aria-label={`Rank ${result.rank}`}>
          {result.rank}
        </div>
      </div>

      {stage >= 8 && (
        <div className="aftermath" ref={afterRef}>
          <ul className="feedback">
            {result.feedback.map((f) => (
              <li key={f}>{f}</li>
            ))}
            {director?.analysis && <li className="feedback__story">{director.analysis}</li>}
          </ul>
          {!isLast && (
            <div className="next" data-ready={director ? '' : undefined}>
              <span className="eyebrow">
                Next challenge · {roundNumber + 1} / {totalRounds}
                <span className={`source-tag source-tag--${directorSource}`}>{directorSource === 'local-ai' ? 'Rap AI' : 'Basic director'}</span>
              </span>
              <p className="next__prompt">{director ? (director.next?.prompt ?? '—') : directorSource === 'local-ai' ? 'Rap AI is writing your next challenge…' : 'Choosing your next challenge…'}</p>
            </div>
          )}
          <button
            className="btn btn--primary judging__go"
            disabled={!director}
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
          >
            <span>{isLast ? 'See your track' : 'Next round'}</span>
          </button>
        </div>
      )}
      {stage < 8 && <span className="judging__skip">Click or press Space to skip</span>}
    </div>
  )
}

function CountUp({ to, ms = 550 }: { to: number; ms?: number }) {
  const [v, setV] = useState(isReducedMotion() ? to : 0)
  useEffect(() => {
    if (isReducedMotion()) return setV(to)
    const start = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - start) / ms)
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{v}</>
}
