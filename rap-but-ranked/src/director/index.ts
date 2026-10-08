import { settingsStore } from '../settings/settings'
import { basicDirector } from './basicDirector'
import { llmDirector } from './llmDirector'
import { localModel } from './localModel'
import type { Director } from './types'

/** The director in charge right now: the local model when it's loaded and enabled, otherwise the rule-based one. */
export function currentDirector(): Director {
  return settingsStore.get().aiMode === 'local' && localModel.ready ? llmDirector : basicDirector
}

export { firstChallenge } from './basicDirector'
export type { Director, DirectorContext, DirectorOutput, HelpKind, HelpContext } from './types'
