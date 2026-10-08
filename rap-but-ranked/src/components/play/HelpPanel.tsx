import { useEffect, useRef, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { currentDirector, type HelpContext, type HelpKind } from '../../director'
import { Icon } from '../beats/icons'

/**
 * Side panel that knows the current challenge and the song so far. It
 * teaches and hints — it won't write your bars.
 */
interface Msg {
  from: 'you' | 'help'
  text: string
  source?: string
}

const SHORTCUTS: { kind: HelpKind; label: string; ask: string }[] = [
  { kind: 'explain', label: 'Explain challenge', ask: 'What is this challenge asking me to do?' },
  { kind: 'hint', label: 'Give hint', ask: 'Give me a hint without writing the bar.' },
  { kind: 'rhyme', label: 'Rhyme help', ask: 'Help me find rhymes.' },
  { kind: 'story', label: 'Story help', ask: 'Where is my story going?' },
]

export function HelpPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: () => HelpContext }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, thinking])

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

  const ask = async (kind: HelpKind, label: string, question?: string) => {
    if (thinking) return
    audio.play('toggle')
    setMsgs((m) => [...m, { from: 'you', text: label }])
    setThinking(true)
    const director = currentDirector()
    try {
      const text = await director.help(kind, { ...context(), question })
      setMsgs((m) => [...m, { from: 'help', text, source: director.source === 'local-ai' && kind !== 'rhyme' ? 'Rap AI' : 'Basic helper' }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <aside className="help" data-open={open ? '' : undefined} aria-hidden={!open} aria-label="Help">
      <header className="help__head">
        <span className="eyebrow">Help</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close help" tabIndex={open ? 0 : -1}>
          <Icon name="close" />
        </button>
      </header>
      <div className="help__shortcuts">
        {SHORTCUTS.map((s) => (
          <button key={s.kind} className="chip" onClick={() => void ask(s.kind, s.ask)} tabIndex={open ? 0 : -1}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="help__log" ref={listRef}>
        {!msgs.length && <p className="help__empty">Stuck? I can explain the challenge, give a hint, find rhymes or talk through the story. I won't write the bars — that's on you.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`help__msg help__msg--${m.from}`}>
            {m.text}
            {m.source && <span className="help__src">{m.source}</span>}
          </div>
        ))}
        {thinking && <div className="help__msg help__msg--help help__msg--thinking">Thinking…</div>}
      </div>
      <form
        className="help__ask"
        onSubmit={(e) => {
          e.preventDefault()
          const text = q.trim()
          if (!text) return
          setQ('')
          void ask('question', text, text)
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about rap or this challenge" tabIndex={open ? 0 : -1} />
      </form>
    </aside>
  )
}
