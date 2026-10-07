import { useSyncExternalStore } from 'react'
import { audio } from './AudioEngine'

export function useAudioUnlocked() {
  return useSyncExternalStore(
    (fn) => audio.subscribe(fn),
    () => audio.isUnlocked,
    () => false,
  )
}

export { audio }
