import { useRef } from 'react'
import { useMusicEnergy } from '../../audio/musicEnergy'
import './Background.css'

/**
 * Persistent stage behind every screen: deep purple light, faint bar-grid
 * (a nod to a DAW timeline), grain and vignette. Views steer the light with
 * --glow-x / --glow-y on :root; the music makes it breathe slightly.
 */
export function Background() {
  const ref = useRef<HTMLDivElement>(null)
  useMusicEnergy(ref)
  return (
    <div className="bg" aria-hidden ref={ref}>
      <div className="bg__glow bg__glow--a" />
      <div className="bg__glow bg__glow--b" />
      <div className="bg__grid" />
      <div className="bg__grain" />
      <div className="bg__vignette" />
    </div>
  )
}
