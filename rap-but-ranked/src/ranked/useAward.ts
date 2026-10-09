import { useState } from 'react'
import type { RpEvent } from './ladder'
import { rankedProfile, type AwardRecord } from './profile'

/**
 * The RP for a finished piece. `award` = it was just finished here, so pay
 * out (once — the profile ignores repeats); otherwise just look up what it
 * earned. `animate` is true while the award is fresh, so a reload a minute
 * later shows the result rather than replaying it.
 */
export function useAward(event: RpEvent | null, award: boolean): { record: AwardRecord | null; animate: boolean } {
  const [state] = useState(() => {
    if (!event) return { record: null, animate: false }
    const record = award ? rankedProfile.award(event) : rankedProfile.awardFor(event.id)
    return { record, animate: !!record && award && Date.now() - record.at < 20_000 }
  })
  return state
}
