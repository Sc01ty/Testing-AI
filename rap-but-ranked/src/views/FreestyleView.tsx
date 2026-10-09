import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { audio } from '../audio/AudioEngine'
import { encodeWav } from '../audio/wav'
import { BeatSelect } from '../components/beats/BeatSelect'
import { FreestyleComplete } from '../components/freestyle/FreestyleComplete'
import { FreestyleLive } from '../components/freestyle/FreestyleLive'
import { RhymeBall } from '../components/freestyle/RhymeBall'
import { Landings } from '../components/freestyle/Landings'
import { beatPlayer, useBeatPlayer } from '../audio/BeatPlayer'
import { planRhymeRun, RHYME_RUN_RULES, scoreRhymeRun } from '../freestyle/rhymeRun'
import { getBeatAudio } from '../storage'
import type { BeatMeta } from '../domain/types'
import { PageShell } from '../components/layout/PageShell'
import { Judging } from '../components/play/Judging'
import { Button, Panel, Segmented, Toggle } from '../components/ui/ui'
import type { FreestyleCategory, FreestyleDifficulty, FreestyleDuration, FreestyleMode, FreestyleSession } from '../domain/types'
import { ASR_MODEL_NAME, ASR_SIZE_MB, transcriber, useTranscriber } from '../freestyle/asr'
import type { FreestyleRecording } from '../freestyle/recorder'
import { scoreFreestyle } from '../freestyle/score'
import { freestyleShape, newFreestyle, timing } from '../freestyle/session'
import { rememberTake, takeSamples } from '../play/takeAudio'
import { useSettings } from '../settings/useSettings'
import { deleteFreestyle, getFreestyle, saveFreestyle, saveTakeAudio } from '../storage'
import { useBeats } from '../storage/useBeats'
import '../components/play/play.css'
import './views.css'

const DIFFICULTIES: { id: FreestyleDifficulty; label: string; every: string; note: string }[] = [
  { id: 'easy', label: 'Easy', every: 'Every 8 bars', note: 'Simple topics' },
  { id: 'medium', label: 'Medium', every: 'Every 4 bars', note: 'Mixed topics' },
  { id: 'hard', label: 'Hard', every: 'Every 2 bars', note: 'Harder concepts' },
  { id: 'chaos', label: 'Chaos', every: 'Whenever', note: 'Fast, random, weird' },
]

const PREVIEW_WORDS = ['MONEY', 'SCHOOL', 'REGRET', 'SPACE', 'GRAVITY', 'MUM', 'TIME TRAVEL']

type Stage = { kind: 'setup' } | { kind: 'live'; f: FreestyleSession } | { kind: 'listening'; f: FreestyleSession } | { kind: 'judging'; f: FreestyleSession } | { kind: 'done'; f: FreestyleSession }

/** Remember the open freestyle, so a refresh mid-scoring picks it back up. */
const OPEN_KEY = 'rbr.openFreestyle'
const readOpen = () => {
  try {
    return sessionStorage.getItem(OPEN_KEY)
  } catch {
    return null
  }
}
const writeOpen = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(OPEN_KEY, id)
    else sessionStorage.removeItem(OPEN_KEY)
  } catch {
    /* ignore */
  }
}

