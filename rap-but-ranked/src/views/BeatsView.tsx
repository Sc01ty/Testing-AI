import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { audio } from '../audio/AudioEngine'
import { PageShell } from '../components/layout/PageShell'
import { Panel } from '../components/ui/ui'
import './views.css'

/**
 * Stage 1 placeholder. The drop zone is real enough to catch a dropped file
 * (so the browser doesn't navigate away) but upload/analysis is Stage 2.
 */
export function BeatsView() {
  const [drag, setDrag] = useState(false)
  const [rejected, setRejected] = useState(0)
  const depth = useRef(0)

  // A file dropped anywhere else on this screen shouldn't make the browser open it.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setDrag(false)
    setRejected((n) => n + 1)
    audio.play('error')
  }

  return (
    <PageShell id="beats">
      <div className="beats">
        <div
          className="dropzone enter"
          style={{ '--i': 3 } as CSSProperties}
          data-drag={drag ? '' : undefined}
          data-rejected={rejected ? '' : undefined}
          key={rejected}
          onDragEnter={(e) => {
            e.preventDefault()
            depth.current++
            if (!drag) {
              setDrag(true)
              audio.play('hover')
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1)
            if (depth.current === 0) setDrag(false)
          }}
          onDrop={onDrop}
        >
          <div className="dropzone__wave" aria-hidden>
            {Array.from({ length: 32 }, (_, i) => (
              <span key={i} style={{ '--d': `${i * -0.09}s` } as CSSProperties} />
            ))}
          </div>
          <h2 className="dropzone__title">{rejected ? 'Not yet.' : 'Drop a beat'}</h2>
          <p className="dropzone__sub">
            {rejected ? 'Nice try — uploading arrives with the beat library in Stage 2.' : 'MP3 or WAV · BPM, length and waveform get analysed on upload'}
          </p>
          <div className="dropzone__chips">
            <span>MP3</span>
            <span>WAV</span>
          </div>
        </div>

        <Panel title="Library" aside={<span className="eyebrow">0 beats</span>} i={4}>
          <div className="beat-table">
            <div className="beat-table__head eyebrow">
              <span>Name</span>
              <span>BPM</span>
              <span>Length</span>
              <span>Wave</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="beat-row beat-row--ghost" style={{ '--r': i } as CSSProperties}>
                <span className="ghost ghost--name" />
                <span className="ghost ghost--sm" />
                <span className="ghost ghost--sm" />
                <span className="ghost ghost--wave" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
