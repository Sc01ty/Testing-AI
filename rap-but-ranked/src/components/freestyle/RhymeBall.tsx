import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { FreestyleDifficulty, FreestylePrompt } from '../../domain/types'
import { ballAt, RHYME_RUN_RULES } from '../../freestyle/rhymeRun'
import { isReducedMotion } from '../../motion/motion'

/**
 * The bouncing ball. Rows of `1 · 2 · 3 · WORD`, one per bar; the ball
 * touches down on every beat and lands on the word on beat 4.
 *
 * Nothing here runs on a CSS duration or a timer: every frame reads `clock()`
 * (timeline seconds of the audio you are hearing) and places the ball from
 * that, so it follows the beat's real BPM through stops, restarts and
 * dropped frames.
 */
export function RhymeBall({
  clock,
  secondsPerBeat,
  beatsPerBar,
  bars,
  prompts,
  difficulty,
}: {
  clock: () => number | null
  secondsPerBeat: number
  beatsPerBar: number
  bars: number
  prompts: FreestylePrompt[]
  difficulty: FreestyleDifficulty
}) {
  const stage = useRef<HTMLDivElement>(null)
  const ball = useRef<HTMLSpanElement>(null)
  const rows = useRef(new Map<number, HTMLDivElement>())
  const [pos, setPos] = useState({ bar: -1, beat: 0 })
  const rules = RHYME_RUN_RULES[difficulty]
  const byBar = useMemo(() => new Map(prompts.map((p) => [p.bar, p])), [prompts])

  useEffect(() => {
    let raf = 0
    let last = { bar: -2, beat: -1 }
    let rest: ReturnType<typeof ballAt> | null = null
    const cell = (bar: number, beat: number) => {
      const row = rows.current.get(bar)
      // land on the text itself, not the middle of its column
      const el = (row?.children[beat]?.firstElementChild ?? row?.children[beat]) as HTMLElement | undefined
      const s = stage.current
      if (!el || !s) return null
      const a = el.getBoundingClientRect()
      const b = s.getBoundingClientRect()
      // the line box sits a little above the capitals: touch down on the letters
      return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height * 0.14 }
    }
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const s = stage.current
      const t = clock()
      if (!s || !ball.current) return
      // not playing: the ball rests where it last was (or on the count-in)
      const b = t === null ? (rest ?? { bar: -1, beat: 0, phase: 0, height: 0 }) : ballAt(Math.min(t, bars * beatsPerBar * secondsPerBeat - 1e-3), secondsPerBeat, beatsPerBar)
      if (t !== null) rest = b
      s.dataset.running = t === null ? 'false' : 'true'
      if (t !== null) s.dataset.t = t.toFixed(3)
      s.dataset.phase = b.phase.toFixed(3)
      s.dataset.bar = String(b.bar)
      s.dataset.beat = String(b.beat)
      if (b.bar !== last.bar || b.beat !== last.beat) {
        last = { bar: b.bar, beat: b.beat }
        setPos(last)
      }
      // from this beat's cell to the next landing (the last beat jumps to the next row's first cell)
      const from = cell(b.bar, b.beat)
      const to = b.beat < beatsPerBar - 1 ? cell(b.bar, b.beat + 1) : (cell(b.bar + 1, 0) ?? from)
      if (!from || !to) return
      const lift = (b.beat === beatsPerBar - 1 ? 1.5 : 1) * Math.min(64, s.clientHeight * 0.16)
      const x = from.x + (to.x - from.x) * b.phase
      const y = from.y + (to.y - from.y) * b.phase - b.height * lift
      // squash on touch-down, stretch on the way up
      const squash = b.phase < 0.12 ? 1 - b.phase / 0.12 : 0
      const sx = 1 + 0.32 * squash
      const sy = 1 - 0.28 * squash + (squash ? 0 : 0.08 * Math.min(1, b.height * 2))
      ball.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${sx}, ${sy})`
      s.dataset.land = b.beat === beatsPerBar - 1 && b.phase < 0.3 ? 'word' : b.phase < 0.15 ? 'beat' : ''
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [clock, secondsPerBeat, beatsPerBar, bars])

  const reduced = isReducedMotion()
  const visible = (r: number) => {
    const ahead = r - pos.bar
    if (ahead <= 0) return true
    if (ahead > rules.preview) return false
    // the very next row shows up from `revealBeat`; easy/medium show it straight away
    return ahead > 1 || pos.bar < 0 || pos.beat >= rules.revealBeat
  }

  const list = Array.from({ length: bars + 1 }, (_, i) => i - 1)
  return (
    <div className="rr" ref={stage} data-running="false" aria-label="Rhyme run" style={{ '--row': `${-(pos.bar + 1)}` } as CSSProperties}>
      <div className="rr__rows" data-reduced={reduced ? '' : undefined}>
        {list.map((r) => {
          const p = byBar.get(r)
          const state = r < pos.bar ? 'done' : r === pos.bar ? 'now' : 'next'
          const show = visible(r)
          const tooFar = r - pos.bar > 4
          return (
            <div
              key={r}
              ref={(el) => {
                if (el) rows.current.set(r, el)
                else rows.current.delete(r)
              }}
              className="rr__row"
              data-state={state}
              data-bar={r}
              data-far={tooFar ? '' : undefined}
              data-kind={r < 0 ? 'count' : p ? 'target' : 'rest'}
              data-testid={state === 'now' ? 'rr-now' : undefined}
            >
              {Array.from({ length: beatsPerBar }, (_, k) => {
                const last = k === beatsPerBar - 1
                const text = r < 0 ? (k === 0 ? '·' : String(beatsPerBar - k)) : last ? (p ? (show ? p.word.toUpperCase() : '???') : String(k + 1)) : String(k + 1)
                return (
                  <span key={k} className={`rr__cell${last && p ? ' rr__cell--word' : ''}`} data-hidden={last && p && !show ? '' : undefined}>
                    <span className="rr__txt">{text}</span>
                  </span>
                )
              })}
              {r < 0 && <span className="rr__tag">COUNT-IN</span>}
              {r >= 0 && !p && <span className="rr__tag">BREATHE</span>}
            </div>
          )
        })}
      </div>
      <span className="rr__ball" ref={ball} aria-hidden />
    </div>
  )
}