export function FreestyleView() {
  const [stage, setStage] = useState<Stage>({ kind: 'setup' })
  const [error, setError] = useState<string | null>(null)
  const { beats } = useBeats()

  // reopen a freestyle that was being scored / just finished
  useEffect(() => {
    const id = readOpen()
    if (!id) return
    void getFreestyle(id).then((f) => {
      if (!f || !f.take) return writeOpen(null)
      setStage(f.result ? { kind: 'done', f } : { kind: 'listening', f })
    })
  }, [])

  const go = (s: Stage) => {
    writeOpen(s.kind === 'setup' || s.kind === 'live' ? null : s.f.id)
    setStage(s)
  }

  const start = async (f: FreestyleSession) => {
    audio.unlock()
    audio.play('enter')
    setError(null)
    await saveFreestyle(f)
    go({ kind: 'live', f })
  }

  const recorded = async (f: FreestyleSession, rec: FreestyleRecording) => {
    const takeId = `${f.id}:take`
    rememberTake(takeId, { samples: rec.samples, sampleRate: rec.sampleRate })
    await saveTakeAudio(takeId, f.id, encodeWav([rec.samples], rec.sampleRate))
    const next: FreestyleSession = {
      ...f,
      bars: Math.max(1, rec.barsDone),
      prompts: f.prompts.filter((p) => p.bar < Math.max(1, rec.barsDone)),
      take: { id: takeId, startTime: rec.startTime, durationSec: rec.durationSec, sampleRate: rec.sampleRate, latencySec: rec.latencySec, inputPeak: rec.inputPeak, peaks: rec.peaks, recordedAt: Date.now() },
    }
    await saveFreestyle(next)
    go({ kind: 'listening', f: next })
  }

  const scored = async (f: FreestyleSession) => {
    await saveFreestyle(f)
    go({ kind: 'judging', f })
  }

  const beatOf = (f: FreestyleSession) => beats?.find((b) => b.id === f.beatId) ?? null

  let body: React.ReactNode
  if (stage.kind === 'live') {
    body = (
      <FreestyleLive
        session={stage.f}
        onDone={(r) => void recorded(stage.f, r)}
        onCancel={(e) => {
          void deleteFreestyle(stage.f.id)
          if (e) {
            audio.play('error')
            setError(e)
          }
          go({ kind: 'setup' })
        }}
      />
    )
  } else if (stage.kind === 'listening') {
    body = <Listening f={stage.f} onScored={(f) => void scored(f)} />
  } else if (stage.kind === 'judging') {
    const f = stage.f
    body = (
      <Judging
        eyebrow={`Freestyle complete · ${f.bars} bars`}
        listening="The judge is listening back"
        scoreLabel="Freestyle score"
        result={f.result!}
        after={
          f.ball ? <Landings f={f} /> : <div className="fs-prompts">
            {f.result!.prompts.map((p) => (
              <span key={`${p.bar}-${p.word}`} className="fs-chip" data-hit={f.result!.transcribed ? (p.hit ? 'yes' : 'no') : undefined}>
                <small>bar {p.bar + 1}</small>
                {p.word}
                {f.result!.transcribed && <b>{p.hit ? '✓' : '✗'}</b>}
              </span>
            ))}
          </div>
        }
        continueLabel="See the breakdown"
        onContinue={() => (audio.play('confirm'), go({ kind: 'done', f }))}
      />
    )
  } else if (stage.kind === 'done') {
    const f = stage.f
    body = (
      <FreestyleComplete
        f={f}
        beat={beatOf(f)}
        onAgain={() => {
          const b = beatOf(f)
          const again = b ? newFreestyle({ beat: b, difficulty: f.difficulty, durationSec: f.requestedDurationSec ?? f.bars * timing(f).spBar, every: f.promptEvery ?? null, category:f.category ?? 'mixed', mode:f.mode ?? 'topic' }) : null
          if (again) void start(again)
          else go({ kind: 'setup' })
        }}
        onNew={() => go({ kind: 'setup' })}
      />
    )
  } else {
    body = <Setup error={error} onStart={(f) => void start(f)} />
  }

  return (
    <PageShell id="freestyle" compact={stage.kind !== 'setup'}>
      {body}
    </PageShell>
  )
}

