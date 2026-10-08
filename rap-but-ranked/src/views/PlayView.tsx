import { useState, type CSSProperties } from 'react'
import { PageShell } from '../components/layout/PageShell'
import { Button, Field, Panel, Segmented } from '../components/ui/ui'
import { RANKS } from '../domain/rank'
import { BeatSelect } from '../components/beats/BeatSelect'
import type { TrackLength } from '../domain/types'
import './views.css'

const LOOP = [
  { n: '01', title: 'Write', body: 'Two bars. Your words. The AI never fills them in.' },
  { n: '02', title: 'Rap', body: 'Record over the exact two bars of the beat.' },
  { n: '03', title: 'Ranked', body: 'Scored category by category. D to S.' },
  { n: '04', title: 'Next', body: 'Your story decides what the next two bars are about.' },
]

export function PlayView() {
  const [length, setLength] = useState<TrackLength>(16)

  return (
    <PageShell id="play">
      <div className="play-grid">
        <Panel title="Track setup" aside={<span className="rank-pill">Rank · Unranked</span>} i={3}>
          <div className="form">
            <Field label="Track name">
              <input className="input" placeholder="Untitled track" maxLength={40} />
            </Field>
            <Field label="Beat">
              <BeatSelect />
            </Field>
            <Field label="Starting topic">
              <input className="input" placeholder="e.g. wanting money" maxLength={60} />
            </Field>
            <Field label="Length">
              <Segmented<TrackLength>
                label="Length"
                value={length}
                onChange={setLength}
                options={[8, 16, 32].map((n) => ({ value: n as TrackLength, label: `${n} bars` }))}
              />
            </Field>
            <p className="form__meta">
              {length / 2} challenges · 2 bars each
            </p>
            <Button variant="primary" disabled clickSound="error" className="form__start">
              Start
            </Button>
          </div>
        </Panel>

        <div className="play-side">
          <Panel title="The loop" i={4}>
            <ol className="loop">
              {LOOP.map((s, i) => (
                <li key={s.n} className="loop__step enter" style={{ '--i': 5 + i } as CSSProperties}>
                  <span className="loop__n">{s.n}</span>
                  <div>
                    <h3 className="loop__title">{s.title}</h3>
                    <p className="loop__body">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Ranks" i={6}>
            <div className="ladder">
              {RANKS.map((r) => (
                <span key={r} className={`ladder__rank ladder__rank--${r}`}>
                  {r}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
