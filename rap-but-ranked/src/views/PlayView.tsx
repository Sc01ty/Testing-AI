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
import { ImproveView } from '../components/play/ImproveView'
import { ModeSelect, type PlayMode } from '../components/play/ModeSelect'
import { PageShell } from '../components/layout/PageShell'
import { currentDirector, type DirectorOutput } from '../director'
import { localModel } from '../director/localModel'
import type { RoundResult, SavedBeat, Session } from '../domain/types'
import { advance, barsDone, currentRound, directorContext, gridOf, newSession, roundInputs, scoreSessionRound, totalRounds } from '../play/sessionLogic'
import { ensureLexicon } from '../coach/lexicon'
import { computeProfile, type SkillProfile } from '../coach/profile'
import { buildCoachContext } from '../coach/context'
import { refineRoundResult } from '../coach/llmCoach'
import type { AssistanceRecord } from '../coach/types'
import { takeSamples } from '../play/takeAudio'
import { useSession } from '../play/useSession'
import { settingsStore } from '../settings/settings'
import { deleteSession, getBeat, hasCompletedTrack, latestActiveSession, listSessions, onSavedChange, saveSession } from '../storage'
import '../components/play/play.css'
import './views.css'
import { DuoView } from '../multiplayer/DuoView'

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

/** PLAY's own sub-screens: choose (PLAY / IMPROVE), set up a track, or improve. */
const MODE_KEY = 'rbr.playMode'
type Screen = 'select' | PlayMode
const readMode = (): Screen => {
  try {
    const m = sessionStorage.getItem(MODE_KEY)
    return m === 'play' || m === 'improve' ? m : 'select'
  } catch {
    return 'select'
  }
}

interface JudgingState {
  roundIndex: number
  result: RoundResult
  /** The local model is still refining the rules' analysis — hold the reveal. */
  refining: boolean
  directorSource: 'local-ai' | 'basic'
  director: DirectorOutput | null
}

function SingleplayerView() {
  const [sessionId, setSessionId] = useState<string | null>(readOpen)
  const { session, missing, update } = useSession(sessionId)
  const [beat, setBeat] = useState<SavedBeat | null>(null)
  const [beatMissing, setBeatMissing] = useState(false)
  const [resume, setResume] = useState<Session | null>(null)
  const [judging, setJudging] = useState<JudgingState | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const judgingRun = useRef(0)
  const [screen, setScreenState] = useState<Screen>(readMode)
  const [improveUnlocked, setImproveUnlocked] = useState<boolean | null>(null)
  const setScreen = (m: Screen) => {
    try {
      sessionStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
    setScreenState(m)
  }

  // the pronunciation dictionary (rhyme by sound) + the player's rolling skill profile
  const [profile, setProfile] = useState<SkillProfile | null>(null)
  useEffect(() => {
    void ensureLexicon()
    const load = () => void listSessions().then((all) => setProfile(computeProfile(all)))
    load()
    return onSavedChange(load)
  }, [])

  useEffect(() => {
    const check = () => void hasCompletedTrack().then(setImproveUnlocked)
    check()
    return onSavedChange(check)
  }, [])

  // Esc inside Play setup / Improve goes back to PLAY / IMPROVE, not all the way to the menu
  useEffect(() => {
    if (sessionId || screen === 'select') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      audio.play('back')
      setScreen('select')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [sessionId, screen])

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
    if (!id && screen === 'select') setScreen('play')
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
    await ensureLexicon()
    // 1) the rules score straight away (sync)…
    const rules = scoreSessionRound(session, round.index, samples, beat, '')
    const refining = director.source === 'local-ai'
    setJudging({ roundIndex: round.index, result: rules, refining, directorSource: director.source, director: null })
    audio.play('transition')
    // 2) …the local model (if running) refines the language judgements, labelled as such…
    const inputs = roundInputs(session, round.index, samples, beat)
    const context = buildCoachContext({
      topic: session.startingTopic,
      bpm: gridOf(session, beat)?.bpm,
      barsTotal: session.length,
      barsDone: barsDone(session),
      storyDirection: session.storyDirection,
      previous: inputs.ctx.previous.map((p) => p.lyrics),
      challenge: round.challenge,
      bars: round.lyrics,
      lastFocus: session.rounds[round.index - 1]?.result?.coach?.focus?.note ?? null,
      profile,
      assistance: round.assistance,
    })
    const result = refining ? await refineRoundResult(rules, { ...inputs, context }).catch(() => rules) : rules
    if (run !== judgingRun.current) return
    if (refining) setJudging((j) => (j && j.roundIndex === round.index ? { ...j, result, refining: false } : j))
    // 3) …then the director decides where the song goes and what to train next
    const dctx = directorContext(session, round.index, { profile, secondsPerBar: inputs.secondsPerBar }, result.coach)
    const out = await director.afterRound(dctx).catch(async () => {
      const { basicDirector } = await import('../director/basicDirector')
      return basicDirector.afterRound(dctx)
    })
    if (run !== judgingRun.current) return
    // label honestly: if the AI fell back for the challenge, the source says so
    setJudging((j) => (j && j.roundIndex === round.index ? { ...j, director: out, directorSource: out.next?.source ?? j.directorSource } : j))
  }, [session, beat, profile])

  /** Help used on the current round is kept with it (context for the coach, never a penalty). */
  const recordAssist = useCallback(
    (a: AssistanceRecord) => {
      const r = session && currentRound(session)
      if (!r) return
      update((s) => ({ ...s, rounds: s.rounds.map((x) => (x.index === r.index ? { ...x, assistance: [...(x.assistance ?? []), a] } : x)) }))
    },
    [session, update],
  )

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
  const backToModes = (
    <button className="btn btn--quiet modes__back" onClick={() => (audio.play('back'), setScreen('select'))}>
      <span>← Play / Improve</span>
    </button>
  )
  if ((!sessionId || !session) && screen === 'select') {
    return (
      <PageShell id="play">
        <ModeSelect improveUnlocked={improveUnlocked} hasActive={!!resume} onPick={(m) => setScreen(m)} />
      </PageShell>
    )
  }
  if ((!sessionId || !session) && screen === 'improve') {
    return (
      <PageShell id="play" compact side={<span className="mode-crumb">/ Improve</span>}>
        {backToModes}
        <ImproveView onPlay={() => setScreen('play')} />
      </PageShell>
    )
  }
  if (!sessionId || !session) {
    return (
      <PageShell id="play">
        {backToModes}
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
  const helpInput = () => {
    const r = currentRound(session) ?? session.rounds[session.rounds.length - 1]
    const previous = session.rounds.slice(0, r.index).map((x) => x.lyrics)
    const secondsPerBar = (60 / beat.bpm) * beat.beatsPerBar
    return {
      challenge: r.challenge,
      topic: session.startingTopic,
      previous,
      draft: r.lyrics,
      secondsPerBar,
      context: buildCoachContext({
        topic: session.startingTopic,
        bpm: beat.bpm,
        barsTotal: session.length,
        barsDone: barsDone(session),
        storyDirection: session.storyDirection,
        previous,
        challenge: r.challenge,
        bars: r.lyrics,
        lastFocus: session.rounds[r.index - 1]?.result?.coach?.focus?.note ?? null,
        profile,
        assistance: r.assistance,
      }),
    }
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
            holding={judging.refining}
          />
        ) : (
          <>
            <RoundStudio key={round.index} session={session} round={round} beat={beat} update={update} onSubmit={() => void submit()} onHelp={() => setHelpOpen(true)} />
            {submitError && <p className="studio__hint" role="alert">{submitError}</p>}
          </>
        )}
      </div>
      <HelpPanel key={round?.index ?? 'done'} open={helpOpen && !!round && !judging} onClose={() => setHelpOpen(false)} input={helpInput} onAssist={recordAssist} />
    </PageShell>
  )
}