// ── setup ────────────────────────────────────────────────────────────
function Setup({ onStart, error }: { onStart: (f: FreestyleSession) => void; error: string | null }) {
  const { beats } = useBeats()
  const [difficulty, setDifficulty] = useState<FreestyleDifficulty>('medium')
  const [mode, setMode] = useState<FreestyleMode>('rhyme')
  const [category,setCategory] = useState<FreestyleCategory>('mixed')
  const [duration, setDuration] = useState<FreestyleDuration>(60)
  const [every, setEvery] = useState<'auto' | 2 | 4 | 8>('auto')
  const [beatId, setBeatId] = useState('')
  const [word, setWord] = useState(0)
  const [settings, setSettings] = useSettings()
  const asr = useTranscriber()
  const beat = useMemo(() => beats?.find((b) => b.id === beatId) ?? null, [beats, beatId])
  const shape = beat ? freestyleShape(beat, duration) : null

  useEffect(() => void transcriber.detect(), [])
  useEffect(() => {
    const t = window.setInterval(() => setWord((w) => (w + 1) % PREVIEW_WORDS.length), 1700)
    return () => clearInterval(t)
  }, [])

  const start = () => {
    if (!beat) return
    const f = newFreestyle({ beat, difficulty, durationSec: duration, every: every === 'auto' ? null : every, category, mode })
    if (f) onStart(f)
  }

  const asrLine =
    asr.status === 'ready' || asr.status === 'cached'
      ? `${ASR_MODEL_NAME} is on this device — your freestyle is transcribed here, never uploaded.`
      : asr.status === 'downloading'
        ? `Downloading ${ASR_MODEL_NAME}… ${Math.round(asr.progress * 100)}%`
        : asr.status === 'error'
          ? `Speech recognition failed to load (${asr.error}). Freestyles will be scored on timing and continuity only.`
          : `First freestyle downloads ${ASR_MODEL_NAME} (~${ASR_SIZE_MB} MB, once) to transcribe it on this device.`

  return (
    <div className="freestyle">
      <div className="freestyle__setup">
        <Panel title="Mode" i={1}><Segmented<FreestyleMode> label="Mode" value={mode} onChange={setMode} options={[{value:'rhyme',label:'Rhyme Run'},{value:'topic',label:'Topic Run'}]}/><p className="studio__hint">{mode === 'rhyme' ? 'The ball bounces on every beat. Rap whatever you like on 1, 2, 3 — then land the rhyme word with the ball on 4.' : 'A new topic every few bars — work it in before the next one.'}</p></Panel>
        {mode === 'topic' && <Panel title="Category" i={2}><Segmented<FreestyleCategory> label="Category" value={category} onChange={setCategory} options={(['everyday','personal','absurd','mixed'] as const).map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}))}/></Panel>}
        <Panel title="Difficulty" i={3}>
          <div className="diff-grid" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => mode === 'rhyme' ? { ...d, every: RHYME_RUN_RULES[d.id].label === 'Chaos' ? 'Expert' : 'Every bar', note: RHYME_RUN_RULES[d.id].note } : d).map((d) => (
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
        <Panel title="Beat" i={4}>
          <BeatSelect value={beatId || undefined} onChange={setBeatId} />
          {beat && shape && (
            <p className="fs-setup__note">
              {shape.bars} bars at {Math.round(beat.bpm)} BPM{shape.loopBars < shape.bars ? ` · the beat loops every ${shape.loopBars} bars` : ''}
            </p>
          )}
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
          {mode === 'topic' && <div className="fs-setup__row">
            <span className="eyebrow">Prompt every</span>
            <Segmented<'auto' | 2 | 4 | 8>
              label="Prompt frequency"
              value={every}
              onChange={setEvery}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 2, label: '2 bars' },
                { value: 4, label: '4 bars' },
                { value: 8, label: '8 bars' },
              ]}
            />
          </div>}
          <div className="fs-setup__row">
            <span className="fs-setup__asr">{asrLine}</span>
            <Toggle label="Transcribe my freestyle" checked={settings.freestyleTranscribe} onChange={(v) => setSettings({ freestyleTranscribe: v })} />
          </div>
          {error && (
            <p className="studio__hint" role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" disabled={!beat || !shape} clickSound="confirm" className="freestyle__start" onClick={start}>
            Start
          </Button>
        </Panel>
      </div>

      {mode === 'rhyme' ? (
        <Panel title="How it works" i={5} className="prompt-preview">
          <BallPreview beat={beat} difficulty={difficulty} />
        </Panel>
      ) : (
      <Panel title="How it works" i={5} className="prompt-preview">
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
        <p className="prompt-preview__note">One bar of count-in, then the beat runs and you don't stop. A new word lands every few bars — work it in before the next one. 🎧 Headphones on.</p>
      </Panel>
      )}
    </div>
  )
}

