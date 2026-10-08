import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { Logo } from '../components/brand/Logo'
import { MenuBackdrop } from '../components/menu/MenuBackdrop'
import { router } from '../app/router'
import { MENU_ROUTES, type RouteId } from '../app/routes'
import { isReducedMotion } from '../motion/motion'
import './MenuView.css'

/**
 * Main menu, preceded on first load by a ~2s CSS brand sting:
 *
 *   0.15s RAP cuts in · 0.55s purple slice · 0.8s BUT · 1.0s RANKED focuses in
 *   1.5s hold · 2.0s sting fades as the menu builds in
 *
 * No click-to-enter: if the browser blocks autoplay, the sting is silent and
 * audio starts on the first click/key press (see App).
 */
type Phase = 'loading' | 'intro' | 'menu'

let introDone = false
/** Lets Settings ("Replay intro") request the sting again. */
export function requestIntroReplay() {
  introDone = false
}

const GLOW_POSITIONS: [string, string][] = [
  ['74%', '34%'],
  ['80%', '52%'],
  ['70%', '66%'],
  ['82%', '80%'],
]

/** Sting timings (ms) — must match the CSS delays in MenuView.css */
const MENU_AT = 2000
const OVERLAY_FADE = 320

function fontsReady() {
  const cap = new Promise((r) => setTimeout(r, 700))
  const load = document.fonts
    ? Promise.all([document.fonts.load('800 100px "Unbounded Variable"'), document.fonts.load('800 20px "Manrope Variable"')])
    : Promise.resolve()
  return Promise.race([load, cap])
}

export function MenuView({ from }: { from: RouteId | null }) {
  const [phase, setPhase] = useState<Phase>(() => (introDone || isReducedMotion() ? 'menu' : 'loading'))
  const [overlay, setOverlay] = useState(phase !== 'menu')
  const initialIndex = Math.max(0, MENU_ROUTES.findIndex((r) => r.id === from))
  const [active, setActive] = useState(initialIndex)
  const [launching, setLaunching] = useState<RouteId | null>(null)
  const [returning] = useState(from)
  const introRef = useRef<HTMLDivElement>(null)
  const menuShownAt = useRef(phase === 'menu' ? 0 : Infinity)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const timers = useRef<number[]>([])

  /** `skipped`: the user clicked/pressed to skip — swallow the rest of that gesture. */
  const showMenu = useCallback((skipped = false) => {
    timers.current.forEach(clearTimeout)
    timers.current = [window.setTimeout(() => setOverlay(false), OVERLAY_FADE)]
    introDone = true
    menuShownAt.current = skipped ? performance.now() : 0
    setPhase('menu')
  }, [])

  // Wait (briefly) for the display font, then run the sting
  useEffect(() => {
    if (phase !== 'loading') return
    let cancelled = false
    void fontsReady().then(() => {
      if (cancelled) return
      setPhase('intro')
      const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
      // only audible if the browser already allows autoplay for this site
      at(170, () => audio.play('impact'))
      at(560, () => audio.play('swish'))
      at(1060, () => audio.play('impactBig'))
      at(MENU_AT, () => showMenu())
    })
    return () => {
      cancelled = true
    }
  }, [phase, showMenu])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Centre "RAP" on its own before BUT RANKED arrive (measured on the final layout)
  useLayoutEffect(() => {
    if (phase !== 'intro') return
    const el = introRef.current
    if (!el) return
    const logo = el.querySelector('.logo')!.getBoundingClientRect()
    const rap = el.querySelector('.logo__rap')!.getBoundingClientRect()
    el.style.setProperty('--rap-shift', `${logo.left + logo.width / 2 - (rap.left + rap.width / 2)}px`)
  }, [phase])

  // Any click / key during the sting skips straight to the menu
  useEffect(() => {
    if (phase === 'menu') return
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey || e.altKey)) return
      showMenu(true)
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [phase, showMenu])

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
      {overlay && (
        <div className="intro" ref={introRef} data-out={phase === 'menu' ? '' : undefined} aria-hidden>
          <div className="intro__stage">
            <div className="intro__logo">
              <Logo size="xl" />
            </div>
            <span className="intro__slice" />
            <span className="intro__bloom" />
          </div>
        </div>
      )}

      <div className="menu-brand" style={{ viewTransitionName: 'brand' } as CSSProperties}>
        <Logo size="xl" />
      </div>

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
