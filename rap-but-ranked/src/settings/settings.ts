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
  beatVolume: number // 0..1 — beat previews / playback
  muted: boolean
  menuMusic: boolean
  motion: MotionPreference
  /** Preferred microphone (empty = system default). */
  micDeviceId: string
  /** Manual latency fine-tune added to the automatic estimate (ms). */
  latencyOffsetMs: number
  /** 'local' = in-browser AI model when available, 'basic' = rule-based director only. */
  aiMode: 'local' | 'basic'
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.9,
  uiVolume: 0.7,
  musicVolume: 0.5,
  beatVolume: 0.9,
  muted: false,
  menuMusic: true,
  motion: 'system',
  micDeviceId: '',
  latencyOffsetMs: 0,
  aiMode: 'local',
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
    beatVolume: clamp01(r.beatVolume, d.beatVolume),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    menuMusic: typeof r.menuMusic === 'boolean' ? r.menuMusic : d.menuMusic,
    motion: r.motion === 'reduced' || r.motion === 'full' || r.motion === 'system' ? r.motion : d.motion,
    micDeviceId: typeof r.micDeviceId === 'string' ? r.micDeviceId : d.micDeviceId,
    latencyOffsetMs:
      typeof r.latencyOffsetMs === 'number' && Number.isFinite(r.latencyOffsetMs) ? Math.max(-300, Math.min(300, Math.round(r.latencyOffsetMs))) : d.latencyOffsetMs,
    aiMode: r.aiMode === 'basic' || r.aiMode === 'local' ? r.aiMode : d.aiMode,
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