// ── listening back: transcribe (optional) + score ─────────────────────
function Listening({ f, onScored }: { f: FreestyleSession; onScored: (f: FreestyleSession) => void }) {
  const asr = useTranscriber()
  const [settings] = useSettings()
  const [skip, setSkip] = useState(!settings.freestyleTranscribe)
  const [note, setNote] = useState<string | null>(null)

  const finish = useCallback(
    async (transcript: FreestyleSession['transcript']) => {
      const s = await takeSamples(f.take!.id)
      if (!s) return setNote("This freestyle's audio is missing — it can't be scored.")
      const { spb, spBar } = timing(f)
      const { ensureLexicon } = await import('../coach/lexicon')
      await ensureLexicon()
      const result = f.ball
        ? scoreRhymeRun({ prompts: f.prompts, bars: f.bars, secondsPerBeat: spb, beatsPerBar: f.beatGrid.beatsPerBar, words: transcript?.words ?? null, samples: s.samples, sampleRate: s.sampleRate, startTime: f.take!.startTime })
        : scoreFreestyle({ prompts: f.prompts, bars: f.bars, secondsPerBar: spBar, secondsPerBeat: spb, words: transcript?.words ?? null, samples: s.samples, sampleRate: s.sampleRate, startTime: f.take!.startTime })
      onScored({ ...f, transcript, result })
    },
    [f, onScored],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      if (skip) return finish(null)
      const s = await takeSamples(f.take!.id)
      if (!s || !alive) return
      try {
        const t = await transcriber.transcribe(s.samples, s.sampleRate, f.take!.startTime)
        if (alive) await finish({ ...t, model: ASR_MODEL_NAME })
      } catch (e) {
        if (!alive) return
        setNote(`Speech recognition didn't work here (${e instanceof Error ? e.message : String(e)}) — scoring on timing and continuity only.`)
        await finish(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [skip]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.round(asr.progress * 100)
  return (
    <div className="judging fs-listening">
      <header className="judging__head">
        <span className="eyebrow">Freestyle · {f.bars} bars</span>
        <h2 className="judging__listening">
          {asr.status === 'downloading' ? 'Downloading speech recognition' : 'Listening back'}
          <span className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </h2>
      </header>
      <div className="ai__bar fs-listening__bar" style={{ '--p': asr.progress } as CSSProperties} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i />
      </div>
      <p className="studio__hint">
        {note ??
          (asr.status === 'downloading'
            ? `${ASR_MODEL_NAME}, ~${ASR_SIZE_MB} MB, once — ${asr.detail}. It runs on this device; your audio isn't uploaded.`
            : asr.status === 'working'
              ? `Transcribing on this device… ${pct}%`
              : 'Getting ready…')}
      </p>
      {!skip && !note && (
        <button className="btn btn--quiet" onClick={() => setSkip(true)}>
          <span>Skip — score timing and continuity only</span>
        </button>
      )}
    </div>
  )
}

// ── Rhyme Run: try the ball before you record ────────────────────────
function BallPreview({ beat, difficulty }: { beat: BeatMeta | null; difficulty: FreestyleDifficulty }) {
  const player = useBeatPlayer()
  const bars = 8
  const prompts = useMemo(() => planRhymeRun(difficulty, bars, 42), [difficulty])
  const playable = useMemo(() => (beat ? { id: beat.id, getBlob: () => getBeatAudio(beat.id) } : null), [beat])
  const playing = !!beat && player.playing && player.beatId === beat.id
  const spBar = beat ? (60 / beat.bpm) * beat.beatsPerBar : 1
  const end = beat ? Math.min(beat.durationSec, beat.introOffset + bars * spBar) : 0
  // the ball reads the beat player's own clock, minus what the speakers add
  const clock = useCallback(() => {
    if (!beat) return null
    const pos = beatPlayer.position(beat.id)
    if (pos === null || !beatPlayer.isPlaying(beat.id)) return null
    const ctx = audio.context
    const heard = ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0
    return pos - beat.introOffset - heard
  }, [beat])
  const paused = useRef<number | null>(null)
  useEffect(() => () => beatPlayer.stop(), [])
  useEffect(() => {
    paused.current = null
    beatPlayer.stop()
  }, [beat?.id])

  const toggle = () => {
    if (!beat || !playable) return
    audio.unlock()
    if (playing) {
      paused.current = beatPlayer.position(beat.id)
      beatPlayer.pause()
      return
    }
    const from = paused.current !== null && paused.current < end - 0.1 ? paused.current : beat.introOffset
    paused.current = null
    void beatPlayer.play(playable, { from, to: end })
  }
  const restart = () => {
    if (!beat || !playable) return
    audio.unlock()
    paused.current = null
    void beatPlayer.play(playable, { from: beat.introOffset, to: end })
  }

  return (
    <div className="rr-preview" data-testid="ball-preview">
      {beat ? (
        <RhymeBall clock={clock} secondsPerBeat={60 / beat.bpm} beatsPerBar={beat.beatsPerBar} bars={bars} prompts={prompts} difficulty={difficulty} />
      ) : (
        <p className="studio__hint">Pick a beat to try the ball.</p>
      )}
      <div className="rr-preview__bar">
        <Button disabled={!beat} onClick={toggle}>
          {playing ? 'Pause' : paused.current !== null ? 'Resume' : 'Try the ball'}
        </Button>
        {beat && (
          <Button variant="quiet" onClick={restart}>
            Restart
          </Button>
        )}
        <span className="studio__hint">Practice only — nothing records. The ball follows the beat at {beat ? Math.round(beat.bpm) : '—'} BPM.</span>
      </div>
      <p className="prompt-preview__note">
        1 · 2 · 3 are yours — rap anything. The word lands on 4, with the ball. The next row slides up so you can see the rhyme coming. 🎧 Headphones on.
      </p>
    </div>
  )
}

