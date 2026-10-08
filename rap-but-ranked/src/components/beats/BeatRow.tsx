import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { beatPlayer, useBeatPlayer, type PlayableBeat } from '../../audio/BeatPlayer'
import type { BeatMeta } from '../../domain/types'
import { formatAdded, formatBpm, formatTime } from '../../lib/format'
import { getBeatAudio } from '../../storage/beatLibrary'
import { Waveform } from './Waveform'
import { Icon } from './icons'

/** One saved beat: play, scrub, stats, edit, delete (with an inline confirm). */
export function BeatRow({
  beat,
  isNew,
  index,
  onEdit,
  onDelete,
  usedBy = 0,
}: {
  beat: BeatMeta
  isNew: boolean
  index: number
  /** Saved raps made on this beat (they keep their vocals if it's deleted). */
  usedBy?: number
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const player = useBeatPlayer()
  const active = player.beatId === beat.id
  const playing = active && player.playing
  const loading = active && player.loading
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const confirmTimer = useRef(0)

  const playable: PlayableBeat = useMemo(() => ({ id: beat.id, getBlob: () => getBeatAudio(beat.id) }), [beat.id])
  const position = useCallback(() => beatPlayer.position(beat.id), [beat.id])
  const clickGrid = useMemo(() => ({ origin: beat.introOffset, secondsPerBeat: 60 / beat.bpm, beatsPerBar: beat.beatsPerBar }), [beat.introOffset, beat.bpm, beat.beatsPerBar])

  // the confirm quietly backs off if ignored
  useEffect(() => {
    if (!confirming) return
    confirmTimer.current = window.setTimeout(() => setConfirming(false), 5000)
    return () => clearTimeout(confirmTimer.current)
  }, [confirming])

  const remove = async () => {
    setRemoving(true)
    audio.play('remove')
    await new Promise((r) => setTimeout(r, 280)) // let the row collapse
    await onDelete()
  }

  return (
    <li
      className="beat-row"
      data-active={active ? '' : undefined}
      data-playing={playing ? '' : undefined}
      data-new={isNew ? '' : undefined}
      data-confirming={confirming ? '' : undefined}
      data-removing={removing ? '' : undefined}
      style={{ '--i': index } as React.CSSProperties}
      aria-label={beat.name}
    >
      <button
        className="beat-row__play"
        onClick={() => beatPlayer.toggle(playable, clickGrid)}
        aria-label={playing ? `Pause ${beat.name}` : `Play ${beat.name}`}
        data-loading={loading ? '' : undefined}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>

      <div className="beat-row__main">
        <div className="beat-row__title">
          <span className="beat-row__name">{beat.name}</span>
          <span className="beat-row__added">{formatAdded(beat.createdAt)}</span>
        </div>
        <Waveform
          peaks={beat.peaks}
          duration={beat.durationSec}
          height={38}
          barWidth={2}
          gap={1}
          offset={beat.introOffset}
          position={position}
          animate={playing}
          onSeek={(t) => void beatPlayer.play(playable, { from: t, grid: clickGrid })}
          label={`${beat.name} waveform. Click to play from a point.`}
        />
      </div>

      <div className="beat-row__stat">
        <b>{formatBpm(beat.bpm)}</b>
        <span>BPM</span>
      </div>
      <div className="beat-row__stat">
        <b>{formatTime(beat.durationSec)}</b>
        <span>Length</span>
      </div>

      <div className="beat-row__actions">
        <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${beat.name}`} title="Edit">
          <Icon name="edit" />
        </button>
        <button
          className="icon-btn icon-btn--danger"
          onClick={() => {
            audio.play('toggle')
            setConfirming(true)
          }}
          aria-label={`Delete ${beat.name}`}
          title="Delete"
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="beat-row__confirm" aria-hidden={!confirming}>
        <span>
          Delete <b>{beat.name}</b>?{usedBy > 0 && ` ${usedBy} saved rap${usedBy === 1 ? '' : 's'} will lose the beat (vocals stay).`}
        </span>
        <button className="btn btn--quiet" tabIndex={confirming ? 0 : -1} onClick={() => (audio.play('back'), setConfirming(false))}>
          <span>Keep</span>
        </button>
        <button className="btn btn--danger" tabIndex={confirming ? 0 : -1} onClick={() => void remove()} disabled={removing}>
          <span>Delete</span>
        </button>
      </div>
    </li>
  )
}
