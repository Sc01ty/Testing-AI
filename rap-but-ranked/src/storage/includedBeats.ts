import type { BeatMeta } from '../domain/types'
export type IncludedBeat = BeatMeta & { url: string }
let catalogue: Promise<IncludedBeat[]> | null = null
export function includedBeats(): Promise<IncludedBeat[]> {
  if (!catalogue)
    catalogue = fetch(`${import.meta.env.BASE_URL}beats/catalogue.json`)
      .then(async (r) => (r.ok ? ((await r.json()) as IncludedBeat[]) : []))
      .catch(() => [])
  return catalogue
}
export async function includedAudio(id: string): Promise<Blob | null> {
  const beat = (await includedBeats()).find((b) => b.id === id)
  if (!beat) return null
  const response = await fetch(`${import.meta.env.BASE_URL}${beat.url}`)
  if (!response.ok)
    throw new Error('Could not load the included beat. Check your connection and retry.')
  return response.blob()
}
