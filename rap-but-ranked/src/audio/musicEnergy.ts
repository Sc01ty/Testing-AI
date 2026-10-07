import { useEffect, type RefObject } from 'react'
import { isReducedMotion } from '../motion/motion'
import { audio } from './AudioEngine'

/**
 * One shared animation loop that turns the menu music's bass level into a
 * smooth 0..1 `--energy` CSS variable on whichever elements subscribe.
 * It's deliberately loose: fast attack, slow release, and gentle procedural
 * motion when no music is playing, so visuals breathe rather than strobe.
 */
const targets = new Set<HTMLElement>()
let raf = 0
let env = 0.35

function frame(now: number) {
  const raw = audio.getMusicEnergy()
  let target: number
  if (raw === null) {
    const t = now / 1000
    target = 0.32 + 0.1 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 3.7 + 1)
  } else {
    target = Math.min(1, Math.max(0, (raw - 0.22) / 0.55))
  }
  env += (target - env) * (target > env ? 0.45 : 0.07)
  const value = isReducedMotion() ? '0.4' : env.toFixed(3)
  targets.forEach((el) => el.style.setProperty('--energy', value))
  raf = targets.size ? requestAnimationFrame(frame) : 0
}

export function useMusicEnergy(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    targets.add(el)
    if (!raf) raf = requestAnimationFrame(frame)
    return () => {
      targets.delete(el)
      if (!targets.size && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
  }, [ref])
}
