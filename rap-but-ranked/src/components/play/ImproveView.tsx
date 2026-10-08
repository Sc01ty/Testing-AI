import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { Session } from '../../domain/types'
import { analyseTrack, type Exercise, type Insight } from '../../improve/analyse'
import { finalResult } from '../../scoring/round'
import { listSessions } from '../../storage'
import { listDuos } from '../../multiplayer/store'

/**
 * IMPROVE — not a chatbot: pick one of your finished tracks and get a
 * read on how you write, built from that track's own bars and scores,
 * plus small exercises you check yourself (they never write bars for you).
 */
export function ImproveView({ onPlay }: { onPlay: () => void }) {
  const [tracks, setTracks] = useState<Session[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([listSessions(),listDuos()]).then(([singles,duos]) => {
      const all:Session[]=[...singles,...duos.filter(s=>s.status==='complete').map(s=>({id:s.id,trackName:`${s.trackName} · ${s.players.join(' × ')}`,beatId:s.beatId,beatName:s.beatName,beatGrid:s.beatGrid,startingTopic:s.topic,length:s.length,storyDirection:s.storyDirection,status:'complete' as const,createdAt:s.createdAt,updatedAt:s.updatedAt,rounds:s.turns.flatMap(t=>Array.from({length:t.lyrics.length/2},(_,i)=>({index:t.barStart/2+i,lyrics:[t.lyrics[i*2],t.lyrics[i*2+1]] as [string,string],challenge:t.challenge,take:null,result:t.result})))}))]
      const done = all.filter((s) => s.status === 'complete').sort((a, b) => b.createdAt - a.createdAt)
      setTracks(done)
      setPick((p) => p ?? done[0]?.id ?? null)
    })
  }, [])

  const track = tracks?.find((t) => t.id === pick) ?? null
  const report = useMemo(() => (track ? analyseTrack(track) : null), [track])

  if (tracks === null) return <p className="eyebrow">Loading…</p>
  if (!tracks.length)
    return (
      <div className="empty">
        <h2 className="empty__title">Complete a rap first</h2>
        <p className="empty__sub">I need something to analyse before I can help you improve.</p>
        <button className="btn btn--primary" onClick={onPlay}>
          <span>Play</span>
        </button>
      </div>
    )

  return (
    <div className="improve">
      <aside className="improve__pick enter" style={{ '--i': 2 } as CSSProperties}>
        <span className="eyebrow">Your saved raps</span>
        <ul role="radiogroup" aria-label="Choose a rap to analyse">
          {tracks.map((t) => {
            const f = finalResult(t.rounds.map((r) => r.result!).filter(Boolean))
            return (
              <li key={t.id}>
                <button
                  role="radio"
                  aria-checked={t.id === pick}
                  className="improve__track"
                  onClick={() => {
                    if (t.id !== pick) audio.play('toggle')
                    setPick(t.id)
                  }}
                >
                  <span className={`rank-chip-sm rank-chip-sm--${f.rank}`}>{f.rank}</span>
                  <span className="improve__track-name">{t.trackName}</span>
                  <span className="improve__track-meta">
                    {t.length} bars · {t.startingTopic} · {new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {track && report && (
        <div className="improve__report" key={track.id}>
          <header className="improve__head enter" style={{ '--i': 2 } as CSSProperties}>
            <span className="eyebrow">Improve · {track.trackName}</span>
            <div className="improve__stats">
              {report.stats.map((s) => (
                <span key={s.label}>
                  <span className="eyebrow">{s.label}</span>
                  <b>{s.value}</b>
                </span>
              ))}
            </div>
          </header>

          <Section title="What you're doing well" tone="good" items={report.strengths} i={3} />
          <Section title="What's holding you back" tone="bad" items={report.weaknesses} i={4} empty="Nothing big — push the exercises to go from good to sharp." />

          <section className="improve__section enter" style={{ '--i': 5 } as CSSProperties}>
            <h3 className="improve__title">What to think about next time</h3>
            <ol className="improve__think">
              {report.thinkAbout.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </section>

          <section className="improve__section enter" style={{ '--i': 6 } as CSSProperties}>
            <h3 className="improve__title">Exercises</h3>
            <div className="improve__exercises">
              {report.exercises.map((e) => (
                <ExercisePad key={`${track.id}:${e.id}`} exercise={e} />
              ))}
            </div>
          </section>

          <div className="improve__go enter" style={{ '--i': 7 } as CSSProperties}>
            <button className="btn btn--primary" onClick={onPlay}>
              <span>Play a new track</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, tone, items, i, empty }: { title: string; tone: 'good' | 'bad'; items: Insight[]; i: number; empty?: string }) {
  return (
    <section className="improve__section enter" style={{ '--i': i } as CSSProperties} data-tone={tone}>
      <h3 className="improve__title">{title}</h3>
      {items.length ? (
        <ul className="improve__insights">
          {items.map((x) => (
            <li key={x.id} className="insight">
              <b className="insight__title">{x.title}</b>
              <p className="insight__detail">{x.detail}</p>
              {x.evidence && <p className="insight__evidence">{x.evidence}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="studio__hint">{empty}</p>
      )}
    </section>
  )
}

function ExercisePad({ exercise }: { exercise: Exercise }) {
  const [lines, setLines] = useState<string[]>(() => Array(exercise.lines).fill(''))
  const [result, setResult] = useState<{ pass: boolean; notes: string[] } | null>(null)
  const check = () => {
    const r = exercise.check(lines)
    setResult(r)
    audio.play(r.pass ? 'save' : 'error')
  }
  return (
    <div className="exercise" data-pass={result ? (result.pass ? 'yes' : 'no') : undefined}>
      <span className="eyebrow">Exercise · {exercise.title}</span>
      <p className="exercise__brief">{exercise.brief}</p>
      <div className="exercise__lines">
        {lines.map((l, i) => (
          <label key={i} className="bar-line">
            <span className="bar-line__n">{i + 1}</span>
            <input
              className="bar-line__input"
              value={l}
              maxLength={140}
              placeholder={i === 0 ? 'Your bar' : ''}
              aria-label={`${exercise.title}, line ${i + 1}`}
              onChange={(e) => {
                setLines((ls) => ls.map((x, k) => (k === i ? e.target.value : x)))
                setResult(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && check()}
            />
          </label>
        ))}
      </div>
      <div className="exercise__foot">
        <button className="btn btn--ghost" onClick={check}>
          <span>Check</span>
        </button>
        {result && (
          <ul className="exercise__notes" role="status">
            <li className="exercise__verdict">{result.pass ? 'Nailed it.' : 'Not yet.'}</li>
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
