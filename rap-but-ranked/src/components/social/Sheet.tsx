import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { audio } from '../../audio/AudioEngine'
import './social.css'

/** A modal panel over the page. Esc closes it (and only it — not the page behind). */
export function Sheet({ title, onClose, children, wide = false }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      audio.play('back')
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    const prev = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      prev?.focus?.()
    }
  }, [onClose])
  return createPortal(
    <div className="sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet__panel${wide ? ' sheet__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} ref={panel}>
        <header className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button className="sheet__close" onClick={() => (audio.play('back'), onClose())} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
