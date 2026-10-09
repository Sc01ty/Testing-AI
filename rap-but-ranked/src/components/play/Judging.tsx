import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { CategoryScore, Challenge, DirectorSource, Rank } from '../../domain/types'
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
  meaning: 'reading what you actually said…',
  cadence: 'counting syllables against the bar…',
  naturalness: 'checking it sounds like a person talking…',
  structure: 'following the song so far…',
  wordplay: 'looking for second meanings…',
  performance: 'lining your syllables up with the beat…',
  prompts: 'finding the prompts in what you said…',
  continuity: 'checking you kept going…',
  variety: 'counting repeats…',
  timing: 'checking detected onsets against the grid…',
}
const BASIS: Record<CategoryScore['basis'], string> = { audio: 'from your recording', lyrics: 'from your lyrics', transcript: 'from what you said' }

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
  eyebrow,
  scoreLabel = 'Round score',
  listening,
  after,
  continueLabel,
  holding = false,
}: {
  roundNumber?: number
  totalRounds?: number
  result: { categories: CategoryScore[]; score: number; rank: Rank; feedback: string[]; writingScore?: number; performanceScore?: number | null; coach?: { engine: 'rules' | 'local-ai'; notes: string[] } }
  directorSource?: DirectorSource
  /** null while the director is still thinking */
  director?: { analysis: string; next: Challenge | null } | null
  isLast?: boolean
  onContinue: () => void
  /** Overrides for other uses (Freestyle): header, score label, "listening" line, what follows the verdict. */
  eyebrow?: string
  scoreLabel?: string
  listening?: string
  after?: ReactNode
  continueLabel?: string
  /** Hold on "listening" (e.g. while the local model refines the analysis). */
  holding?: boolean
}) {
  const cats = result.categories
  const n = cats.length
  const SCORE = n + 1
  const RANK = n + 2
  const DONE = n + 3
  const ready = after !== undefined || !!director
  // stage: 0 = listening, 1..n = categories revealed, n+1 = score, n+2 = rank, n+3 = feedback/next
  const [stage, setStage] = useState(isReducedMotion() ? DONE : 0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (stage >= DONE || (stage === 0 && holding)) return
    const delay = stage === 0 ? FIRST_MS : stage === n ? 900 : stage === SCORE ? 900 : stage === RANK ? 1100 : STEP_MS
    const t = window.setTimeout(() => setStage((s) => s + 1), delay)
    timers.current.push(t)
    return () => clearTimeout(t)
  }, [stage, n, SCORE, RANK, DONE, holding])

  const verdictRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  // keep the reveal on screen on smaller displays
  useEffect(() => {
    if (stage === SCORE) verdictRef.current?.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
    if (stage === DONE) afterRef.current?.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
  }, [stage, SCORE, DONE])

  useEffect(() => audio.preloadScoreNotes(), [])
  // the scoring rise: each category score lands on the next note up, the round score on the top C6
  useEffect(() => {
    if (stage >= 2 && stage <= n) audio.playRise(stage - 2, n)
    if (stage === SCORE) audio.playRise(n - 1, n)
    if (stage === RANK) audio.play(result.rank === 'S' || result.rank === 'A' ? 'impactBig' : 'impact')
    if (stage === DONE) audio.play('swish')
  }, [stage, result.rank, n, SCORE, RANK, DONE])

  useEffect(()=>{if(stage >= SCORE || isReducedMotion())return;return audio.startAnalysis()},[stage >= SCORE, SCORE])
  const skip = () => setStage(DONE)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (e.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select')) return
      e.preventDefault()
      if (stage < DONE) skip()
      else if (ready) onContinue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, ready, onContinue, DONE])

  return (
    <div className="judging" onClick={() => stage < DONE && skip()} data-stage={stage}>
      <header className="judging__head">
        <span className="eyebrow">{eyebrow ?? `Round ${roundNumber} / ${totalRounds}`}</span>
        <h2 className="judging__listening" data-done={stage > 0 ? '' : undefined}>
          {stage === 0 ? (listening ?? (directorSource === 'local-ai' ? 'Rap AI is listening' : 'The judge is listening')) : 'Results'}
          {stage === 0 && <span className="dots" aria-hidden><i />
              <i />
              <i /></span>}
        </h2>
      </header>

      <ol className="cats">
        {cats.map((c, i) => {
          const shown = stage > i + 1 || stage >= SCORE
          const working = stage === i + 1
          return (
            <li key={c.category} className="cat" data-state={shown ? 'shown' : working ? 'working' : 'pending'} style={{ '--score': c.score } as CSSProperties}>
              <div className="cat__row">
                <span className="cat__label">{c.label}</span>
                <span className="cat__basis">{BASIS[c.basis]}</span>
                <span className="cat__score">{shown ? <CountUp to={c.score} /> : working ? '' : '—'}</span>
              </div>
              <div className="cat__bar">
                <i />
              </div>
              <p className="cat__reason">{working ? WORKING[c.category] : shown ? c.reasons[0] : ''}</p>
              {shown && c.confidence && <span className="eyebrow">Confidence: {c.confidence}</span>}
              {shown && c.reasons.length > 1 && <details onClick={e => e.stopPropagation()}><summary>Why this score?</summary>{c.reasons.slice(1).map(r => <p className="cat__reason" key={r}>{r}</p>)}</details>}
            </li>
          )
        })}
      </ol>

      <div className="verdict" ref={verdictRef} data-shown={stage >= SCORE ? '' : undefined}>
        <div className="verdict__score">
          <span className="eyebrow">{scoreLabel}</span>
          <b>{stage >= SCORE ? <CountUp to={result.score} ms={700} /> : '—'}</b>
          {stage >= SCORE && result.writingScore !== undefined && (
            <span className="verdict__split">
              Writing {result.writingScore}
              {typeof result.performanceScore === 'number' ? ` · Performance ${result.performanceScore}` : ' · no recording to judge'}
            </span>
          )}
        </div>
        <div className={`verdict__rank rank-letter rank-letter--${result.rank}`} data-shown={stage >= RANK ? '' : undefined} aria-label={`Rank ${result.rank}`}>
          {result.rank}
        </div>
      </div>

      {stage >= DONE && (
        <div className="aftermath" ref={afterRef}>
          <ul className="feedback">
            {result.feedback.map((f) => (
              <li key={f}>{f}</li>
            ))}
            {result.coach?.notes.slice(0, 2).map((n) => (
              <li key={n} className="feedback__note">
                {n}
              </li>
            ))}
            {director?.analysis && <li className="feedback__story">{director.analysis}</li>}
          </ul>
          {result.coach && <span className="judging__engine">Analysis: {result.coach.engine === 'local-ai' ? 'Rap AI + rules' : 'rules (deterministic)'}</span>}
          {after}
          {after === undefined && !isLast && roundNumber !== undefined && totalRounds !== undefined && (
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
            disabled={!ready}
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
          >
            <span>{continueLabel ?? (isLast ? 'See your track' : 'Next round')}</span>
          </button>
        </div>
      )}
      {stage < DONE && <span className="judging__skip">Click or press Space to skip</span>}
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
