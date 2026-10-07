import { useEffect, useState, type CSSProperties } from 'react'
import { PageShell } from '../components/layout/PageShell'
import { Button, Panel, Segmented } from '../components/ui/ui'
import { audio } from '../audio/AudioEngine'
import type { FreestyleDifficulty, FreestyleDuration } from '../domain/types'
import './views.css'

const DIFFICULTIES: { id: FreestyleDifficulty; label: string; every: string; note: string }[] = [
  { id: 'easy', label: 'Easy', every: 'Every 8 bars', note: 'Simple topics' },
  { id: 'medium', label: 'Medium', every: 'Every 4 bars', note: 'Mixed topics' },
  { id: 'hard', label: 'Hard', every: 'Every 2 bars', note: 'Harder concepts' },
  { id: 'chaos', label: 'Chaos', every: 'Whenever', note: 'Fast, random, weird' },
]

const PREVIEW_WORDS = ['MONEY', 'SCHOOL', 'REGRET', 'SPACE', 'GRAVITY', 'MUM', 'TIME TRAVEL']

export function FreestyleView() {
  const [difficulty, setDifficulty] = useState<FreestyleDifficulty>('medium')
  const [duration, setDuration] = useState<FreestyleDuration>(60)
  const [word, setWord] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setWord((w) => (w + 1) % PREVIEW_WORDS.length), 1700)
    return () => clearInterval(t)
  }, [])

  return (
    <PageShell id="freestyle">
      <div className="freestyle">
        <div className="freestyle__setup">
          <Panel title="Difficulty" i={3}>
            <div className="diff-grid" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={difficulty === d.id}
                  className={`diff diff--${d.id}`}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && difficulty !== d.id && audio.play('hover')}
                  onClick={() => {
                    if (difficulty !== d.id) audio.play('toggle')
                    setDifficulty(d.id)
                  }}
                >
                  <span className="diff__label">{d.label}</span>
                  <span className="diff__every">{d.every}</span>
                  <span className="diff__note">{d.note}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Duration" i={4}>
            <Segmented<FreestyleDuration>
              label="Duration"
              value={duration}
              onChange={setDuration}
              options={[
                { value: 30, label: '30 sec' },
                { value: 60, label: '60 sec' },
                { value: 120, label: '2 min' },
              ]}
            />
            <Button variant="primary" disabled clickSound="error" className="freestyle__start">
              Start
            </Button>
          </Panel>
        </div>

        <Panel title="Next prompt" i={5} className="prompt-preview">
          <div className="prompt-preview__stage" aria-live="off">
            <span key={word} className="prompt-preview__word">
              {PREVIEW_WORDS[word]}
            </span>
          </div>
          <div className="prompt-preview__bars" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ '--b': i } as CSSProperties} />
            ))}
          </div>
          <p className="prompt-preview__note">Keep rapping. Work it in before the next one lands.</p>
        </Panel>
      </div>
    </PageShell>
  )
}
