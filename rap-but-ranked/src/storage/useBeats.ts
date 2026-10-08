import { useEffect, useState } from 'react'
import type { BeatMeta } from '../domain/types'
import { listBeats, subscribeBeats } from './beatLibrary'

/** Live list of saved beats (metadata only). `null` while loading. */
export function useBeats() {
  const [beats, setBeats] = useState<BeatMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      listBeats()
        .then((b) => alive && (setBeats(b), setError(null)))
        .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Could not open your beat library.'))
    void load()
    const off = subscribeBeats(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [])
  return { beats, error }
}
