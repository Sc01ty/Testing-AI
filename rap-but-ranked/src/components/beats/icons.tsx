/** Small stroke icons used across the beat library. */
const PATHS: Record<string, string> = {
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  restart: 'M6 6h2.2v12H6zM18.5 6l-9 6 9 6z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 15v4h14v-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2',
  mic: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3',
  help: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01',
}

const FILLED = new Set(['play', 'pause', 'restart'])

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  const filled = FILLED.has(name)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d={PATHS[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
