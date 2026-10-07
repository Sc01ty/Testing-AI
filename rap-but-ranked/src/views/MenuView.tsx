import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { MENU_THEME_HIT, MENU_THEME_START } from '../audio/sounds'
import { Logo } from '../components/brand/Logo'
import { MenuBackdrop } from '../components/menu/MenuBackdrop'
import { router } from '../app/router'
import { MENU_ROUTES, type RouteId } from '../app/routes'
import { CLICK_TO_ENTER } from '../app/config'
import { isReducedMotion } from '../motion/motion'
import './MenuView.css'

/**
 * Title + main menu in one screen so the brand reveal flows straight into
 * the menu without a cut:
 *
 *   enter (click to enter) → pre → rap → reveal → settle → menu
 *
 * Browsers only allow sound after a gesture, so the very first screen is a
 * minimal "click to enter". That click starts the theme, and the reveal is
 * timed against the music's own clock so "RANKED" lands on the track's hit.
 */
type Phase = 'enter' | 'pre' | 'rap' | 'reveal' | 'settle' | 'menu'

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

/** Intro timings (ms). RANKED's letters visibly land ~LAND_AFTER_REVEAL after the reveal starts. */
const T = {
  rapAt: 280,
  rapImpact: 230, // after rap starts, as the letters hit the floor
  earliestReveal: 1450,
  revealFallback: 1850,
  revealCap: 2900,
  landAfterReveal: 400,
  settleAfterReveal: 1050,
  menuAfterSettle: 1000,
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function MenuView({ from }: { from: RouteId | null }) {
  const [phase, setPhase] = useState<Phase>(() =>
    introDone ? 'menu' : CLICK_TO_ENTER && !audio.isUnlocked ? 'enter' : 'pre',
  )
  const initialIndex = Math.max(0, MENU_ROUTES.findIndex((r) => r.id === from))
  const [active, setActive] = useState(initialIndex)
  const [launching, setLaunching] = useState<RouteId | null>(null)
  const [returning] = useState(from)
  const logoRef = useRef<HTMLDivElement>(null)
  const menuShownAt = useRef(introDone ? 0 : Infinity)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const cancelIntro = useRef<() => void>(() => {})

  // Centre "RAP" on its own for the first beat of the intro
  useLayoutEffect(() => {
    if (phase !== 'enter' && phase !== 'pre') return
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

  // On the enter screen: line the theme up with the reveal and start fetching it quietly
  useLayoutEffect(() => {
    if (phase !== 'enter') return
    audio.setMusicStartOffset(MENU_THEME_START)
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200))
    idle(() => audio.preloadMusic('menu'))
  }, [phase])

  const finishIntro = useCallback(() => {
    cancelIntro.current()
    introDone = true
    menuShownAt.current = performance.now()
    setPhase('menu')
  }, [])

  /**
   * Runs the reveal. With `syncToMusic`, the reveal waits for the theme to
   * reach its first hit; otherwise (music off, replay, slow load) it falls
   * back to fixed timings so the intro never stalls.
   */
  const runIntro = useCallback(
    (syncToMusic: boolean) => {
      cancelIntro.current()
      let cancelled = false
      const timers: number[] = []
      let raf = 0
      const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !cancelled && fn(), ms))
      cancelIntro.current = () => {
        cancelled = true
        timers.forEach(clearTimeout)
        cancelAnimationFrame(raf)
      }

      if (isReducedMotion()) {
        at(60, finishIntro)
        return
      }

      const reveal = () => {
        setPhase('reveal')
        at(90, () => audio.play('swish'))
        at(T.landAfterReveal, () => audio.play('impactBig'))
        at(T.settleAfterReveal, () => setPhase('settle'))
        at(T.settleAfterReveal + T.menuAfterSettle, () => {
          audio.play('transition')
          finishIntro()
        })
      }

      const begin = () => {
        if (cancelled) return
        const t0 = performance.now()
        at(T.rapAt, () => setPhase('rap'))
        at(T.rapAt + T.rapImpact, () => audio.play('impact'))
        const revealAtMusicTime = MENU_THEME_HIT - T.landAfterReveal / 1000
        const tick = () => {
          if (cancelled) return
          const elapsed = performance.now() - t0
          const mt = syncToMusic ? audio.getMusicTime('menu') : null
          let due: boolean
          if (elapsed >= T.revealCap) due = true
          else if (elapsed < T.earliestReveal) due = false
          else if (!syncToMusic) due = elapsed >= T.revealFallback
          // music running: wait for its hit. Still buffering: give it a little longer.
          else due = mt !== null ? mt >= revealAtMusicTime : elapsed >= T.revealFallback + 500
          if (due) reveal()
          else raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      }

      setPhase('pre')
      // don't start with fallback fonts; cap the wait so nothing is held hostage
      void Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 900))]).then(begin)
    },
    [finishIntro],
  )

  // No enter screen (replay, already-unlocked audio, or CLICK_TO_ENTER off): start right away
  useEffect(() => {
    if (introDone || phase !== 'pre') return
    runIntro(false)
    return () => cancelIntro.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enter = useCallback(() => {
    if (phase !== 'enter') return
    audio.setMusicStartOffset(MENU_THEME_START)
    audio.unlock()
    audio.setMusicMood('menu')
    runIntro(true)
  }, [phase, runIntro])

  useEffect(() => () => cancelIntro.current(), [])

  // Enter screen: first click / key starts everything
  useEffect(() => {
    if (phase !== 'enter') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      e.preventDefault()
      enter()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', enter)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', enter)
    }
  }, [phase, enter])

  // During the reveal, any key / click skips straight into the menu
  useEffect(() => {
    if (phase !== 'rap' && phase !== 'reveal' && phase !== 'settle') return
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey || e.altKey)) return
      e.preventDefault()
      audio.play('transition')
      finishIntro()
    }
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [phase, finishIntro])

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

      <div className="title__enter" aria-hidden={phase !== 'enter'}>
        <button className="title__enter-btn" tabIndex={phase === 'enter' ? 0 : -1}>
          {isTouch() ? 'Tap to enter' : 'Click to enter'}
        </button>
        <span className="title__enter-hint">Sound on · headphones recommended</span>
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
