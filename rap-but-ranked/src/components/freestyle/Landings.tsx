import type { FreestyleSession } from '../../domain/types'

/** Each target: landed (with how far off beat 4), a different rhyme, or missed. */
export function Landings({ f }: { f: FreestyleSession }) {
  const r = f.result!
  return (
    <div className="rr-landings">
      {r.landed && (
        <p className="rr-summary">
          <b>
            <span>LANDED</span>
            {r.landed.hits} / {r.landed.total}
          </b>
          {r.landed.grade && (
            <b>
              <span>TIMING</span>
              {r.landed.grade}
            </b>
          )}
          <b>
            <span>RHYME RUN</span>
            {r.score}
          </b>
        </p>
      )}
      <div className="rr-results fs-prompts">
        {r.prompts.map((p) => (
          <span key={`${p.bar}-${p.word}`} className="fs-chip" data-hit={r.transcribed ? (p.hit ? 'yes' : 'no') : undefined} title={p.evidence.join(' … ')}>
            <small>bar {p.bar + 1}</small>
            {p.word.toUpperCase()} {r.transcribed && <b>{p.hit ? '✓' : '✕'}</b>}
            <small>
              {!r.transcribed
                ? 'Not checked'
                : p.hit
                  ? `landed ${p.offsetMs! >= 0 ? '+' : '−'}${Math.abs(p.offsetMs!)}ms`
                  : p.near
                    ? `said “${p.near}” instead`
                    : 'target not detected'}
            </small>
          </span>
        ))}
      </div>
    </div>
  )
}