let playResumeConsumed = false
const resumePlayOnLoad = typeof location !== 'undefined' && location.hash.replace(/^#\/?/,'').split('/')[0]==='play'
export function PlayView() {
  const [mode,setModeState]=useState<'single'|'multi'|null>(()=>{
    const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined
    if(navigation?.type!=='reload' || !resumePlayOnLoad || playResumeConsumed)return null
    try{const saved=sessionStorage.getItem('rbr.outerMode');return saved==='single'||saved==='multi'?saved:null}catch{return null}
  })
  useEffect(()=>{playResumeConsumed=true},[])
  const setMode=(next:'single'|'multi'|null)=>{try{if(next)sessionStorage.setItem('rbr.outerMode',next);else sessionStorage.removeItem('rbr.outerMode')}catch{/* local storage unavailable */}setModeState(next)}
  const [active,setActive]=useState(0)
  useEffect(()=>{
    if(mode)return
    const key=(e:KeyboardEvent)=>{if(['ArrowDown','ArrowUp','w','s'].includes(e.key)){e.preventDefault();setActive(a=>1-a);audio.play('move')}else if(e.key==='Enter' && !(document.activeElement instanceof HTMLButtonElement)){e.preventDefault();audio.play('confirm');setMode(active===0?'single':'multi')}}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[mode,active])
  if(mode==='single') return <><button className="btn btn--quiet modes__back" onClick={()=>setMode(null)}><span>← Singleplayer / Multiplayer</span></button><SingleplayerView/></>
  if(mode==='multi') return <PageShell id="play" compact><DuoView onLeave={()=>setMode(null)}/></PageShell>
  return <PageShell id="play"><div className="modes"><ul className="modes__list">{(['single','multi'] as const).map((m,i)=><li key={m} className="enter" style={{'--i':i+2} as React.CSSProperties}><button className="menu__item modes__item" data-active={active===i?'':undefined} onFocus={()=>setActive(i)} onPointerEnter={()=>{if(active!==i){setActive(i);audio.play('hover')}}} onClick={()=>{audio.unlock();audio.play('confirm');setMode(m)}}><span className="menu__index">0{i+1}</span><span className="menu__label">{m==='single'?'SINGLEPLAYER':'MULTIPLAYER'}</span><span className="menu__tagline">{m==='single'?'Your bars. Your track. Your rank.':'Two players. One beat. Trade the story.'}</span></button></li>)}</ul></div></PageShell>
}
