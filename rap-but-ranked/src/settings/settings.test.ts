import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createSettingsStore, sanitizeSettings } from './settings'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

describe('settings', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ uiVolume: 'loud', motion: 'wild' })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps volumes into 0..1', () => {
    const s = sanitizeSettings({ uiVolume: 4, musicVolume: -1 })
    expect(s.uiVolume).toBe(1)
    expect(s.musicVolume).toBe(0)
  })

  it('persists and notifies', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    const seen: number[] = []
    store.subscribe((s) => seen.push(s.musicVolume))
    store.set({ musicVolume: 0.1 })
    expect(seen).toEqual([0.1])
    expect(createSettingsStore(storage).get().musicVolume).toBe(0.1)
  })

  it('survives corrupt saved JSON', () => {
    const store = createSettingsStore(memoryStorage({ 'rbr.settings.v1': '{nope' }))
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
  })
})
