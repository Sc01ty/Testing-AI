import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/AudioEngine'
import { isReducedMotion } from '../../motion/motion'
import { movement, PLACEMENT_EVENTS, rankAt, TIERS, type Movement } from '../../ranked/ladder'
import type { AwardRecord } from '../../ranked/profile'
import { RankEmblem } from './RankEmblem'

/**
 * The end of a track: where the RP came from, the bar filling towards the
 * next division, and — when it happens — the promotion. Plays once, right
 * after the piece is awarded; reopening from Saved shows the result still.
 *
 *   breakdown lines tick in → +RP counts up → bar fills (flash + reset at each
 *   division) → verdict (PROMOTED / ONE MORE TRACK / …) → promotion overlay
 */
export function RpReveal({ award, animate, delay = 900 }: { award: AwardRecord; animate: boolean; delay?: number }) {
  const play = animate && !isReducedMotion()
  const [lines, setLines] = useState(play ? 0 : award.lines.length)
  const [count, setCount] = useState(play ? 0 : award.delta)
  const [rp, setRp] = useState(play ? award.before : award.after)
  const [flash, setFlash] = useState(0)
  const [done, setDone] = useState(!play)
  const [overlay, setOverlay] = useState<null | 'promoted' | 'placed' | 'hall-of-fame'>(null)
  const timers = useRef<number[]>([])
  const raf = useRef(0)
  const skipRef = useRef<(() => void) | null>(null)

  const placingBefore = award.placementIndex !== undefined
  const placedNow = award.placementIndex === PLACEMENT_EVENTS
  const placing = placingBefore && !placedNow
  const move: Movement = placingBefore ? 'held' : movement(award)

  useEffect(() => {
    if (!play) return
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    let t = delay
    award.lines.forEach((_, i) => {
      t += 380
      at(t, () => {
        setLines(i + 1)
        audio.play('rpTick')
      })
    })
    // count the total up
    t += 420
    const countStart = t
    const countMs = Math.min(900, 250 + Math.abs(award.delta) * 6)
    at(countStart, () => {
      const t0 = performance.now()
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / countMs)
        const v = Math.round(award.delta * easeOut(k))
        setCount((prev) => {
          if (prev !== v) audio.play('rpTick')
          return v
        })
        if (k < 1) raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    })
    // fill the bar, pausing at each division line it crosses
    t = countStart + countMs + 250
    const fillStart = t
    at(fillStart, () => {
      if (award.delta > 0) audio.play('rpFill')
      const fillMs = Math.min(2200, 700 + Math.abs(award.delta) * 9)
      const t0 = performance.now()
      let lastDiv = rankAt(award.before).floor
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / fillMs)
        const v = Math.round(award.before + (award.after - award.before) * easeInOut(k))
        const floor = rankAt(v).floor
        if (floor !== lastDiv) {
          const up = floor > lastDiv
          lastDiv = floor
          setFlash((f) => f + 1)
          if (!placingBefore) {
            const tierChange = rankAt(v).tierIndex !== rankAt(up ? v - 1 : v + 1).tierIndex
            if (up && !tierChange) audio.play('divisionUp')
            if (!up) audio.play('demote')
          }
        }
        setRp(v)
        if (k < 1) raf.current = requestAnimationFrame(step)
        else finish()
      }
      raf.current = requestAnimationFrame(step)
    })
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      skipRef.current = null
      setDone(true)
      if (placedNow) {
        setOverlay('placed')
        audio.play('impactBig')
        audio.play('rankUp')
      } else if (move === 'promoted') {
        const hof = rankAt(award.after).tier.id === 'hall-of-fame'
        setOverlay(hof ? 'hall-of-fame' : 'promoted')
        audio.play('rankUp')
        if (hof) audio.playFanfare('hallOfFame')
        else audio.play('impactBig')
      } else if (move === 'near-miss') audio.play('nearMiss')
      else if (move === 'demoted') audio.play('demote')
    }
    const skip = () => {
      timers.current.forEach(clearTimeout)
      cancelAnimationFrame(raf.current)
      setLines(award.lines.length)
      setCount(award.delta)
      setRp(award.after)
      finish()
    }
    skipRef.current = skip
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && skipRef.current) {
        e.preventDefault()
        skipRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      cancelAnimationFrame(raf.current)
      window.removeEventListener('keydown', onKey)
    }
    // the reveal runs once per award
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award.id, play])

  useEffect(() => {
    if (!overlay) return
    const close = () => setOverlay(null)
    const t = window.setTimeout(close, 5200)
    window.addEventListener('keydown', close)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', close)
    }
  }, [overlay])

  const r = rankAt(rp)
  const showRank = !placing
  const verdict = verdictFor(award, move, placedNow, placing)
  const toNext = r.next === null ? null : r.next - rp

  return (
    <section className="rp-reveal enter" onClick={() => skipRef.current?.()} data-done={done ? '' : undefined} data-move={done ? move : undefined} style={{ '--i': 1.5 } as CSSProperties} aria-label="Rank points">
      <div className="rp-reveal__emblem" key={showRank ? r.tier.id : 'placing'} data-flash={flash || undefined}>
        <RankEmblem rp={rp} size={96} placing={!showRank || (placedNow && !done)} />
      </div>

      <div className="rp-reveal__main">
        <div className="rp-reveal__head">
          <span className="eyebrow">{placing ? `Placement ${award.placementIndex} of ${PLACEMENT_EVENTS}` : placedNow && !done ? 'Final placement' : 'Rank'}</span>
          <b className="rp-reveal__rank">{placing || (placedNow && !done) ? 'PLACING…' : r.label}</b>
        </div>

        <div className="rp-reveal__bar" style={{ '--p': placing ? (award.placementIndex ?? 0) / PLACEMENT_EVENTS : r.progress } as CSSProperties} data-flash={flash % 2 ? 'a' : flash ? 'b' : undefined}>
          <i />
          {!placing && r.next !== null && <span className="rp-reveal__next">{r.nextLabel}</span>}
        </div>

        <div className="rp-reveal__foot">
          <span className="rp-reveal__to">
            {placing
              ? `${PLACEMENT_EVENTS - (award.placementIndex ?? 0)} more to place`
              : toNext === null
                ? `${rp.toLocaleString()} RP`
                : `${toNext} RP to ${r.nextLabel}`}
          </span>
          {done && <span className={`rp-reveal__verdict rp-reveal__verdict--${move}`}>{verdict}</span>}
        </div>
      </div>

      <div className="rp-reveal__delta">
        <b data-sign={award.delta > 0 ? '+' : award.delta < 0 ? '-' : '0'}>
          {count > 0 ? '+' : ''}
          {count}
        </b>
        <span className="eyebrow">RP</span>
      </div>

      <ol className="rp-reveal__lines">
        {award.lines.slice(0, lines).map((l, i) => (
          <li key={i}>
            <span>{l.label}</span>
            <b>{l.value}</b>
          </li>
        ))}
      </ol>

      {overlay && createPortal(<RankUp kind={overlay} rp={award.after} onClose={() => setOverlay(null)} />, document.body)}
    </section>
  )
}

