/**
 * The movable START / END window over the beat.
 *
 * A round (or online turn) owns a *zone* of the beat. Inside it the player
 * drags START and END to choose exactly where their bars go. The window can
 * be trimmed or slid, but never stretched past `maxLen` (the bars the round
 * is for) and never outside the zone, so it can't eat the next section.
 * Everything snaps to beats so the count-in and metronome stay on the grid.
 */
export interface SectionWindow {
  start: number
  end: number
}

export interface SectionZone {
  /** Earliest START (beat-file seconds). */
  min: number
  /** Latest END (beat-file seconds). */
  max: number
  /** Longest the window may be (e.g. two bars). */
  maxLen: number
  /** Shortest the window may be (one bar). */
  minLen: number
  /** Snap size (one beat) and the grid it locks to. */
  step: number
  origin: number
}

export type DragEdge = 'start' | 'end' | 'move'

const EPS = 1e-6

export function snapTo(zone: Pick<SectionZone, 'step' | 'origin'>, t: number) {
  return zone.origin + Math.round((t - zone.origin) / zone.step) * zone.step
}

/** True when the window is as long as it's allowed to be. */
export function atMaxLength(zone: SectionZone, w: SectionWindow) {
  return w.end - w.start >= zone.maxLen - 1e-3
}

/**
 * Apply a drag. `t` is the pointer time for START/END; for a move it's the
 * desired new START. Returns the clamped window and whether a limit stopped it
 * (so the UI can show the lock).
 */
export function dragWindow(zone: SectionZone, w: SectionWindow, edge: DragEdge, t: number): { window: SectionWindow; blocked: boolean } {
  const s = snapTo(zone, t)
  if (edge === 'move') {
    const len = w.end - w.start
    const start = Math.min(Math.max(s, zone.min), zone.max - len)
    return { window: { start, end: start + len }, blocked: Math.abs(start - s) > EPS }
  }
  if (edge === 'start') {
    const lo = Math.max(zone.min, w.end - zone.maxLen)
    const hi = w.end - zone.minLen
    const start = Math.min(Math.max(s, lo), hi)
    return { window: { start, end: w.end }, blocked: Math.abs(start - s) > EPS }
  }
  const lo = w.start + zone.minLen
  const hi = Math.min(zone.max, w.start + zone.maxLen)
  const end = Math.min(Math.max(s, lo), hi)
  return { window: { start: w.start, end }, blocked: Math.abs(end - s) > EPS }
}

/** Keep a stored window valid if the zone has changed (or it was never set). */
export function fitWindow(zone: SectionZone, w: SectionWindow | null | undefined, fallback: SectionWindow): SectionWindow {
  const src = w ?? fallback
  let len = Math.min(Math.max(src.end - src.start, zone.minLen), zone.maxLen, zone.max - zone.min)
  if (!(len > 0)) len = zone.max - zone.min
  const start = Math.min(Math.max(src.start, zone.min), zone.max - len)
  return { start, end: start + len }
}

/** "bar 5" or "bar 5 · beat 3" for a time on the grid. */
export function barBeatLabel(t: number, origin: number, secondsPerBeat: number, beatsPerBar: number) {
  const beats = Math.round((t - origin) / secondsPerBeat)
  const bar = Math.floor(beats / beatsPerBar) + 1
  const beat = (((beats % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1
  return beat === 1 ? `bar ${bar}` : `bar ${bar} · beat ${beat}`
}

/** Where an END sits: on a downbeat it's "end of bar 4" (it stops as bar 5 begins). */
export function endLabel(t: number, origin: number, secondsPerBeat: number, beatsPerBar: number) {
  const beats = Math.round((t - origin) / secondsPerBeat)
  if (beats > 0 && beats % beatsPerBar === 0) return `end of bar ${beats / beatsPerBar}`
  return barBeatLabel(t, origin, secondsPerBeat, beatsPerBar)
}

/** Length of a window in bars, for labels ("2 bars", "1¾ bars"). */
export function lengthLabel(w: SectionWindow, secondsPerBar: number) {
  const quarters = Math.round(((w.end - w.start) / secondsPerBar) * 4)
  const whole = Math.floor(quarters / 4)
  const frac = ['', '¼', '½', '¾'][quarters % 4]
  if (!whole) return `${frac} bar`
  return `${whole}${frac} bar${whole === 1 && !frac ? '' : 's'}`
}
