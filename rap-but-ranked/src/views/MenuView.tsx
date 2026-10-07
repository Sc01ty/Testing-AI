import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { Logo } from '../components/brand/Logo'
import { MenuBackdrop } from '../components/menu/MenuBackdrop'
import { router } from '../app/router'
import { MENU_ROUTES, type RouteId } from '../app/routes'
import { INTRO_WAITS_FOR_INPUT } from '../app/config'
import { isReducedMotion } from '../motion/motion'
import './MenuView.css'

/**
 * Title + main menu in one screen so the brand reveal can flow straight
 * into the menu without a cut:
 *
 *   pre → rap ("RAP" rises) → reveal (BUT RANKED unfolds) → gate → menu
 *
 * The gate ("press any key") exists because browsers only allow sound after
 * a user gesture; pressing it is the moment audio + music come in.
 */
type Phase = 'pre' | 'rap' | 'reveal' | 'gate' | 'menu'

let introDone = false
/** Lets Settings ("Replay intro") request the reveal again. */
export function requestIntroReplay() {
  introDone = false
}

const GLOW_POSITIONS: [string, string][] = [
  ['74%', '34%'],
  ['80%', '52%'],
  ['70%', '66%'],
  ['82%', '80%'],
]

export function MenuView({ from }: { from: RouteId | null }) {
  const [phase, setPhase] = useState<Phase>(() => (introDone ? 'menu' : 'pre'))
  const initialIndex = Math.max(0, MENU_ROUTES.findIndex((r) => r.id === from))
  const [active, setActive] = useState(initialIndex)
  const [launching, setLaunching] = useState<RouteId | null>(null)
  const [returning] = useState(from)
  const logoRef = useRef<HTMLDivElement>(null)
  const menuShownAt = useRef(introDone ? 0 : Infinity)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Centre "RAP" on its own for the first beat of the intro
  useLayoutEffect(() => {
    if (phase !== 'pre') return
    const wrap = logoRef.current
    if (!wrap) return
    const measure = () => {
      const logo = wrap.querySelector('.logo')!.getBoundingClientRect()
      const rap = wrap.querySelector('.logo__rap')!.getBoundingClientRect()
      const shift = logo.left + logo.width / 2 - (rap.left + rap.width / 2)
      wrap.style.setProperty('--rap-shift', `${shift}px`)
    }
    measure()
    // fonts may still be swapping in; re-measure once they're ready
    void document.fonts?.ready.then(measure)
  }, [phase])

  // Intro timeline — scheduled once on mount (not per phase, or each step would cancel the next)
  useEffect(() => {
    if (introDone) return
    let cancelled = false
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !cancelled && fn(), ms))
    const afterReveal = () => setPhase((p) => (p === 'menu' ? p : INTRO_WAITS_FOR_INPUT ? 'gate' : 'menu'))
    const start = () => {
      if (cancelled) return
      if (isReducedMotion()) {
        at(50, afterReveal)
        return
      }
      at(120, () => setPhase((p) => (p === 'pre' ? 'rap' : p)))
      at(1350, () => setPhase((p) => (p === 'rap' ? 'reveal' : p)))
      at(2650, afterReveal)
    }
    // don't start the reveal with fallback fonts; cap the wait so first paint is never held hostage
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1200))]).then(start)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [])

  const enterMenu = useCallback(() => {
    audio.unlock()
    audio.setMusicMood('menu')
    audio.play('enter')
    introDone = true
    menuShownAt.current = performance.now()
    setPhase('menu')
  }, [])

  useEffect(() => {
    if (phase === 'menu') introDone = true
  }, [phase])

  // Any key / click during the intro: skip straight into the menu
  useEffect(() => {
    if (phase === 'menu') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      enterMenu()
    }
    const onPointer = () => enterMenu()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [phase, enterMenu])

  const launch = useCallback(
    (id: RouteId) => {
      // ignore the tail of the click that skipped the intro
      if (launching || performance.now() - menuShownAt.current < 450) return
      audio.unlock()
      audio.play('confirm')
      audio.play('transition')
      setLaunching(id)
      // let the press flash land before the screen changes
      window.setTimeout(() => router.navigate(id), isReducedMotion() ? 0 : 170)
    },
    [launching],
  )

  // Keyboard menu control
  useEffect(() => {
    if (phase !== 'menu') return
    const onKey = (e: KeyboardEvent) => {
      if (launching) return
      const n = MENU_ROUTES.length
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        setActive((i) => (i + 1) % n)
        audio.play('move')
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        setActive((i) => (i - 1 + n) % n)
        audio.play('move')
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && itemRefs.current.includes(document.activeElement as HTMLButtonElement)) return
        e.preventDefault()
        launch(MENU_ROUTES[active].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, active, launch, launching])

  // Steer the background light toward the selected item
  useEffect(() => {
    const [x, y] = phase === 'menu' ? GLOW_POSITIONS[active] : ['50%', '48%']
    const root = document.documentElement.style
    root.setProperty('--glow-x', x)
    root.setProperty('--glow-y', y)
  }, [phase, active])

  const hoverItem = (i: number, e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || launching) return
    if (i !== active) {
      setActive(i)
      audio.play('hover')
    }
  }

  const inMenu = phase === 'menu'

  return (
    <div className="title screen" data-phase={phase} data-returning={returning ? '' : undefined}>
      <div className="title__logo" ref={logoRef} style={inMenu ? ({ viewTransitionName: 'brand' } as CSSProperties) : undefined}>
        <div className="title__logo-inner">
          <Logo size="xl" />
        </div>
        <span className="title__bloom" aria-hidden />
        <span className="title__rule" aria-hidden />
      </div>

      <p className="title__tagline" aria-hidden={inMenu}>
        <span>Write 2 bars</span>
        <i />
        <span>Rap them</span>
        <i />
        <span>Get ranked</span>
        <i />
        <span>Build the song</span>
      </p>

      <button className="title__gate" onClick={enterMenu} tabIndex={phase === 'gate' ? 0 : -1} aria-hidden={phase !== 'gate'}>
        Press any key
      </button>

      <nav className="menu" aria-label="Main menu" aria-hidden={!inMenu}>
        <ul className="menu__list">
          {MENU_ROUTES.map((r, i) => (
            <li key={r.id} className="menu__row" style={{ '--i': i } as CSSProperties}>
              <button
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className="menu__item"
                data-active={active === i ? '' : undefined}
                data-launching={launching === r.id ? '' : undefined}
                data-skip-enter={returning === r.id ? '' : undefined}
                tabIndex={inMenu ? 0 : -1}
                onPointerEnter={(e) => hoverItem(i, e)}
                onFocus={() => setActive(i)}
                onClick={() => launch(r.id)}
              >
                <span className="menu__index">0{i + 1}</span>
                <span className="menu__label" style={{ viewTransitionName: `title-${r.id}` } as CSSProperties}>
                  {r.label}
                </span>
                <span className="menu__tagline">{r.tagline}</span>
                <span className="menu__arrow" aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <MenuBackdrop active={inMenu ? MENU_ROUTES[active].id : null} />

      <div className="title__chrome title__chrome--tr" aria-hidden={!inMenu}>
        <span className="rank-chip">
          <span className="eyebrow">Rank</span>
          <b>UNRANKED</b>
        </span>
      </div>
      <div className="title__chrome title__chrome--bl" aria-hidden={!inMenu}>
        <span className="keyhint">
          <kbd>↑</kbd>
          <kbd>↓</kbd> Select
        </span>
        <span className="keyhint">
          <kbd>Enter</kbd> Confirm
        </span>
      </div>
      <div className="title__chrome title__chrome--br" aria-hidden={!inMenu}>
        <span className="eyebrow">Stage 1 · v0.1</span>
      </div>
    </div>
  )
}
