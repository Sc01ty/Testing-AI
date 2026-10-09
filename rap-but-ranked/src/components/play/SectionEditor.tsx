import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { audio } from '../../audio/AudioEngine'
import { atMaxLength, barBeatLabel, dragWindow, lengthLabel, type DragEdge, type SectionWindow, type SectionZone } from '../../play/sectionWindow'

/**
 * START / END handles laid over the beat waveform. Drag a handle to trim,
 * drag the middle to slide. The window locks at its maximum length and at
 * the edges of its zone, and everything snaps to beats.
 *
 * Sits inside a `position: relative` box that exactly covers the waveform
 * for [viewFrom, viewTo].
 */
export function SectionEditor({
  zone,
  value,
  onChange,
  viewFrom,
  viewTo,
  secondsPerBar,
  beatsPerBar,
  disabled = false,
  accent,
}: {
  zone: SectionZone
  value: SectionWindow
  onChange: (w: SectionWindow) => void
  viewFrom: number
  viewTo: number
  secondsPerBar: number
  beatsPerBar: number
  disabled?: boolean
  /** Optional colour (online player identity). */
  accent?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ edge: DragEdge; grab: number; from: SectionWindow } | null>(null)
  const [active, setActive] = useState<DragEdge | null>(null)
  // flashes when a drag hits a limit (no remount: that would drop focus / pointer capture)
  const [bump, setBump] = useState(false)
  const bumpTimer = useRef(0)
  useEffect(() => () => clearTimeout(bumpTimer.current), [])
  const flashLimit = () => {
    if (bumpTimer.current) return
    setBump(true)
    bumpTimer.current = window.setTimeout(() => {
      bumpTimer.current = 0
      setBump(false)
    }, 240)
  }
  const span = viewTo - viewFrom
  const pct = (t: number) => `${((Math.min(Math.max(t, viewFrom), viewTo) - viewFrom) / span) * 100}%`
  const locked = atMaxLength(zone, value)

  const timeAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    return viewFrom + ((clientX - r.left) / r.width) * span
  }

  const apply = (edge: DragEdge, t: number, from: SectionWindow) => {
    const { window, blocked } = dragWindow(zone, from, edge, t)
    if (window.start !== value.start || window.end !== value.end) {
      audio.play('hover')
      onChange(window)
    }
    if (blocked) flashLimit()
  }

  const down = (edge: DragEdge) => (e: PointerEvent) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { edge, grab: timeAt(e.clientX) - value.start, from: value }
    setActive(edge)
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const t = timeAt(e.clientX)
    apply(d.edge, d.edge === 'move' ? t - d.grab : t, value)
  }
  const up = () => {
    if (drag.current) audio.play('toggle')
    drag.current = null
    setActive(null)
  }

  const key = (edge: DragEdge) => (e: KeyboardEvent) => {
    if (disabled) return
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    e.stopPropagation()
    const by = dir * (e.shiftKey ? secondsPerBar : zone.step)
    const base = edge === 'end' ? value.end : value.start
    apply(edge, base + by, value)
  }

  const label = (t: number) => barBeatLabel(t, zone.origin, zone.step, beatsPerBar)

  return (
    <div
      className="section-editor"
      ref={box}
      data-disabled={disabled ? '' : undefined}
      data-active={active ?? undefined}
      style={accent ? ({ '--sec-accent': accent } as CSSProperties) : undefined}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* out-of-zone shading: you can't put your bars here */}
      <span className="section-editor__shade" style={{ left: 0, width: pct(zone.min) }} />
      <span className="section-editor__shade" style={{ left: pct(zone.max), right: 0 }} />
      <span className="section-editor__zone" style={{ left: pct(zone.min), width: `calc(${pct(zone.max)} - ${pct(zone.min)})` }} />

      <div
        className="section-editor__window"
        data-locked={locked ? '' : undefined}
        data-bump={bump ? '' : undefined}
        style={{ left: pct(value.start), width: `calc(${pct(value.end)} - ${pct(value.start)})` }}
        onPointerDown={down('move')}
        role="group"
        aria-label="Recording section — drag to move"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={key('move')}
      >
        <span className="section-editor__len">
          {lengthLabel(value, secondsPerBar)}
          {locked && <b> · max</b>}
        </span>
        <span
          className="section-editor__handle section-editor__handle--start"
          onPointerDown={down('start')}
          onKeyDown={key('start')}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Section start"
          aria-valuemin={zone.min}
          aria-valuemax={value.end}
          aria-valuenow={value.start}
          aria-valuetext={label(value.start)}
        >
          <span className="section-editor__tag">START</span>
        </span>
        <span
          className="section-editor__handle section-editor__handle--end"
          onPointerDown={down('end')}
          onKeyDown={key('end')}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Section end"
          aria-valuemin={value.start}
          aria-valuemax={zone.max}
          aria-valuenow={value.end}
          aria-valuetext={label(value.end)}
        >
          <span className="section-editor__tag">END</span>
        </span>
      </div>
    </div>
  )
}
