import { useRef, type CSSProperties } from 'react'
import { useMusicEnergy } from '../../audio/musicEnergy'
import { audio } from '../../audio/AudioEngine'
import { useSettings } from '../../settings/useSettings'
import './SoundToggle.css'

/** Persistent corner mute button; stays put across screen transitions. */
export function SoundToggle({ hidden }: { hidden?: boolean }) {
  const [settings, set] = useSettings()
  const on = !settings.muted
  const ref = useRef<HTMLButtonElement>(null)
  useMusicEnergy(ref)
  return (
    <button
      ref={ref}
      title={on ? 'Mute (M)' : 'Unmute (M)'}
      className="sound-toggle"
      data-hidden={hidden ? '' : undefined}
      style={{ viewTransitionName: 'sound-toggle' } as CSSProperties}
      aria-label={on ? 'Mute sound' : 'Unmute sound'}
      aria-pressed={on}
      tabIndex={hidden ? -1 : 0}
      onClick={() => {
        audio.unlock()
        set({ muted: on })
        if (!on) requestAnimationFrame(() => audio.play('toggle'))
      }}
    >
      <span className="sound-toggle__bars" data-on={on ? '' : undefined} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} style={{ '--b': i, '--w': [0.6, 1, 0.8, 0.5][i] } as CSSProperties} />
        ))}
      </span>
    </button>
  )
}
