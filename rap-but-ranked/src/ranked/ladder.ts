/**
 * The ranked ladder: tiers, divisions and how much RP a finished piece earns.
 *
 * RP isn't an average of your scores. Every tier has a PAR (the score that
 * tier expects); beat par and you climb, fall short and you drop. Early on a
 * B-grade track is a big jump; at Headliner the same track costs you. That's
 * what makes a climb feel earned.
 *
 * `public/api/social-ladder.php` is a line-for-line copy so the server can
 * work RP out itself. `ladder.test.ts` runs both against the same cases —
 * change one, change the other.
 */

export type TierId = 'open-mic' | 'cypher' | 'underground' | 'breakout' | 'mainstage' | 'headliner' | 'icon' | 'hall-of-fame'

export interface Tier {
  id: TierId
  name: string
  /** The score this tier expects from a track. */
  par: number
}

export const TIERS: Tier[] = [
  { id: 'open-mic', name: 'OPEN MIC', par: 45 },
  { id: 'cypher', name: 'CYPHER', par: 55 },
  { id: 'underground', name: 'UNDERGROUND', par: 62 },
  { id: 'breakout', name: 'BREAKOUT', par: 68 },
  { id: 'mainstage', name: 'MAINSTAGE', par: 74 },
  { id: 'headliner', name: 'HEADLINER', par: 80 },
  { id: 'icon', name: 'ICON', par: 86 },
  { id: 'hall-of-fame', name: 'HALL OF FAME', par: 90 },
]

export const DIVISION_RP = 100
export const DIVISIONS = 3
export const TIER_RP = DIVISION_RP * DIVISIONS
const TOP = TIERS.length - 1
/** RP where Hall of Fame starts (no divisions above this). */
export const HALL_OF_FAME_RP = TOP * TIER_RP
/** The first few pieces place you, up to the top of Breakout III. */
export const PLACEMENT_EVENTS = 3
export const PLACEMENT_CAP = 3 * TIER_RP + DIVISION_RP - 1
const DIV_NAMES = ['III', 'II', 'I'] as const

export interface RankPosition {
  tier: Tier
  tierIndex: number
  /** 0 = III (lowest) … 2 = I. Null in Hall of Fame. */
  division: number | null
  divisionName: 'III' | 'II' | 'I' | null
  /** "UNDERGROUND II" / "HALL OF FAME". */
  label: string
  /** RP where the current division (or Hall of Fame) starts. */
  floor: number
  /** RP where the next division starts; null in Hall of Fame. */
  next: number | null
  /** What the next step is called ("UNDERGROUND I"); null in Hall of Fame. */
  nextLabel: string | null
  /** 0..1 through the current division. */
  progress: number
}

export function tierIndexAt(rp: number) {
  return Math.min(TOP, Math.max(0, Math.floor(rp / TIER_RP)))
}

export function rankAt(rpIn: number): RankPosition {
  const rp = Math.max(0, Math.floor(rpIn))
  const tierIndex = tierIndexAt(rp)
  const tier = TIERS[tierIndex]
  if (tierIndex === TOP) {
    return { tier, tierIndex, division: null, divisionName: null, label: tier.name, floor: HALL_OF_FAME_RP, next: null, nextLabel: null, progress: 1 }
  }
  const division = Math.floor((rp - tierIndex * TIER_RP) / DIVISION_RP)
  const floor = tierIndex * TIER_RP + division * DIVISION_RP
  const next = floor + DIVISION_RP
  return {
    tier,
    tierIndex,
    division,
    divisionName: DIV_NAMES[division],
    label: `${tier.name} ${DIV_NAMES[division]}`,
    floor,
    next,
    nextLabel: rankAt(next).label,
    progress: (rp - floor) / DIVISION_RP,
  }
}

/** The score expected at this RP: slides smoothly from one tier's par to the next. Hall of Fame keeps getting harder, slowly (up to 95). */
export function parAt(rpIn: number) {
  const rp = Math.max(0, rpIn)
  const t = tierIndexAt(rp)
  if (t === TOP) return round1(TIERS[TOP].par + Math.min(5, (rp - HALL_OF_FAME_RP) / 200))
  const through = (rp - t * TIER_RP) / TIER_RP
  return round1(TIERS[t].par + (TIERS[t + 1].par - TIERS[t].par) * through)
}

// ── what a finished piece is worth ─────────────────────────────────

/**
 * Something that earns RP. `play` = a solo track (8/16/32 bars), `freestyle`
 * = a scored freestyle (seconds), `room` = your sections of an online
 * multiplayer track (the bars you rapped).
 */
