import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { UiSoundId } from '../../audio/sounds'
import './ui.css'

/**
 * Shared controls. Sound is opt-in per control via `clickSound` /
 * `hoverSound`, so we decide deliberately what makes noise.
 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet'
  clickSound?: UiSoundId | null
  hoverSound?: UiSoundId | null
  icon?: ReactNode
}

export function Button({ variant = 'ghost', clickSound = 'confirm', hoverSound = null, icon, children, onClick, onPointerEnter, className = '', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`btn btn--${variant} ${className}`}
      onPointerEnter={(e) => {
        if (hoverSound && e.pointerType === 'mouse' && !rest.disabled) audio.play(hoverSound)
        onPointerEnter?.(e)
      }}
      onClick={(e) => {
        audio.unlock()
        if (clickSound) audio.play(clickSound)
        onClick?.(e)
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

export function StageLock({ stage, children }: { stage: number; children?: ReactNode }) {
  return (
    <span className="stage-lock">
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
        <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {children ?? `Stage ${stage}`}
    </span>
  )
}

export function Panel({ title, aside, children, className = '', i = 0 }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; i?: number }) {
  return (
    <section className={`panel enter ${className}`} style={{ '--i': i } as CSSProperties}>
      {(title || aside) && (
        <header className="panel__head">
          {title && <h2 className="eyebrow panel__title">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">
        <span className="eyebrow">{label}</span>
        {hint}
      </span>
      {children}
    </label>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="seg" role="radiogroup" aria-label={label} aria-disabled={disabled} style={{ '--n': options.length, '--idx': index } as CSSProperties}>
      <span className="seg__thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className="seg__opt"
          disabled={disabled || o.disabled}
          onClick={() => {
            audio.unlock()
            if (o.value !== value) {
              audio.play('toggle')
              onChange(o.value)
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => {
        audio.unlock()
        audio.play('toggle')
        onChange(!checked)
      }}
    >
      <span className="toggle__knob" />
    </button>
  )
}

export function Slider({ value, onChange, label, onCommit }: { value: number; onChange: (v: number) => void; onCommit?: () => void; label: string }) {
  return (
    <div className="slider" style={{ '--v': value } as CSSProperties}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label={label}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <output className="slider__value">{Math.round(value * 100)}</output>
    </div>
  )
}
