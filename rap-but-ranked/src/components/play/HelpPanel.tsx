import { useEffect, useRef, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import type { CoachContext } from '../../coach/context'
import type { HelpInput } from '../../coach/help'
import { coachHelpWithModel } from '../../coach/llmCoach'
import type { AssistanceRecord, HelpLevel, HelpMode, HelpResponse } from '../../coach/types'
import { Icon } from '../beats/icons'

/**
 * The coach panel. Six ways in — THOUGHT, CONNECTIONS, RHYMES, FLIP, FLOW,
 * CRITIQUE — each starting with a nudge; "More help" goes one level deeper
 * (direction, then deep coaching). It never writes the bar for you.
 */
type Entry = { from: 'you'; text: string } | { from: 'coach'; res: HelpResponse; mode: HelpMode | 'ask' }

const MODES: { mode: HelpMode; label: string; hint: string; ask: string }[] = [
  { mode: 'thought', label: 'Thought', hint: 'Find what you actually want to say', ask: 'Help me find what I want to say.' },
  { mode: 'connections', label: 'Connections', hint: 'Where a word leads — worlds and collisions', ask: 'Show me where this idea connects.' },
  { mode: 'rhymes', label: 'Rhymes', hint: 'Rhyme families: multis, perfect, slant', ask: 'Rhyme families for my word.' },
  { mode: 'flip', label: 'Flip', hint: 'Second meanings and sound-alikes', ask: 'What else could this word mean?' },
  { mode: 'flow', label: 'Flow', hint: 'Turn a mumbled cadence into words', ask: 'Help me with this cadence.' },
  { mode: 'critique', label: 'Critique', hint: "What's working, what isn't — no rewrites", ask: 'Critique my bars.' },
]
const LEVEL_NAME: Record<HelpLevel, string> = { 1: 'Nudge', 2: 'Direction', 3: 'Deep help' }

export function HelpPanel({
  open,
  onClose,
  input,
  onAssist,
}: {
  open: boolean
  onClose: () => void
  input: () => Omit<HelpInput, 'mode' | 'level' | 'word' | 'sketch'> & { context: CoachContext }
  onAssist: (a: AssistanceRecord) => void
}) {
  const [log, setLog] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [word, setWord] = useState('')
  const [thinking, setThinking] = useState(false)
  const levels = useRef<Partial<Record<HelpMode, HelpLevel>>>({})
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [log, thinking])

  // the fixed sound button would sit on top of the drawer — tuck it away while help is open
  useEffect(() => {
    document.documentElement.toggleAttribute('data-help-open', open)
    return () => document.documentElement.removeAttribute('data-help-open')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const run = async (mode: HelpMode, level: HelpLevel, label: string, question?: string) => {
    if (thinking) return
    audio.play('toggle')
    setLog((l) => [...l, { from: 'you', text: label }])
    setThinking(true)
    try {
      const base = input()
      const w = word.trim()
      const sketch = mode === 'flow' && /[-]|\b(da|na|la|ba|dum)\b/i.test(w) ? w : undefined
      const res = await coachHelpWithModel({ ...base, mode, level, word: sketch ? undefined : w || undefined, sketch, question })
      levels.current[mode] = level
      onAssist({ mode: question ? 'ask' : mode, level, at: Date.now() })
      setLog((l) => [...l, { from: 'coach', res, mode: question ? 'ask' : mode }])
    } finally {
      setThinking(false)
    }
  }

  const tab = open ? 0 : -1
  return (
    <aside className="help" data-open={open ? '' : undefined} aria-hidden={!open} aria-label="Help">
      <header className="help__head">
        <span className="eyebrow">Coach · it won't write your bars</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close help" tabIndex={tab}>
          <Icon name="close" />
        </button>
      </header>
      <div className="help__tools">
        <div className="help__shortcuts" role="group" aria-label="Help modes">
          {MODES.map((m) => (
            <button key={m.mode} className="chip help__mode" title={m.hint} onClick={() => void run(m.mode, 1, m.ask)} tabIndex={tab}>
              {m.label}
            </button>
          ))}
        </div>
        <input className="input help__word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Word to work on, or a cadence (da-da-DA…) — optional" aria-label="Word or cadence to work on" tabIndex={tab} />
      </div>
      <div className="help__log" ref={listRef}>
        {!log.length && (
          <p className="help__empty">
            Pick a way in. Each starts with a nudge — press <b>More help</b> to go deeper. I'll ask questions, open doors and show rhyme families, but the bar is yours to write.
          </p>
        )}
        {log.map((e, i) =>
          e.from === 'you' ? (
            <div key={i} className="help__msg help__msg--you">
              {e.text}
            </div>
          ) : (
            <CoachMessage
              key={i}
              entry={e}
              latest={i === log.length - 1}
              onMore={() => {
                if (e.mode === 'ask') return
                const next = Math.min(3, (levels.current[e.mode] ?? e.res.level) + 1) as HelpLevel
                void run(e.mode, next, `More help (${LEVEL_NAME[next].toLowerCase()})`)
              }}
              disabled={thinking}
              tab={tab}
            />
          ),
        )}
        {thinking && <div className="help__msg help__msg--help help__msg--thinking">Thinking…</div>}
      </div>
      <form
        className="help__ask"
        onSubmit={(e) => {
          e.preventDefault()
          const text = q.trim()
          if (!text) return
          setQ('')
          void run('thought', 2, text, text)
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the coach anything (it still won't write it)" tabIndex={tab} />
      </form>
    </aside>
  )
}

function CoachMessage({ entry, latest, onMore, disabled, tab }: { entry: Extract<Entry, { from: 'coach' }>; latest: boolean; onMore: () => void; disabled: boolean; tab: number }) {
  const r = entry.res
  return (
    <div className="help__msg help__msg--help help__coach" data-mode={entry.mode}>
      <p className="help__line">{r.message}</p>
      {r.sections.map((s) => (
        <div key={s.title} className="help__section">
          <span className="help__section-title">{s.title}</span>
          {s.items.length > 0 && (
            <ul>
              {s.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {s.groups?.map((g) => (
            <div key={g.label} className="help__group">
              <span className="help__group-label">{g.label}</span>
              <span className="help__chips">
                {g.items.map((x) => (
                  <span key={x} className="help__chip">
                    {x}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      {r.yourMove && (
        <p className="help__move">
          <b>Your move:</b> {r.yourMove}
        </p>
      )}
      <span className="help__src">
        {r.engine === 'local-ai' ? 'Rap AI + rules' : 'Rules coach'} · {entry.mode === 'ask' ? 'answer' : `${entry.mode} · ${LEVEL_NAME[r.level]}`}
      </span>
      {latest && r.canGoDeeper && entry.mode !== 'ask' && (
        <button className="btn btn--quiet help__more" onClick={onMore} disabled={disabled} tabIndex={tab}>
          <span>More help</span>
        </button>
      )}
    </div>
  )
}