export type RpEvent =
  | { id: string; kind: 'play'; score: number; bars: 8 | 16 | 32; hot?: boolean }
  | { id: string; kind: 'freestyle'; score: number; seconds: number }
  | { id: string; kind: 'room'; score: number; bars: number }

export interface LadderState {
  rp: number
  /** How many pieces have counted so far (the first PLACEMENT_EVENTS are placement). */
  events: number
  /** Tier index protected from one demotion (set on promotion), or -1. */
  shield: number
}

export interface RpOutcome {
  before: number
  after: number
  delta: number
  par: number
  multiplier: number
  hot: boolean
  placement: boolean
  /** True when the demotion shield stopped a drop out of the tier. */
  shielded: boolean
  state: LadderState
  lines: { label: string; value: string }[]
}

export function multiplierFor(e: RpEvent) {
  if (e.kind === 'play') return e.bars === 8 ? 0.6 : e.bars === 32 ? 1.6 : 1
  if (e.kind === 'freestyle') return e.seconds <= 30 ? 0.4 : e.seconds <= 60 ? 0.7 : 1
  return clamp(e.bars / 16, 0.3, 1.6)
}

export const EVENT_NAMES: Record<RpEvent['kind'], string> = { play: 'Track', freestyle: 'Freestyle', room: 'Multiplayer' }

export function applyEvent(s: LadderState, e: RpEvent): RpOutcome {
  const before = Math.max(0, Math.floor(s.rp))
  const score = clamp(Math.round(e.score), 0, 100)
  const par = parAt(before)
  const multiplier = multiplierFor(e)
  const placement = s.events < PLACEMENT_EVENTS
  const hot = e.kind === 'play' && !!e.hot
  const raw = (score - par) * 3 + 10
  const lines: RpOutcome['lines'] = [{ label: `${EVENT_NAMES[e.kind]} score ${score} vs par ${fmt1(par)}`, value: signed(Math.round(clamp(raw, -30, 60))) }]
  let delta: number
  if (placement) {
    delta = clamp(raw, 0, 150) * 2.2 * multiplier
    lines.push({ label: `Placement ${s.events + 1} of ${PLACEMENT_EVENTS}`, value: '×2.2' })
  } else {
    delta = clamp(raw, -30, 60) * multiplier
  }
  if (multiplier !== 1) lines.push({ label: lengthLabel(e), value: `×${multiplier}` })
  if (hot && delta > 0) {
    delta *= 1.1
    lines.push({ label: 'Hot streak', value: '+10%' })
  }
  delta = Math.round(delta)
  let after = Math.max(0, before + delta)
  if (placement && before <= PLACEMENT_CAP) after = Math.min(after, PLACEMENT_CAP)

  let shield = s.shield
  let shielded = false
  const fromTier = tierIndexAt(before)
  if (delta < 0 && shield >= 0) {
    if (shield === fromTier && tierIndexAt(after) < fromTier) {
      after = fromTier * TIER_RP
      shielded = true
      lines.push({ label: 'Demotion shield used', value: 'SAFE' })
    }
    shield = -1
  }
  if (tierIndexAt(after) > fromTier) shield = tierIndexAt(after)
  return { before, after, delta: after - before, par, multiplier, hot, placement, shielded, state: { rp: after, events: s.events + 1, shield }, lines }
}

function lengthLabel(e: RpEvent) {
  if (e.kind === 'play') return `${e.bars} bars`
  if (e.kind === 'freestyle') return `${e.seconds}s freestyle`
  return `${e.bars} bars in multiplayer`
}

/** How the result reads at a glance. */
export type Movement = 'promoted' | 'division-up' | 'held' | 'near-miss' | 'division-down' | 'demoted'

export function movement(o: Pick<RpOutcome, 'before' | 'after'>): Movement {
  const a = rankAt(o.before)
  const b = rankAt(o.after)
  if (b.tierIndex > a.tierIndex) return 'promoted'
  if (b.tierIndex < a.tierIndex) return 'demoted'
  if ((b.division ?? 0) > (a.division ?? 0)) return 'division-up'
  if ((b.division ?? 0) < (a.division ?? 0)) return 'division-down'
  if (b.next !== null && b.next - o.after <= 15 && o.after >= o.before) return 'near-miss'
  return 'held'
}

/** Did any of these rounds run 3+ in a row at A or S? */
export function hotStreak(ranks: (string | undefined)[]) {
  let run = 0
  for (const r of ranks) {
    run = r === 'A' || r === 'S' ? run + 1 : 0
    if (run >= 3) return true
  }
  return false
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x))
}
function round1(x: number) {
  return Math.round(x * 10) / 10
}
function fmt1(x: number) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1)
}
function signed(x: number) {
  return x > 0 ? `+${x}` : String(x)
}
