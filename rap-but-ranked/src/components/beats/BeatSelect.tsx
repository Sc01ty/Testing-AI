import { useEffect, useState } from 'react'
import { router } from '../../app/router'
import { formatBpm, formatTime } from '../../lib/format'
import { useBeats } from '../../storage/useBeats'

/**
 * Pick a saved beat (Play / Freestyle setup). Stage 3 will lift the chosen
 * id into session state; for now it proves the library is reachable.
 */
export function BeatSelect({ value, onChange }: { value?: string; onChange?: (id: string) => void }) {
  const { beats } = useBeats()
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => {
    if (!(value ?? local) && beats?.length) {
      setLocal(beats[0].id)
      onChange?.(beats[0].id)
    }
  }, [beats, local, value, onChange])

  if (beats === null) return <div className="input input--fake">Loading beats…</div>
  if (beats.length === 0)
    return (
      <button className="input input--fake input--link" onClick={() => router.navigate('beats')}>
        No beats yet — add one in Beats →
      </button>
    )
  return (
    <select
      className="input select"
      aria-label="Beat"
      value={value ?? local}
      onChange={(e) => {
        setLocal(e.target.value)
        onChange?.(e.target.value)
      }}
    >
      {beats.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} · {formatBpm(b.bpm)} BPM · {formatTime(b.durationSec)}
        </option>
      ))}
    </select>
  )
}
