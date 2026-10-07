import './Background.css'

/**
 * Persistent stage behind every screen: deep purple light, faint bar-grid
 * (a nod to a DAW timeline), film grain and vignette. Views steer the light
 * with --glow-x / --glow-y on :root.
 */
export function Background() {
  return (
    <div className="bg" aria-hidden>
      <div className="bg__glow bg__glow--a" />
      <div className="bg__glow bg__glow--b" />
      <div className="bg__grid" />
      <div className="bg__grain" />
      <div className="bg__vignette" />
    </div>
  )
}
