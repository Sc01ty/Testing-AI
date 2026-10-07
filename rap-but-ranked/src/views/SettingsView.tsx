import type { CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { useAudioUnlocked } from '../audio/useAudio'
import { router } from '../app/router'
import { PageShell } from '../components/layout/PageShell'
import { Button, Panel, Segmented, Slider, StageLock, Toggle } from '../components/ui/ui'
import type { MotionPreference } from '../settings/settings'
import { useSettings } from '../settings/useSettings'
import { requestIntroReplay } from './MenuView'
import './views.css'

/** Things that genuinely work now, then honest previews of what's coming. */
const LATER: { title: string; stage: number; items: string[] }[] = [
  { title: 'Audio devices', stage: 7, items: ['Microphone input', 'Output device (where the browser allows it)', 'Mic level meter', 'Latency calibration', 'Headphone test'] },
  { title: 'Recording', stage: 3, items: ['Count-in length', 'Auto-stop after 2 bars', 'Monitoring', 'Waveform sensitivity'] },
  { title: 'AI judge', stage: 4, items: ['Scoring strictness', 'Feedback detail', 'Challenge difficulty'] },
]

function Row({ label, sub, children, i }: { label: string; sub?: string; children: React.ReactNode; i: number }) {
  return (
    <div className="setting enter" style={{ '--i': i } as CSSProperties}>
      <div className="setting__text">
        <span className="setting__label">{label}</span>
        {sub && <span className="setting__sub">{sub}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

export function SettingsView() {
  const [s, set] = useSettings()
  const unlocked = useAudioUnlocked()
  const preview = () => audio.play('confirm')

  return (
    <PageShell id="settings">
      <div className="settings-grid">
        <Panel title="Sound" i={3} aside={!unlocked ? <span className="eyebrow">Click anywhere to enable audio</span> : undefined}>
          <Row label="Master" sub="Everything" i={4}>
            <Slider label="Master volume" value={s.masterVolume} onChange={(v) => set({ masterVolume: v })} onCommit={preview} />
          </Row>
          <Row label="Sound effects" sub="Hovers, clicks, intro hits" i={5}>
            <Slider label="Sound effects volume" value={s.uiVolume} onChange={(v) => set({ uiVolume: v })} onCommit={preview} />
          </Row>
          <Row label="Music" sub="Menu theme" i={6}>
            <Slider label="Music volume" value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} />
          </Row>
          <Row label="Menu music" i={7}>
            <Toggle label="Menu music" checked={s.menuMusic} onChange={(v) => set({ menuMusic: v })} />
          </Row>
          <Row label="Mute everything" sub="Shortcut: M" i={8}>
            <Toggle label="Mute" checked={s.muted} onChange={(v) => set({ muted: v })} />
          </Row>
        </Panel>

        <div className="settings-side">
          <Panel title="Motion" i={4}>
            <Row label="Reduced motion" sub="System follows your OS setting" i={5}>
              <Segmented<MotionPreference>
                label="Reduced motion"
                value={s.motion}
                onChange={(v) => set({ motion: v })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'reduced', label: 'On' },
                  { value: 'full', label: 'Off' },
                ]}
              />
            </Row>
            <Row label="Brand intro" sub="Watch RAP become RAP BUT RANKED again" i={6}>
              <Button
                variant="ghost"
                clickSound="transition"
                onClick={() => {
                  requestIntroReplay()
                  router.back()
                }}
              >
                Replay
              </Button>
            </Row>
          </Panel>

          {LATER.map((g, gi) => (
            <Panel key={g.title} title={g.title} aside={<StageLock stage={g.stage} />} i={5 + gi} className="panel--locked">
              <ul className="later">
                {g.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
