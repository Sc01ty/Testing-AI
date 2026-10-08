import { useEffect, useRef } from 'react'
import type { BeatGrid } from '../../domain/types'

/**
 * The whole song at a glance: every accepted vocal sitting over its bars.
 *
 * `SongStrip` is the compact version in the studio (fills up as you go);
 * `VocalRegions` is the vocal lane of the full timeline on Track Complete.
 */
export interface VocalShape {
  key: string
  /** Peaks spanning [start, start + duration] (timeline seconds). */
  peaks: number[]
  start: number
  duration: number
  /** The part actually played (after seams/trim); defaults to the whole clip. */
  region?: [number, number]
  label?: string
}

const secPerBar = (g: BeatGrid) => (60 / g.bpm) * g.beatsPerBar

function useCanvas(height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[], animate = false) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const paint = () => {
      const c = ref.current
      if (!c) return
      const w = c.clientWidth
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(height * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(height * dpr)
      }
      const g = c.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, height)
      draw(g, w, height)
      if (animate) raf = requestAnimationFrame(paint)
    }
    paint()
    const ro = new ResizeObserver(paint)
    if (ref.current) ro.observe(ref.current)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return ref
}

function drawShape(g: CanvasRenderingContext2D, v: VocalShape, toX: (t: number) => number, mid: number, h: number, max: number, fill: string | CanvasGradient) {
  const [rs, re] = v.region ?? [v.start, v.start + v.duration]
  const colW = (toX(v.start + v.duration) - toX(v.start)) / Math.max(1, v.peaks.length)
  g.fillStyle = fill
  for (let i = 0; i < v.peaks.length; i++) {
    const t = v.start + (i / v.peaks.length) * v.duration
    if (t < rs - 1e-6 || t > re) continue
    const x = toX(t)
    const ph = Math.max(1, (v.peaks[i] / max) * h)
    g.fillRect(x, mid - ph / 2, Math.max(1, colW - 0.6), ph)
  }
}

/** Studio: all `bars` of the song as slots; finished takes drawn in, the current two bars outlined. */
export function SongStrip({ grid, bars, vocals, current }: { grid: BeatGrid; bars: number; vocals: VocalShape[]; current: number | null }) {
  const bar = secPerBar(grid)
  const ref = useCanvas(
    34,
    (g, w, h) => {
      const toX = (t: number) => ((t - grid.introOffset) / (bars * bar)) * w
      const slotW = w / (bars / 2)
      for (let s = 0; s < bars / 2; s++) {
        const x = s * slotW
        g.fillStyle = s === current ? 'rgba(154, 107, 255, 0.16)' : 'rgba(200, 180, 255, 0.05)'
        g.fillRect(x + 1, 2, slotW - 2, h - 4)
        if (s === current) {
          g.strokeStyle = 'rgba(187, 154, 255, 0.85)'
          g.lineWidth = 1.2
          g.strokeRect(x + 1.5, 2.5, slotW - 3, h - 5)
        }
      }
      const max = Math.max(0.02, ...vocals.flatMap((v) => v.peaks))
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#f4f1fa')
      grad.addColorStop(1, '#9a6bff')
      for (const v of vocals) drawShape(g, v, toX, h / 2, h - 8, max, grad)
    },
    [grid, bars, vocals, current],
  )
  const done = vocals.length * 2
  return <canvas ref={ref} className="song-strip" style={{ height: 34, width: '100%', display: 'block' }} role="img" aria-label={`Song so far: ${done} of ${bars} bars recorded`} />
}

/** Track Complete: the vocal lane under the beat, one region per take, seams where they really are. */
export function VocalRegions({
  vocals,
  from,
  to,
  position,
  animate,
  now,
  onSeek,
  height = 70,
}: {
  vocals: VocalShape[]
  from: number
  to: number
  position?: () => number | null
  animate?: boolean
  now?: string | null
  onSeek?: (t: number) => void
  height?: number
}) {
  const ref = useCanvas(
    height,
    (g, w, h) => {
      const toX = (t: number) => ((t - from) / (to - from)) * w
      g.fillStyle = 'rgba(200, 180, 255, 0.08)'
      g.fillRect(0, h / 2, w, 1)
      const max = Math.max(0.02, ...vocals.flatMap((v) => v.peaks))
      vocals.forEach((v, i) => {
        const [rs, re] = v.region ?? [v.start, v.start + v.duration]
        const x0 = toX(rs)
        const x1 = toX(re)
        const active = now === v.key
        g.fillStyle = active ? 'rgba(154, 107, 255, 0.22)' : i % 2 ? 'rgba(154, 107, 255, 0.07)' : 'rgba(154, 107, 255, 0.12)'
        g.fillRect(x0, 0, x1 - x0, h)
        const grad = g.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, '#f4f1fa')
        grad.addColorStop(1, active ? '#bb9aff' : '#9a6bff')
        drawShape(g, v, toX, h / 2, h * 0.84, max, grad)
        g.fillStyle = 'rgba(187, 154, 255, 0.55)'
        g.fillRect(Math.round(x0), 0, 1, h)
        if (v.label) {
          g.fillStyle = 'rgba(244, 241, 250, 0.6)'
          g.font = '600 10px Manrope Variable, sans-serif'
          g.fillText(v.label, x0 + 4, 11)
        }
      })
      const p = position?.()
      if (p !== null && p !== undefined) {
        g.fillStyle = '#fff'
        g.fillRect(Math.round(toX(p)), 0, 1.5, h)
      }
    },
    [vocals, from, to, position, animate, now, height],
    animate,
  )
  return (
    <canvas
      ref={ref}
      className="vocal-regions"
      style={{ height, width: '100%', display: 'block', cursor: onSeek ? 'pointer' : undefined }}
      role="img"
      aria-label={`Your vocal: ${vocals.length} takes joined into one`}
      onPointerDown={(e) => {
        if (!onSeek) return
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(from + ((e.clientX - r.left) / r.width) * (to - from))
      }}
    />
  )
}
