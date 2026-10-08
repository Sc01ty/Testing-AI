import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '../domain/types'
import { getSession, saveSession } from '../storage/sessionStore'

/**
 * Load a session and keep it saved. Every change is written to IndexedDB
 * (lyrics typing is debounced), so a refresh never loses work.
 */
export function useSession(id: string | null) {
  const [session, setSession] = useState<Session | null>(null)
  const [missing, setMissing] = useState(false)
  const pending = useRef<Session | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    let alive = true
    setSession(null)
    setMissing(false)
    if (!id) return
    void getSession(id).then((s) => {
      if (!alive) return
      if (s) setSession(s)
      else setMissing(true)
    })
    return () => {
      alive = false
    }
  }, [id])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const s = pending.current
    pending.current = null
    if (s) void saveSession(s)
  }, [])

  // save on leave / tab close
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  /** Apply a change. `debounce` for keystrokes; otherwise it's saved immediately. */
  const update = useCallback(
    (fn: (s: Session) => Session, opts: { debounce?: boolean } = {}) => {
      setSession((prev) => {
        if (!prev) return prev
        const next = fn(prev)
        pending.current = next
        clearTimeout(timer.current)
        if (opts.debounce) timer.current = window.setTimeout(flush, 500)
        else queueMicrotask(flush)
        return next
      })
    },
    [flush],
  )

  return { session, missing, update }
}
