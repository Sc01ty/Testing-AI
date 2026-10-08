import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { resamplePeaks } from '../../audio/analysis/peaks'
import './Waveform.css'

/**
 * Canvas waveform drawn from the beat's real peaks.
 *  - optional bar grid (from BPM + intro offset) with bar numbers
 *  - optional draggable START marker (intro offset)
 *  - playhead from `position()`, animated while `animate` is true
 *  - click to seek, drag to scrub (seeks on release)
 */
export interface WaveformProps {
  peaks: number[]
  duration: number
  height?: number
  barWidth?: number
  gap?: number
  /** Current playhead (seconds) or null. Polled every frame while `animate`. */
  position?: () => number | null
  animate?: boolean
  offset?: number
  bpm?: number
  beatsPerBar?: number
  barNumbers?: boolean
  onSeek?: (seconds: number) => void
  onOffsetChange?: (seconds: number) => void
  reveal?: boolean
  label: string
  className?: string
}

const COLORS = {
  unplayed: 'rgba(154, 107, 255, 0.42)',
  intro: 'rgba(120, 112, 140, 0.28)',
  playedTop: '#f4f1fa',
  playedBottom: '#a97dff',
  grid: 'rgba(200, 180, 255, 0.07)',
  gridStrong: 'rgba(200, 180, 255, 0.18)',
  label: 'rgba(184, 177, 200, 0.55)',
  marker: '#bb9aff',
  playhead: '#ffffff',
}

