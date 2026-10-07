import { useSyncExternalStore } from 'react'
import { settingsStore, type Settings } from './settings'

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get)
  return [settings, settingsStore.set]
}
