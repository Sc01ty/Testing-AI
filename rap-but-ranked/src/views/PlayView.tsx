import { useCallback, useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { beatPlayer } from '../audio/BeatPlayer'
import { trackPlayer } from '../audio/trackPlayer'
import { HelpPanel } from '../components/play/HelpPanel'
import { Judging } from '../components/play/Judging'
import { PlaySetup, type SetupValues } from '../components/play/PlaySetup'
import { RoundStudio } from '../components/play/RoundStudio'
import { TrackComplete } from '../components/play/TrackComplete'
import { AiStatus } from '../components/play/AiStatus'
import { PageShell } from '../components/layout/PageShell'
import { currentDirector, type DirectorOutput } from '../director'
import { localModel } from '../director/localModel'
import type { RoundResult, SavedBeat, Session } from '../domain/types'
import { advance, currentRound, directorContext, newSession, scoreSessionRound, totalRounds } from '../play/sessionLogic'
import { takeSamples } from '../play/takeAudio'
import { useSession } from '../play/useSession'
import { settingsStore } from '../settings/settings'
import { deleteSession, getBeat, latestActiveSession, saveSession } from '../storage'
import '../components/play/play.css'
import './views.css'

/** Remember which session was open, so a refresh drops you straight back in. */
const OPEN_KEY = 'rbr.openSession'
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

interface JudgingState {
  roundIndex: number
  result: RoundResult
  directorSource: 'local-ai' | 'basic'
  director: DirectorOutput | null
}

export function PlayView() {
  const [sessionId, setSessionId] = useState<string | null>(readOpen)
  const { session, missing, update } = useSession(sessionId)
  const [beat, setBeat] = useState<SavedBeat | null>(null)
  const [beatMissing, setBeatMissing] = useState(false)
  const [resume, setResume] = useState<Session | null>(null)
  const [judging, setJudging] = useState<JudgingState | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const judgingRun = useRef(0)

  // the in-browser model: find out what's possible, and load it from disk if it's already downloaded
  useEffect(() => {
    void localModel.detect().then(() => {
      if (settingsStore.get().aiMode === 'local' && localModel.getState().status === 'cached') void localModel.load()
    })
  }, [])

  useEffect(() => {
    if (!sessionId) void latestActiveSession().then(setResume)
  }, [sessionId])

  useEffect(() => {
    if (missing) open(null)
  }, [missing])

  useEffect(() => {
    setBeat(null)
    setBeatMissing(false)
    if (!session) return
    void getBeat(session.beatId).then((b) => (b ? setBeat(b) : setBeatMissing(true)))
  }, [session?.beatId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      beatPlayer.stop()
      trackPlayer.stop()
    },
    [],
  )

  const open = (id: string | null) => {
    writeOpen(id)
    setJudging(null)
    setHelpOpen(false)
    setSessionId(id)
  }

  const start = async (v: SetupValues) => {
    const b = await getBeat(v.beatId)
    if (!b) return
    const s = newSession({ trackName: v.trackName, beat: b, topic: v.topic, length: v.length })
    await saveSession(s)
    audio.play('enter')
    open(s.id)
  }

  const submit = useCallback(async () => {
    if (!session || !beat) return
    const round = currentRound(session)
    if (!round?.take) return
    setSubmitError(null)
    const samples = await takeSamples(round.take.id)
    if (!samples) {
      setSubmitError("Couldn't load your take — record it again.")
      return
    }
    const run = ++judgingRun.current
    const director = currentDirector()
    // scores are computed straight away; the director thinks while the reveal plays
    const result = scoreSessionRound(session, round.index, samples, beat, '')
    setJudging({ roundIndex: round.index, result, directorSource: director.source, director: null })
    audio.play('transition')
    const withLyrics = { ...session }
    const out = await director.afterRound(directorContext(withLyrics, round.index)).catch(async () => {
      const { basicDirector } = await import('../director/basicDirector')
      return basicDirector.afterRound(directorContext(withLyrics, round.index))
    })
    if (run !== judgingRun.current) return
    // label honestly: if the AI fell back for the challenge, the source says so
    setJudging((j) => (j && j.roundIndex === round.index ? { ...j, director: out, directorSource: out.next?.source ?? j.directorSource } : j))
  }, [session, beat])

  const continueAfterJudging = useCallback(() => {
    if (!judging?.director) return
    const result = { ...judging.result, analysis: judging.director.analysis }
    update((s) => advance(s, judging.roundIndex, result, judging.director!))
    setJudging(null)
    audio.play('confirm')
  }, [judging, update])

  const tryAgain = async () => {
    if (!session || !beat) return
    const s = newSession({ trackName: session.trackName, beat, topic: session.startingTopic, length: session.length })
    await saveSession(s)
    open(s.id)
  }

  // ── render ─────────────────────────────────────────────────────────
  if (!sessionId || !session) {
    return (
      <PageShell id="play">
        <PlaySetup
          resume={resume}
          onStart={(v) => void start(v)}
          onResume={(s) => {
            audio.play('confirm')
            open(s.id)
          }}
          onDiscard={(s) => {
            void deleteSession(s.id).then(() => setResume(null))
          }}
        />
      </PageShell>
    )
  }

  if (beatMissing) {
    return (
      <PageShell id="play" compact>
        <div className="empty">
          <h2 className="empty__title">Beat missing</h2>
          <p className="empty__sub">The beat for “{session.trackName}” was deleted, so this track can't continue.</p>
          <button className="btn btn--primary" onClick={() => void deleteSession(session.id).then(() => open(null))}>
            <span>Discard track</span>
          </button>
        </div>
      </PageShell>
    )
  }

  if (!beat) return <PageShell id="play" compact>{null}</PageShell>

  const round = currentRound(session)
  const helpContext = () => {
    const r = currentRound(session) ?? session.rounds[session.rounds.length - 1]
    return { ...directorContext(session, r.index - 1), current: r.challenge, draft: r.lyrics }
  }

  return (
    <PageShell id="play" compact>
      <div className="play-session">
        <div className="play-session__bar">
          <span className="play-session__title">
            <b>{session.trackName}</b> · {session.beatName} · {session.startingTopic}
          </span>
          <AiStatus compact />
          <button className="btn btn--quiet" onClick={() => (audio.play('back'), trackPlayer.stop(), beatPlayer.stop(), open(null))}>
            <span>Leave track</span>
          </button>
        </div>

        {session.status === 'complete' || !round ? (
          <TrackComplete session={session} beat={beat} onTryAgain={() => void tryAgain()} onNew={() => open(null)} />
        ) : judging ? (
          <Judging
            key={judging.roundIndex}
            roundNumber={judging.roundIndex + 1}
            totalRounds={totalRounds(session)}
            result={judging.result}
            directorSource={judging.directorSource}
            director={judging.director}
            isLast={judging.roundIndex + 1 >= totalRounds(session)}
            onContinue={continueAfterJudging}
          />
        ) : (
          <>
            <RoundStudio key={round.index} session={session} round={round} beat={beat} update={update} onSubmit={() => void submit()} onHelp={() => setHelpOpen(true)} />
            {submitError && <p className="studio__hint" role="alert">{submitError}</p>}
          </>
        )}
      </div>
      <HelpPanel open={helpOpen && !!round && !judging} onClose={() => setHelpOpen(false)} context={helpContext} />
    </PageShell>
  )
}
