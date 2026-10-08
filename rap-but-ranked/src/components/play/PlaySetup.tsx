import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { router } from '../../app/router'
import { RANKS } from '../../domain/rank'
import type { Session, TrackLength } from '../../domain/types'
import { lengthsFor, totalRounds } from '../../play/sessionLogic'
import { useBeats } from '../../storage/useBeats'
import { BeatSelect } from '../beats/BeatSelect'
import { Button, Field, Panel, Segmented } from '../ui/ui'
import { AiStatus } from './AiStatus'

const TOPICS = ['wanting money', 'my mum', 'the come up', 'heartbreak', 'school', 'my city', 'loyalty', 'regret', 'proving them wrong']

export interface SetupValues {
  trackName: string
  beatId: string
  topic: string
  length: TrackLength
}

export function PlaySetup({
  resume,
  onStart,
  onResume,
  onDiscard,
}: {
  resume: Session | null
  onStart: (v: SetupValues) => void
  onResume: (s: Session) => void
  onDiscard: (s: Session) => void
}) {
  const { beats } = useBeats()
  const [trackName, setTrackName] = useState('')
  const [beatId, setBeatId] = useState('')
  const [topic, setTopic] = useState('')
  const [length, setLength] = useState<TrackLength>(16)
  const beat = useMemo(() => beats?.find((b) => b.id === beatId) ?? null, [beats, beatId])
  const allowed = beat ? lengthsFor(beat) : ([8, 16, 32] as TrackLength[])

  // keep the chosen length valid for the beat
  useEffect(() => {
    if (beat && !allowed.includes(length) && allowed.length) setLength(allowed[allowed.length - 1])
  }, [beat, allowed, length])

  const canStart = !!beat && allowed.length > 0 && topic.trim().length > 0
  const start = () => canStart && onStart({ trackName, beatId, topic, length })

  return (
    <div className="play-grid">
      <div className="play-main">
        {resume && (
          <Panel title="Unfinished track" i={2} className="resume">
            <div className="resume__row">
              <div>
                <b className="resume__name">{resume.trackName}</b>
                <span className="resume__meta">
                  {resume.beatName} · {resume.rounds.filter((r) => r.result).length} / {totalRounds(resume)} rounds · {resume.startingTopic}
                </span>
              </div>
              <div className="resume__actions">
                <button className="btn btn--quiet" onClick={() => (audio.play('back'), onDiscard(resume))}>
                  <span>Discard</span>
                </button>
                <Button variant="primary" hoverSound="hover" onClick={() => onResume(resume)}>
                  Continue
                </Button>
              </div>
            </div>
          </Panel>
        )}

        <Panel title="New track" aside={<span className="rank-pill">Rank · Unranked</span>} i={3}>
          <div className="form">
            <Field label="Track name">
              <input className="input" placeholder="Untitled track" maxLength={40} value={trackName} onChange={(e) => setTrackName(e.target.value)} />
            </Field>
            <Field label="Beat">
              <BeatSelect value={beatId || undefined} onChange={setBeatId} />
            </Field>
            <Field label="Starting topic">
              <input
                className="input"
                placeholder="e.g. wanting money"
                maxLength={60}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && start()}
              />
            </Field>
            <div className="chips" aria-label="Topic ideas">
              {TOPICS.map((t) => (
                <button key={t} type="button" className="chip" data-on={topic === t ? '' : undefined} onClick={() => (audio.play('toggle'), setTopic(t))}>
                  {t}
                </button>
              ))}
            </div>
            <Field label="Length" hint={beat && allowed.length < 3 ? <span className="field__note">This beat fits {allowed.length ? `up to ${allowed[allowed.length - 1]}` : 'fewer than 8'} bars</span> : undefined}>
              <Segmented<TrackLength>
                label="Length"
                value={length}
                onChange={setLength}
                options={([8, 16, 32] as TrackLength[]).map((n) => ({ value: n, label: `${n} bars`, disabled: !allowed.includes(n) }))}
              />
            </Field>
            <p className="form__meta">
              {length / 2} challenges · 2 bars each{beat ? ` · ${beat.name}` : ''}
            </p>
            {beats && beats.length === 0 ? (
              <Button variant="primary" className="form__start" onClick={() => router.navigate('beats')}>
                Add a beat first
              </Button>
            ) : (
              <Button variant="primary" className="form__start" disabled={!canStart} onClick={start} clickSound={canStart ? 'confirm' : 'error'}>
                Start
              </Button>
            )}
          </div>
        </Panel>
      </div>

      <div className="play-side">
        <Panel title="Director" i={4}>
          <AiStatus />
        </Panel>
        <Panel title="How it works" i={5}>
          <ol className="loop">
            {[
              ['01', 'Write', 'Two bars. Your words — nothing writes them for you.'],
              ['02', 'Rap', 'Record over the exact two bars of the beat.'],
              ['03', 'Ranked', 'Scored category by category, D to S.'],
              ['04', 'Next', 'Your story decides what the next two bars are about.'],
            ].map(([n, t, b], i) => (
              <li key={n} className="loop__step enter" style={{ '--i': 6 + i } as CSSProperties}>
                <span className="loop__n">{n}</span>
                <div>
                  <h3 className="loop__title">{t}</h3>
                  <p className="loop__body">{b}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="ladder ladder--small">
            {RANKS.map((r) => (
              <span key={r} className={`ladder__rank ladder__rank--${r}`}>
                {r}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
