import { useEffect, useRef } from 'react'

/**
 * The vocal track under the beat: live while recording, then the take.
 * `peaks` spans beat-time [from, to]; the lane shows [viewFrom, viewTo].
 */
export function VocalLane({
  peaks,
  from,
  to,
  viewFrom,
  viewTo,
  progress,
  recording,
  position,
  animate,
  height = 64,
}: {
  peaks: number[] | null
  from: number
  to: number
  viewFrom: number
  viewTo: number
  /** While recording: how much of [from, to] has been captured (0..1). */
  progress?: number
  recording?: boolean
  position?: () => number | null
  animate?: boolean
  height?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
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
      const span = viewTo - viewFrom
      const toX = (t: number) => ((t - viewFrom) / span) * w
      const mid = height / 2
      g.fillStyle = 'rgba(200, 180, 255, 0.08)'
      g.fillRect(0, mid, w, 1)
      if (peaks && peaks.length) {
        const shown = recording && progress !== undefined ? Math.floor(peaks.length * progress) : peaks.length
        const colW = (toX(to) - toX(from)) / peaks.length
        const grad = g.createLinearGradient(0, 0, 0, height)
        grad.addColorStop(0, recording ? '#ffb3c4' : '#f4f1fa')
        grad.addColorStop(1, recording ? '#ff5d7a' : '#9a6bff')
        g.fillStyle = grad
        const max = Math.max(0.02, ...peaks.slice(0, Math.max(1, shown)))
        for (let i = 0; i < shown; i++) {
          const x = toX(from) + i * colW
          if (x < -2 || x > w + 2) continue
          const h = Math.max(1, (peaks[i] / max) * height * 0.9)
          g.fillRect(x, mid - h / 2, Math.max(1, colW - 1), h)
        }
        if (recording && progress !== undefined) {
          const x = toX(from + (to - from) * progress)
          g.fillStyle = '#ff5d7a'
          g.fillRect(Math.round(x), 0, 2, height)
        }
      }
      const pos = position?.()
      if (pos !== null && pos !== undefined) {
        g.fillStyle = '#fff'
        g.fillRect(Math.round(toX(pos)), 0, 1.5, height)
      }
      if (animate) raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(draw)
    if (ref.current) ro.observe(ref.current)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [peaks, from, to, viewFrom, viewTo, progress, recording, position, animate, height])

  return <canvas ref={ref} className="vocal-lane" style={{ height, width: '100%', display: 'block' }} aria-label="Your vocal" role="img" />
}
