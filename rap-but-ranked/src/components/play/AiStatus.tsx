import type { CSSProperties } from 'react'
import { audio } from '../../audio/AudioEngine'
import { MODEL_NAME, MODEL_SIZE_MB, localModel, useLocalModel } from '../../director/localModel'
import { useSettings } from '../../settings/useSettings'

/** What's directing your song: the in-browser Rap AI, or the rule-based basic director. Honest about which. */
export function AiStatus({ compact = false }: { compact?: boolean }) {
  const m = useLocalModel()
  const [s, set] = useSettings()
  const basic = s.aiMode === 'basic'

  const useBasic = (
    <button className="ai-link" onClick={() => (audio.play('toggle'), set({ aiMode: 'basic' }))}>
      Use basic director instead
    </button>
  )

  let body: React.ReactNode
  if (basic) {
    body = (
      <>
        <p className="ai__line">
          <b>Basic director.</b> Rule-based: it reads your bars for people, themes and details and picks the next challenge from templates. Not an AI.
        </p>
        {m.status !== 'unsupported' && (
          <button className="ai-link" onClick={() => (audio.play('toggle'), set({ aiMode: 'local' }))}>
            Switch to Rap AI
          </button>
        )}
      </>
    )
  } else if (m.status === 'checking') {
    body = <p className="ai__line">Checking what your browser can run…</p>
  } else if (m.status === 'unsupported') {
    body = (
      <p className="ai__line">
        <b>Rap AI can't run here.</b> {m.detail} Using the basic, rule-based director instead.
      </p>
    )
  } else if (m.status === 'not-downloaded') {
    body = (
      <>
        <p className="ai__line">
          <b>Rap AI runs entirely on your computer</b> — no API key, nothing sent anywhere. It's a small language model ({MODEL_NAME}): a one-time {MODEL_SIZE_MB} MB download, then cached.
        </p>
        <div className="ai__actions">
          <button className="btn btn--ghost" onClick={() => (audio.play('confirm'), void localModel.load())}>
            <span>Download Rap AI</span>
          </button>
          {useBasic}
        </div>
      </>
    )
  } else if (m.status === 'cached') {
    body = (
      <div className="ai__actions">
        <p className="ai__line">
          <b>Rap AI is downloaded.</b>
        </p>
        <button className="btn btn--ghost" onClick={() => void localModel.load()}>
          <span>Load it</span>
        </button>
      </div>
    )
  } else if (m.status === 'downloading' || m.status === 'loading') {
    body = (
      <div className="ai__loading">
        <div className="ai__loading-head">
          <span className="ai__title">Loading Rap AI</span>
          <span className="ai__pct">{Math.round(m.progress * 100)}%</span>
        </div>
        <div className="ai__bar" style={{ '--p': m.progress } as CSSProperties}>
          <i />
        </div>
        <span className="ai__detail">{m.status === 'downloading' ? `First time only — downloading ~${MODEL_SIZE_MB} MB. ` : ''}{m.detail}</span>
        {!compact && <span className="ai__detail">You can start now — the basic director covers until it's ready.</span>}
      </div>
    )
  } else if (m.status === 'ready') {
    body = (
      <p className="ai__line">
        <b className="ai__ready">Rap AI ready</b> — running on your GPU. It reads your bars and decides where the song goes next.
      </p>
    )
  } else {
    body = (
      <>
        <p className="ai__line">
          <b>Rap AI failed to load.</b> {m.error}
        </p>
        <div className="ai__actions">
          <button className="btn btn--ghost" onClick={() => void localModel.load()}>
            <span>Try again</span>
          </button>
          {useBasic}
        </div>
      </>
    )
  }

  return (
    <div className="ai" data-status={basic ? 'basic' : m.status} data-compact={compact ? '' : undefined}>
      <span className="ai__dot" aria-hidden />
      <div className="ai__body">{body}</div>
    </div>
  )
}
