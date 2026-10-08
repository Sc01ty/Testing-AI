import type { CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { useAudioUnlocked } from '../audio/useAudio'
import { mic, useMic } from '../audio/mic'
import { AiStatus } from '../components/play/AiStatus'
import { MODEL_SIZE_MB, localModel, useLocalModel } from '../director/localModel'
import { useEffect, useState } from 'react'
import { router } from '../app/router'
import { PageShell } from '../components/layout/PageShell'
import { Button, Panel, Segmented, Slider, StageLock, Toggle } from '../components/ui/ui'
import type { MotionPreference } from '../settings/settings'
import { useSettings } from '../settings/useSettings'
import { requestIntroReplay } from './MenuView'
import './views.css'

/** Not built yet — listed honestly rather than shown as fake controls. */
const LATER: { title: string; stage: number; items: string[] }[] = [
  { title: 'Later', stage: 7, items: ['Output device picker', 'Automatic latency calibration', 'Scoring strictness', 'Count-in length'] },
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
          <Row label="Beats" sub="Beat previews and playback" i={7}>
            <Slider label="Beats volume" value={s.beatVolume} onChange={(v) => set({ beatVolume: v })} />
          </Row>
          <Row label="Menu music" i={7}>
            <Toggle label="Menu music" checked={s.menuMusic} onChange={(v) => set({ menuMusic: v })} />
          </Row>
          <Row label="Mute everything" sub="Shortcut: M" i={8}>
            <Toggle label="Mute" checked={s.muted} onChange={(v) => set({ muted: v })} />
          </Row>
        </Panel>

        <div className="settings-side">
          <Panel title="Microphone" i={4}>
            <MicSettings />
          </Panel>
          <Panel title="Rap AI" i={4}>
            <AiSettings />
          </Panel>
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

function MicSettings() {
  const [s, set] = useSettings()
  const m = useMic()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const refresh = () =>
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === 'audioinput')))
      .catch(() => setDevices([]))
  useEffect(refresh, [m.status])
  const labelled = devices.some((d) => d.label)
  return (
    <>
      <Row label="Input" sub={m.status === 'ready' ? `Using: ${m.deviceLabel}` : m.message ?? 'Turns on the first time you record'} i={5}>
        {labelled ? (
          <select
            className="input select"
            aria-label="Microphone"
            value={s.micDeviceId}
            onChange={(e) => {
              set({ micDeviceId: e.target.value })
              mic.release()
            }}
          >
            <option value="">System default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
          </select>
        ) : (
          <Button variant="ghost" onClick={() => void mic.ensure().then(refresh)}>
            Allow mic
          </Button>
        )}
      </Row>
      <Row label="Timing fine-tune" sub={`${s.latencyOffsetMs > 0 ? '+' : ''}${s.latencyOffsetMs} ms · if your takes sound late, move this up; early, move it down`} i={6}>
        <input
          className="latency"
          type="range"
          min={-150}
          max={150}
          step={5}
          aria-label="Latency fine-tune"
          value={s.latencyOffsetMs}
          onChange={(e) => set({ latencyOffsetMs: Number(e.target.value) })}
        />
      </Row>
    </>
  )
}

function AiSettings() {
  const [s, set] = useSettings()
  const m = useLocalModel()
  useEffect(() => void localModel.detect(), [])
  return (
    <>
      <Row label="Director" sub="Who decides your next challenge" i={5}>
        <Segmented<'local' | 'basic'>
          label="Director"
          value={s.aiMode}
          onChange={(v) => set({ aiMode: v })}
          options={[
            { value: 'local', label: 'Rap AI', disabled: m.status === 'unsupported' },
            { value: 'basic', label: 'Basic' },
          ]}
        />
      </Row>
      <div className="setting setting--block enter" style={{ '--i': 6 } as CSSProperties}>
        <AiStatus />
      </div>
      {(m.status === 'ready' || m.status === 'cached') && (
        <Row label="Downloaded model" sub={`Frees ~${MODEL_SIZE_MB} MB. You can download it again any time.`} i={7}>
          <Button variant="ghost" clickSound="back" onClick={() => void localModel.remove()}>
            Delete
          </Button>
        </Row>
      )}
    </>
  )
}
