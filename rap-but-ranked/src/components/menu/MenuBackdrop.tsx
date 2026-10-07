import { useRef, type CSSProperties } from 'react'
import { useMusicEnergy } from '../../audio/musicEnergy'
import { MENU_ROUTES, type RouteId } from '../../app/routes'
import './MenuBackdrop.css'

/**
 * Big, faint motif on the right of the menu that changes with the selected
 * item. Motifs sit on a vertical rail in menu order, so moving down the menu
 * slides the next one up into place (and vice versa). Everything breathes
 * with the music via `--energy`.
 */
const BARS = Array.from({ length: 56 }, (_, i) => {
  const x = i / 55
  const h = 0.22 + 0.55 * Math.abs(Math.sin(x * 9.1) * Math.cos(x * 3.3)) + 0.2 * Math.abs(Math.sin(x * 31))
  // how strongly each bar reacts: louder in the middle, a little random
  const w = 0.45 + 0.55 * Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.abs(Math.sin(i * 12.9898)))
  return { h: Math.min(1, h), w }
})

const WORDS = ['MONEY', 'SCHOOL', 'REGRET', 'SPACE', 'PRESSURE', 'HOME', 'FAME', 'LOYALTY']

export function MenuBackdrop({ active }: { active: RouteId | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useMusicEnergy(ref)
  const activeIndex = active ? MENU_ROUTES.findIndex((r) => r.id === active) : -1
  const motif = (id: RouteId) => {
    const i = MENU_ROUTES.findIndex((r) => r.id === id)
    return {
      'data-on': active === id ? '' : undefined,
      style: { '--pos': activeIndex < 0 ? 1 : Math.sign(i - activeIndex) } as CSSProperties,
    }
  }

  return (
    <div className="backdrop" aria-hidden ref={ref}>
      <div className="backdrop__motif backdrop__rank" {...motif('play')}>
        <span className="backdrop__rank-glow" />
        <span className="backdrop__rank-s">S</span>
        <ol className="backdrop__ladder">
          {['S', 'A', 'B', 'C', 'D'].map((r) => (
            <li key={r} data-top={r === 'S' ? '' : undefined}>
              {r}
            </li>
          ))}
        </ol>
      </div>

      <div className="backdrop__motif backdrop__wave" {...motif('beats')}>
        <div className="backdrop__bars">
          {BARS.map((b, i) => (
            <span key={i} style={{ '--h': b.h, '--w': b.w, '--d': `${(i % 7) * -0.37}s` } as CSSProperties} />
          ))}
          <i className="backdrop__playhead" />
        </div>
        <div className="backdrop__ruler">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </div>

      <div className="backdrop__motif backdrop__words" {...motif('freestyle')}>
        <div className="backdrop__words-track">
          {[...WORDS, ...WORDS].map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </div>

      <div className="backdrop__motif backdrop__dial" {...motif('settings')}>
        <svg viewBox="-100 -100 200 200">
          <circle r="92" className="ring" />
          <circle r="64" className="ring ring--soft" />
          <g className="ticks">
            {Array.from({ length: 48 }, (_, i) => (
              <line key={i} x1="0" y1={i % 4 === 0 ? -80 : -84} x2="0" y2="-88" transform={`rotate(${i * 7.5})`} />
            ))}
          </g>
          <g className="knob">
            <circle r="40" className="ring ring--knob" />
            <line x1="0" y1="-18" x2="0" y2="-36" />
          </g>
        </svg>
      </div>
    </div>
  )
}