export function Waveform({
  peaks,
  duration,
  height = 48,
  barWidth = 2,
  gap = 1,
  position,
  animate = false,
  offset,
  bpm,
  beatsPerBar = 4,
  barNumbers = false,
  onSeek,
  onOffsetChange,
  reveal = false,
  label,
  className = '',
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthRef = useRef(0)
  const hoverX = useRef<number | null>(null)
  const scrubX = useRef<number | null>(null)
  const drag = useRef<'seek' | 'offset' | null>(null)
  const columnsCache = useRef<{ n: number; peaks: number[]; src: number[] } | null>(null)
  const labelTop = barNumbers ? 14 : 0

  const columnPeaks = useCallback(
    (n: number) => {
      const c = columnsCache.current
      if (c && c.n === n && c.src === peaks) return c.peaks
      const p = resamplePeaks(peaks, n)
      columnsCache.current = { n, peaks: p, src: peaks }
      return p
    },
    [peaks],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth
    if (!w) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const H = height
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(H * dpr)
    }
    widthRef.current = w
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)

    const toX = (t: number) => (duration > 0 ? (t / duration) * w : 0)
    const waveTop = labelTop
    const waveH = H - labelTop
    const mid = waveTop + waveH / 2

    // bar grid
    if (bpm && bpm > 0 && duration > 0) {
      const spBar = (60 / bpm) * beatsPerBar
      const start = offset ?? 0
      g.font = '700 9px "Manrope Variable", Manrope, sans-serif'
      g.textBaseline = 'top'
      const pxPerBar = toX(spBar)
      const labelEvery = pxPerBar > 26 ? 1 : pxPerBar > 13 ? 2 : pxPerBar > 6 ? 4 : 8
      for (let i = 0, t = start; t <= duration + 1e-6; i++, t = start + i * spBar) {
        const x = Math.round(toX(t)) + 0.5
        const strong = i % 4 === 0
        g.fillStyle = strong ? COLORS.gridStrong : COLORS.grid
        g.fillRect(x, waveTop, 1, waveH)
        if (barNumbers && i % labelEvery === 0) {
          g.fillStyle = COLORS.label
          g.fillText(String(i + 1), x + 3, 1)
        }
      }
    }

    // waveform bars
    const step = barWidth + gap
    const n = Math.max(1, Math.floor(w / step))
    const cols = columnPeaks(n)
    const pos = scrubX.current !== null ? (scrubX.current / w) * duration : (position?.() ?? null)
    const posX = pos !== null ? toX(pos) : -1
    const offX = offset !== undefined ? toX(offset) : 0
    const played = g.createLinearGradient(0, waveTop, 0, waveTop + waveH)
    played.addColorStop(0, COLORS.playedTop)
    played.addColorStop(1, COLORS.playedBottom)
    for (let i = 0; i < n; i++) {
      const x = i * step
      const h = Math.max(1.5, cols[i] * waveH * 0.92)
      g.fillStyle = x + barWidth <= posX ? played : x < offX ? COLORS.intro : COLORS.unplayed
      g.fillRect(x, mid - h / 2, barWidth, h)
    }

    // intro / START marker
    if (offset !== undefined && onOffsetChange) {
      const x = Math.round(offX) + 0.5
      g.fillStyle = COLORS.marker
      g.fillRect(x - 0.5, waveTop, 2, waveH)
      g.beginPath()
      g.moveTo(x - 5, waveTop)
      g.lineTo(x + 6, waveTop)
      g.lineTo(x + 0.5, waveTop + 7)
      g.closePath()
      g.fill()
    }

    // hover guide
    if (hoverX.current !== null && drag.current === null && onSeek) {
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(Math.round(hoverX.current), waveTop, 1, waveH)
    }

    // playhead
    if (posX >= 0) {
      g.save()
      g.shadowColor = 'rgba(155, 107, 255, 0.9)'
      g.shadowBlur = 8
      g.fillStyle = COLORS.playhead
      g.fillRect(Math.round(posX), waveTop - (barNumbers ? 2 : 0), 1.5, waveH + (barNumbers ? 2 : 0))
      g.restore()
    }
  }, [height, labelTop, duration, bpm, beatsPerBar, offset, barNumbers, barWidth, gap, columnPeaks, position, onOffsetChange, onSeek])

  // redraw whenever inputs change
  useEffect(() => {
    draw()
  })

  // animate the playhead while playing
  useEffect(() => {
    if (!animate) return
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animate, draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas)
    void document.fonts?.ready.then(() => draw())
    return () => ro.disconnect()
  }, [draw])

  const xOf = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return Math.min(r.width, Math.max(0, e.clientX - r.left))
  }
  const timeAt = (x: number) => (widthRef.current ? (x / widthRef.current) * duration : 0)
  const nearMarker = (x: number) => offset !== undefined && !!onOffsetChange && Math.abs(x - (offset / duration) * widthRef.current) < 9

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const x = xOf(e)
    if (nearMarker(x)) drag.current = 'offset'
    else if (onSeek) {
      drag.current = 'seek'
      scrubX.current = x
    } else return
    e.currentTarget.setPointerCapture(e.pointerId)
    draw()
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const x = xOf(e)
    hoverX.current = x
    e.currentTarget.style.cursor = drag.current === 'offset' || nearMarker(x) ? 'ew-resize' : onSeek ? 'pointer' : 'default'
    if (drag.current === 'offset') onOffsetChange?.(Math.max(0, Math.min(duration - 1, timeAt(x))))
    if (drag.current === 'seek') scrubX.current = x
    draw()
  }
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current === 'seek' && scrubX.current !== null) onSeek?.(timeAt(scrubX.current))
    drag.current = null
    scrubX.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    draw()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!onSeek) return
    const now = position?.() ?? 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onSeek(Math.max(0, Math.min(duration, now + (e.key === 'ArrowRight' ? 5 : -5))))
    }
  }

  const style = useMemo(() => ({ height }), [height])

  return (
    <canvas
      ref={canvasRef}
      className={`waveform ${reveal ? 'waveform--reveal' : ''} ${className}`}
      style={style}
      role={onSeek ? 'slider' : 'img'}
      aria-label={label}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? Math.round(duration) : undefined}
      aria-valuenow={onSeek ? Math.round(position?.() ?? 0) : undefined}
      tabIndex={onSeek ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        hoverX.current = null
        draw()
      }}
      onKeyDown={onKeyDown}
    />
  )
}
