import type { CSSProperties } from 'react'
import { PLACEMENT_EVENTS, rankAt } from '../../ranked/ladder'
import { useRankedProfile } from '../../ranked/profile'
import { useAccount } from '../../social/account'
import { RankEmblem } from './RankEmblem'

/** Menu corner: your emblem, rank and how far through the division you are. */
export function RankChip({ onClick, tabIndex }: { onClick?: () => void; tabIndex?: number }) {
  const p = useRankedProfile()
  const account = useAccount()
  const placing = p.events < PLACEMENT_EVENTS
  const r = rankAt(p.rp)
  return (
    <button className="rank-chip rank-chip--live" onClick={onClick} tabIndex={tabIndex} aria-label={placing ? 'Placement in progress' : `Rank ${r.label}, ${p.rp} RP`}>
      <RankEmblem rp={p.rp} size={38} divisions={false} placing={placing} />
      <span className="rank-chip__text">
        <span className="eyebrow">{account ? account.name : 'Rank'}</span>
        <b>{placing ? `PLACEMENT ${p.events}/${PLACEMENT_EVENTS}` : r.label}</b>
        <span className="rank-chip__bar" style={{ '--p': placing ? p.events / PLACEMENT_EVENTS : r.progress } as CSSProperties}>
          <i />
        </span>
        <small>{placing ? 'Finish a track to place' : r.next === null ? `${p.rp.toLocaleString()} RP` : `${r.next - p.rp} RP to ${r.nextLabel}`}</small>
      </span>
    </button>
  )
}
