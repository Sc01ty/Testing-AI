/**
 * App settings: one small persisted store, readable from React (useSettings)
 * and from plain modules (audio engine, motion) via subscribe().
 *
 * Later stages add sections (recording, AI, devices) by extending `Settings`
 * and `DEFAULT_SETTINGS`; `sanitizeSettings` keeps old saved data valid.
 */
export type MotionPreference = 'system' | 'reduced' | 'full'

export interface Settings {
  masterVolume: number // 0..1
  uiVolume: number // 0..1
  musicVolume: number // 0..1
  muted: boolean
  menuMusic: boolean
  motion: MotionPreference
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.9,
  uiVolume: 0.7,
  musicVolume: 0.5,
  muted: false,
  menuMusic: true,
  motion: 'system',
}

const STORAGE_KEY = 'rbr.settings.v1'

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>
  const d = DEFAULT_SETTINGS
  return {
    masterVolume: clamp01(r.masterVolume, d.masterVolume),
    uiVolume: clamp01(r.uiVolume, d.uiVolume),
    musicVolume: clamp01(r.musicVolume, d.musicVolume),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    menuMusic: typeof r.menuMusic === 'boolean' ? r.menuMusic : d.menuMusic,
    motion: r.motion === 'reduced' || r.motion === 'full' || r.motion === 'system' ? r.motion : d.motion,
  }
}

type Listener = (s: Settings) => void

export interface SettingsStore {
  get(): Settings
  set(patch: Partial<Settings>): void
  reset(): void
  subscribe(fn: Listener): () => void
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createSettingsStore(storage?: StorageLike | null): SettingsStore {
  let state = DEFAULT_SETTINGS
  try {
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved) state = sanitizeSettings(JSON.parse(saved))
  } catch {
    state = DEFAULT_SETTINGS
  }
  const listeners = new Set<Listener>()

  const commit = (next: Settings) => {
    state = next
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage blocked (private mode etc) — settings still work for this visit */
    }
    listeners.forEach((fn) => fn(state))
  }

  return {
    get: () => state,
    set: (patch) => commit(sanitizeSettings({ ...state, ...patch })),
    reset: () => commit(DEFAULT_SETTINGS),
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export const settingsStore = createSettingsStore(safeLocalStorage())
