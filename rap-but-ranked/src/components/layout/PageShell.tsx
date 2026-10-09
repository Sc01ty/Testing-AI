import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { audio } from '../../audio/AudioEngine'
import { router } from '../../app/router'
import { ALL_ROUTES, BUILT_STAGE, MENU_ROUTES, NAV_ROUTES, type RouteId } from '../../app/routes'
import { Logo } from '../brand/Logo'
import { StageLock } from '../ui/ui'
import './PageShell.css'

/**
 * Frame for every non-menu screen. The brand mark and the title share
 * view-transition names with the menu, so they morph rather than cut.
 */
export function PageShell({ id, children, side, compact = false, title }: { id: RouteId; children: ReactNode; side?: ReactNode; compact?: boolean; title?: string }) {
  const meta = ALL_ROUTES.find((r) => r.id === id)!
  const numbered = [...MENU_ROUTES, ...NAV_ROUTES]
  const index = numbered.indexOf(meta)

  const back = () => {
    audio.unlock()
    audio.play('back')
    audio.play('transition')
    router.back()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const t = e.target as HTMLElement
      const typing = t.closest('input, textarea, [contenteditable="true"]')
      if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`page screen page--${id}${compact ? ' page--compact' : ''}`}>
      <header className="page__bar">
        <button className="page__brand" style={{ viewTransitionName: 'brand' } as CSSProperties} onClick={back} aria-label="Back to menu">
          <Logo size="sm" />
        </button>
      </header>

      <div className="page__head">
        <button className="page__back enter" style={{ '--i': 0 } as CSSProperties} onClick={back}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M19 12H6M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Menu</span>
          <kbd>Esc</kbd>
        </button>
        <div className="page__title-row">
          {index >= 0 && <span className="page__index">0{index + 1}</span>}
          <h1 className="page__title" style={{ viewTransitionName: `title-${id}` } as CSSProperties}>
            {title ?? meta.label}
          </h1>
          <span className="page__stage enter" style={{ '--i': 2 } as CSSProperties}>
            {meta.stage > BUILT_STAGE && id !== 'settings' ? <StageLock stage={meta.stage}>Opens in stage {meta.stage}</StageLock> : side}
          </span>
        </div>
        {!compact && (
          <p className="page__tagline enter" style={{ '--i': 1 } as CSSProperties}>
            {meta.tagline}
          </p>
        )}
      </div>

      <main className="page__body">{children}</main>
    </div>
  )
}
