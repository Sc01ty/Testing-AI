import type { AIService } from './AIService'

/**
 * Stage 1: no AI is wired up. Stage 3 registers a mock, Stage 4 an HTTP
 * client pointed at a server route. Swapping providers = swapping this.
 */
let service: AIService | null = null

export function registerAIService(impl: AIService) {
  service = impl
}

export function getAIService(): AIService {
  if (!service) throw new Error('AI service not available yet (arrives in Stage 3/4).')
  return service
}

export type { AIService } from './AIService'
