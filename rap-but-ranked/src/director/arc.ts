/**
 * Where a round sits in the song's arc. Both directors use this so even
 * the tiny model gets a strong steer about what *kind* of challenge fits.
 */
export type ArcStage = 'open' | 'deepen' | 'people' | 'obstacle' | 'turn' | 'return'

export function stageFor(nextIndex: number, totalRounds: number): ArcStage {
  if (nextIndex <= 0) return 'open'
  if (nextIndex >= totalRounds - 1) return 'return'
  const p = nextIndex / (totalRounds - 1)
  if (totalRounds <= 4) return (['open', 'deepen', 'obstacle', 'return'] as ArcStage[])[nextIndex]
  if (p < 0.3) return 'deepen'
  if (p < 0.5) return 'people'
  if (p < 0.75) return 'obstacle'
  return 'turn'
}

export const STAGE_GUIDE: Record<ArcStage, string> = {
  open: 'set the scene for the topic',
  deepen: 'go deeper into something specific they just mentioned',
  people: 'bring in the people involved — who is this for, who is watching',
  obstacle: 'introduce something that could stop them, a cost, a doubt or an enemy',
  turn: 'the turning point — what changes, what they learned',
  return: 'bring the song back to where it started, showing how far it has come',
}

export const STAGE_LABEL: Record<ArcStage, string> = {
  open: 'the setup',
  deepen: 'going deeper',
  people: 'the people',
  obstacle: 'the obstacle',
  turn: 'the turning point',
  return: 'back to the start',
}
