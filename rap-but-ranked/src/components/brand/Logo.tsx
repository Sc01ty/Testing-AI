import type { CSSProperties } from 'react'
import './Logo.css'

/**
 * The wordmark. "RAP" and "RANKED" in the display face, with a small
 * accent "BUT" acting as the hinge between them. Each letter is its own
 * span so the intro can reveal them individually.
 */
const split = (word: string, startIndex: number) =>
  [...word].map((ch, i) => (
    <span key={i} className="logo__ch" style={{ '--ci': startIndex + i } as CSSProperties}>
      {ch}
    </span>
  ))

export function Logo({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'xl'; className?: string }) {
  return (
    <span className={`logo logo--${size} ${className}`} aria-label="Rap but Ranked" role="img">
      <span className="logo__word logo__rap" aria-hidden>
        {split('RAP', 0)}
      </span>
      <span className="logo__but" aria-hidden>
        <span className="logo__but-line" />
        <span className="logo__but-text">BUT</span>
        <span className="logo__but-line" />
      </span>
      <span className="logo__word logo__ranked" aria-hidden>
        {split('RANKED', 0)}
      </span>
    </span>
  )
}
