import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { Icon } from '../beats/icons'

export type PlayMode = 'play' | 'improve'

/**
 * PLAY → choose: make a track, or learn from the ones you've made.
 * Same big type and motion as the main menu. IMPROVE stays locked until
 * there's a finished track to learn from.
 */
export function ModeSelect({ improveUnlocked, hasActive, onPick }: { improveUnlocked: boolean | null; hasActive: boolean; onPick: (m: PlayMode) => void }) {
  const [active, setActive] = useState(0)
  const [lockedMsg, setLockedMsg] = useState(false)
  const [shake, setShake] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const items: { id: PlayMode; label: string; tagline: string; locked: boolean }[] = [
    { id: 'play', label: 'PLAY', tagline: hasActive ? 'Continue your track, or start a new one.' : 'Write 2 bars at a time. Build a track. Get ranked.', locked: false },
    { id: 'improve', label: 'IMPROVE', tagline: improveUnlocked ? 'Learn from your saved raps.' : 'Locked — finish a rap first.', locked: !improveUnlocked },
  ]

  const pick = (i: number) => {
    const it = items[i]
    if (it.locked) {
      audio.play('error')
      setLockedMsg(true)
      setShake((n) => n + 1)
      return
    }
    audio.play('confirm')
    onPick(it.id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 's' || e.key === 'w') {
        e.preventDefault()
        setActive((a) => (a + 1) % 2)
        audio.play('move')
      } else if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault()
        pick(active)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="modes">
      <ul className="modes__list">
        {items.map((it, i) => (
          <li key={it.id} className="enter" style={{ '--i': 2 + i } as CSSProperties}>
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              className="menu__item modes__item"
              data-active={active === i ? '' : undefined}
              data-locked={it.locked ? '' : undefined}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse' || active === i) return
                setActive(i)
                audio.play('hover')
              }}
              onFocus={() => setActive(i)}
              onClick={() => pick(i)}
              data-shake={it.locked && shake ? shake % 2 : undefined}
            >
              <span className="menu__index">0{i + 1}</span>
              <span className="menu__label">
                {it.label}
                {it.locked && (
                  <span className="modes__lock" aria-label="locked">
                    <Icon name="lock" size={28} />
                  </span>
                )}
              </span>
              <span className="menu__tagline">{it.tagline}</span>
              <span className="menu__arrow" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lockedMsg && (
        <div className="modes__locked" role="alert" key={shake}>
          <b>COMPLETE A RAP FIRST</b>
          <span>I need something to analyse before I can help you improve.</span>
        </div>
      )}
    </div>
  )
}
