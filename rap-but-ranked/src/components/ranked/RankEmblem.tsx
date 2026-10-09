import type { CSSProperties } from 'react'
import { rankAt, type TierId } from '../../ranked/ladder'
import './ranked.css'

/**
 * A tier's emblem (public/ranks/<tier>.svg — swap in the Illustrator
 * exports with the same names) with the division drawn in code underneath:
 * III = one bar, II = two, I = three. Hall of Fame has none.
 */
export function RankEmblem({ rp, size = 64, divisions = true, placing = false, className = '' }: { rp: number; size?: number; divisions?: boolean; placing?: boolean; className?: string }) {
  const r = rankAt(rp)
  if (placing) return <PlacementEmblem size={size} className={className} />
  return (
    <span className={`emblem emblem--${r.tier.id} ${className}`} style={{ '--size': `${size}px` } as CSSProperties} title={r.label}>
      <img src={emblemUrl(r.tier.id)} alt={r.label} width={size} height={size} draggable={false} />
      {divisions && r.division !== null && (
        <span className="emblem__divs" aria-hidden>
          {[0, 1, 2].map((i) => (
            <i key={i} data-on={i <= r.division! ? '' : undefined} />
          ))}
        </span>
      )}
    </span>
  )
}

export const emblemUrl = (id: TierId) => `ranks/${id}.svg`

/** Before placement is done there's no rank yet: a hollow badge with a question mark. */
function PlacementEmblem({ size, className }: { size: number; className: string }) {
  return (
    <span className={`emblem emblem--placing ${className}`} style={{ '--size': `${size}px` } as CSSProperties} title="Placement">
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
        <path d="M100 14 L168 40 V98 C168 142 138 172 100 188 C62 172 32 142 32 98 V40 Z" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="10 9" strokeLinejoin="round" />
        <text x="100" y="124" textAnchor="middle" fontSize="78" fontWeight="800" fill="currentColor" fontFamily="Unbounded Variable, sans-serif">
          ?
        </text>
      </svg>
    </span>
  )
}
