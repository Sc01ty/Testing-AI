import { useEffect, useRef } from 'react'
import { audio } from '../audio/AudioEngine'
import { settingsStore } from '../settings/settings'
import { Background } from '../components/layout/Background'
import { SoundToggle } from '../components/layout/SoundToggle'
import { BeatsView } from '../views/BeatsView'
import { FreestyleView } from '../views/FreestyleView'
import { MenuView } from '../views/MenuView'
import { PlayView } from '../views/PlayView'
import { SettingsView } from '../views/SettingsView'
import type { RouteId } from './routes'
import { useRoute } from './router'

export function App() {
  const route = useRoute()
  const prev = useRef<RouteId | null>(null)
  const from = prev.current
  useEffect(() => {
    prev.current = route
  }, [route])

  useEffect(() => {
    // The menu theme is "wanted" from the start; it only begins after the first gesture.
    audio.setMusic('menu')
    audio.setMusicMood(route === 'menu' ? 'menu' : 'muffled')
    // Deep links skip the intro gate, so unlock audio on the first interaction anywhere.
    const unlock = () => audio.unlock()
    // M toggles mute anywhere (except while typing)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
      const muted = !settingsStore.get().muted
      settingsStore.set({ muted })
      if (!muted) requestAnimationFrame(() => audio.play('toggle'))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', unlock, { capture: true, once: true })
    window.addEventListener('keydown', unlock, { capture: true, once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <>
      <Background />
      {route === 'menu' && <MenuView from={from} />}
      {route === 'play' && <PlayView />}
      {route === 'beats' && <BeatsView />}
      {route === 'freestyle' && <FreestyleView />}
      {route === 'settings' && <SettingsView />}
      <SoundToggle />
    </>
  )
}