function verdictFor(a: AwardRecord, m: Movement, placedNow: boolean, placing: boolean) {
  if (placedNow) return `PLACED · ${rankAt(a.after).label}`
  if (placing) return a.delta > 0 ? 'Placement counted' : 'Placement counted · no gain'
  if (a.shielded) return 'SHIELD SAVED YOU'
  switch (m) {
    case 'promoted':
      return 'PROMOTED'
    case 'division-up':
      return 'DIVISION UP'
    case 'near-miss':
      return 'ONE MORE TRACK'
    case 'division-down':
      return 'DIVISION DOWN'
    case 'demoted':
      return `DROPPED TO ${rankAt(a.after).tier.name}`
    default:
      return a.delta >= 0 ? 'HOLDING' : 'SLIPPED'
  }
}

/** Full-screen moment: the emblem slams in with the fanfare. Any key or click closes it. */
function RankUp({ kind, rp, onClose }: { kind: 'promoted' | 'placed' | 'hall-of-fame'; rp: number; onClose: () => void }) {
  const r = rankAt(rp)
  const tierNo = TIERS.findIndex((t) => t.id === r.tier.id) + 1
  return (
    <div className={`rank-up rank-up--${r.tier.id}`} role="dialog" aria-label={`${kind === 'placed' ? 'Placed' : 'Promoted'}: ${r.label}`} onClick={onClose}>
      <span className="rank-up__sweep" aria-hidden />
      <div className="rank-up__stack">
        <span className="eyebrow rank-up__kicker">{kind === 'placed' ? 'Placement complete' : kind === 'hall-of-fame' ? 'You made it' : `Tier ${tierNo} of ${TIERS.length}`}</span>
        <div className="rank-up__emblem">
          <RankEmblem rp={rp} size={220} />
        </div>
        <span className="rank-up__what">{kind === 'placed' ? 'PLACED' : 'PROMOTED'}</span>
        <h2 className="rank-up__name">{r.label}</h2>
        <span className="rank-up__hint">Click to continue</span>
      </div>
    </div>
  )
}

const easeOut = (k: number) => 1 - (1 - k) ** 3
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
