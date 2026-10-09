import { useEffect, useRef, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { trackPlayer } from '../../audio/trackPlayer'
import { encodeWav } from '../../audio/wav'
import { envelope, levelGain } from '../../audio/arrange'
import type { AdlibLayer } from '../../domain/types'
import type { VocalClip } from '../../audio/mix'
import { FreestyleRecorder, type FreestyleRecording } from '../../freestyle/recorder'
import { saveTakeAudio, getBeatAudio } from '../../storage'
import { rememberTake } from '../../play/takeAudio'
import { VocalLane } from './VocalLane'

type Backing = { beatBuffer: AudioBuffer | null; clips: VocalClip[]; from: number; to: number }
export function AdlibPanel({
  sessionId,
  beatId,
  bpm,
  beatsPerBar,
  layers = [],
  makeBacking,
  onKeep,
  multiplayer = false,
}: {
  sessionId: string
  beatId: string
  bpm: number
  beatsPerBar: number
  layers?: AdlibLayer[]
  makeBacking: () => Promise<Backing>
  onKeep: (layers: AdlibLayer[]) => Promise<void>
  multiplayer?: boolean
}) {
  const [busy, setBusy] = useState(false),
    [phase, setPhase] = useState('')
  const [time, setTime] = useState(0),
    [error, setError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<FreestyleRecording | null>(null)
  const [backing, setBacking] = useState<Backing | null>(null)
  const [live, setLive] = useState<number[] | null>(null)
  const recorder = useRef<FreestyleRecorder | null>(null)
  useEffect(
    () => () => {
      recorder.current?.cancel()
      trackPlayer.stop()
    },
    [],
  )
  const record = async () => {
    setBusy(true)
    setError(null)
    setCandidate(null)
    try {
      audio.unlock()
      trackPlayer.stop()
      const m = await makeBacking()
      setBacking(m)
      const rec = new FreestyleRecorder()
      recorder.current = rec
      const take = await rec.record(
        {
          beat: { id: beatId, getBlob: () => getBeatAudio(beatId) },
          loop: { start: 0, end: 1 },
          bars: 1,
          secondsPerBeat: 60 / bpm,
          beatsPerBar,
          backing: m,
        },
        { onPhase: setPhase, onTime: setTime, onLive: setLive },
      )
      if (take) setCandidate(take)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setPhase('')
    }
  }
  const keep = async () => {
    if (!candidate) return
    setBusy(true)
    setError(null)
    try {
      const id = `${sessionId}:adlib:${crypto.randomUUID()}`
      await saveTakeAudio(id, sessionId, encodeWav([candidate.samples], candidate.sampleRate))
      rememberTake(id, { samples: candidate.samples, sampleRate: candidate.sampleRate })
      await onKeep([
        {
          id,
          startTime: candidate.startTime,
          durationSec: candidate.durationSec,
          peaks: candidate.peaks,
          muted: false,
          recordedAt: Date.now(),
        },
      ])
      setCandidate(null)
      audio.play('save')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const audition = async () => {
    if (!candidate || !backing || !audio.context) return
    const ctx = audio.context,
      buffer = ctx.createBuffer(1, candidate.samples.length, candidate.sampleRate)
    buffer.copyToChannel(new Float32Array(candidate.samples), 0)
    await trackPlayer.play(
      `adlib-preview:${sessionId}`,
      backing.beatBuffer,
      [...backing.clips, { buffer, beatTime: candidate.startTime, gain: levelGain(envelope(candidate.samples,candidate.sampleRate)) * 0.55 }],
      backing.from,
      backing.to,
    )
  }
  return (
    <section className="adlib-panel" aria-label="Ad-lib layer">
      <h3 className="eyebrow">AD-LIBS · OPTIONAL</h3>
      <p className="studio__hint">
        Headphones on. Add reactions or backing words over your finished song.
        {multiplayer
          ? ' This extra layer is saved on this device; the room’s lead vocals stay shared.'
          : ''}
      </p>
      {(candidate || layers[0] || busy) && (
        <div className="timeline__lane">
          <span className="timeline__label">Ad-libs</span>
          <VocalLane
            peaks={candidate?.peaks ?? (busy ? live : layers[0]?.peaks) ?? null}
            from={candidate?.startTime ?? layers[0]?.startTime ?? backing?.from ?? 0}
            to={backing?.to ?? (layers[0]?.startTime ?? 0) + (layers[0]?.durationSec ?? 1)}
            viewFrom={backing?.from ?? layers[0]?.startTime ?? 0}
            viewTo={backing?.to ?? (layers[0]?.startTime ?? 0) + (layers[0]?.durationSec ?? 1)}
            recording={busy && phase === 'live'}
          />
        </div>
      )}
      <div className="complete__actions">
        <button className="btn btn--ghost" disabled={busy} onClick={() => void record()}>
          <span>{candidate || layers.length ? 'Retake ad-libs' : 'Add ad-libs'}</span>
        </button>
        {busy && phase && (
          <>
            <span role="status">
              {phase === 'countin' ? 'Count-in' : phase} ·{' '}
              {Math.max(0, Math.floor(time - (backing?.from ?? 0)))} sec
            </span>
            <button className="btn btn--quiet" onClick={() => recorder.current?.cancel()}>
              <span>Cancel ad-libs</span>
            </button>
          </>
        )}
        {candidate && (
          <>
            <button className="btn btn--ghost" disabled={busy} onClick={() => void audition()}>
              <span>Preview ad-libs</span>
            </button>
            <button className="btn btn--primary" disabled={busy} onClick={() => void keep()}>
              <span>Keep ad-libs</span>
            </button>
          </>
        )}
        {!candidate && layers.length > 0 && (
          <button
            className="btn btn--quiet"
            disabled={busy}
            aria-pressed={layers[0].muted}
            onClick={() =>
              void onKeep(layers.map((l) => ({ ...l, muted: !l.muted }))).catch((e) =>
                setError(String(e)),
              )
            }
          >
            <span>{layers[0].muted ? 'Unmute ad-libs' : 'Mute ad-libs'}</span>
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
