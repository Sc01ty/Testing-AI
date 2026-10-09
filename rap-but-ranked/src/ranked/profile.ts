import { useSyncExternalStore } from 'react'
import { applyEvent, type LadderState, type RpEvent, type RpOutcome } from './ladder'

/**
 * Your rank on this device. Every finished piece (track, freestyle, your
 * part of a multiplayer track) is awarded once, by id, so reopening it from
 * Saved never pays out twice.
 *
 * With a claimed name (social/account), the server is the authority: it
 * works the RP out again from the same event and its answer replaces this.
 * Events awarded before they reach the server wait in `pending`.
 */
export interface AwardRecord {
  id: string
  kind: RpEvent['kind']
  at: number
  score: number
  before: number
  after: number
  delta: number
  lines: RpOutcome['lines']
  placement: boolean
  shielded: boolean
  hot: boolean
  /** 1–3 while placing; absent once ranked. */
  placementIndex?: number
  /** The event itself, so a new account can replay this device's history. */
  event: RpEvent
}

export interface Profile extends LadderState {
  peak: number
  /** Newest first, capped. */
  history: AwardRecord[]
  /** Awarded locally, not yet confirmed by the server (only used with an account). */
  pending: RpEvent[]
}

const KEY = 'rbr.ranked.v1'
const HISTORY = 200
const EMPTY: Profile = { rp: 0, events: 0, shield: -1, peak: 0, history: [], pending: [] }

let profile: Profile = read()
const listeners = new Set<() => void>()
const awardListeners = new Set<(e: RpEvent, r: AwardRecord) => void>()

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    /* private mode / blocked storage: play on without persistence */
  }
  return EMPTY
}

function write(next: Profile) {
  profile = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn())
}

export const rankedProfile = {
  get: () => profile,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** The award for a piece, if it has had one. */
  awardFor: (id: string) => profile.history.find((h) => h.id === id) ?? null,
  /**
   * Award a finished piece. Idempotent: the same id returns its original
   * record with `fresh: false`.
   */
  award(e: RpEvent, opts: { queue?: boolean } = {}): AwardRecord & { fresh: boolean } {
    const existing = profile.history.find((h) => h.id === e.id)
    if (existing) return { ...existing, fresh: false }
    const o = applyEvent(profile, e)
    const record: AwardRecord = { id: e.id, kind: e.kind, at: Date.now(), score: Math.round(e.score), before: o.before, after: o.after, delta: o.delta, lines: o.lines, placement: o.placement, shielded: o.shielded, hot: o.hot, placementIndex: o.placement ? profile.events + 1 : undefined, event: e }
    write({
      ...o.state,
      peak: Math.max(profile.peak, o.after),
      history: [record, ...profile.history].slice(0, HISTORY),
      pending: opts.queue ? [...profile.pending, e] : profile.pending,
    })
    awardListeners.forEach((fn) => fn(e, record))
    return { ...record, fresh: true }
  },
  onAward(fn: (e: RpEvent, r: AwardRecord) => void) {
    awardListeners.add(fn)
    return () => awardListeners.delete(fn)
  },
  /** The server's answer wins. */
  setFromServer(s: LadderState & { peak: number }, confirmed: string[] = []) {
    const done = new Set(confirmed)
    write({ ...profile, rp: s.rp, events: s.events, shield: s.shield, peak: Math.max(s.peak, 0), pending: profile.pending.filter((p) => !done.has(p.id)) })
  },
  /** Every event this device has awarded (oldest first), for importing into a new account. */
  localEvents(): RpEvent[] {
    return [...profile.history].reverse().map((h) => h.event).filter(Boolean)
  },
  queue(e: RpEvent) {
    if (!profile.pending.some((p) => p.id === e.id)) write({ ...profile, pending: [...profile.pending, e] })
  },
  reset() {
    write(EMPTY)
  },
}

export function useRankedProfile() {
  return useSyncExternalStore(rankedProfile.subscribe, rankedProfile.get, rankedProfile.get)
}
