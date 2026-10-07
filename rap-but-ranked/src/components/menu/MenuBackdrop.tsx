import type { CSSProperties } from 'react'
import type { RouteId } from '../../app/routes'
import './MenuBackdrop.css'

/**
 * Big, faint motif on the right of the menu that changes with the selected
 * item — enough to make hovering feel alive without stealing attention.
 */
const BARS = Array.from({ length: 56 }, (_, i) => {
  const x = i / 55
  const h = 0.22 + 0.55 * Math.abs(Math.sin(x * 9.1) * Math.cos(x * 3.3)) + 0.2 * Math.abs(Math.sin(x * 31))
  return Math.min(1, h)
})

const WORDS = ['MONEY', 'SCHOOL', 'REGRET', 'SPACE', 'PRESSURE', 'HOME', 'FAME', 'LOYALTY']

export function MenuBackdrop({ active }: { active: RouteId | null }) {
  const on = (id: RouteId) => (active === id ? '' : undefined)
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop__motif backdrop__rank" data-on={on('play')}>
        <span className="backdrop__rank-s">S</span>
        <ol className="backdrop__ladder">
          {['S', 'A', 'B', 'C', 'D'].map((r) => (
            <li key={r} data-top={r === 'S' ? '' : undefined}>
              {r}
            </li>
          ))}
        </ol>
      </div>

      <div className="backdrop__motif backdrop__wave" data-on={on('beats')}>
        <div className="backdrop__bars">
          {BARS.map((h, i) => (
            <span key={i} style={{ '--h': h, '--d': `${(i % 7) * -0.37}s` } as CSSProperties} />
          ))}
          <i className="backdrop__playhead" />
        </div>
        <div className="backdrop__ruler">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </div>

      <div className="backdrop__motif backdrop__words" data-on={on('freestyle')}>
        <div className="backdrop__words-track">
          {[...WORDS, ...WORDS].map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </div>

      <div className="backdrop__motif backdrop__dial" data-on={on('settings')}>
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
