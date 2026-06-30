import type { AiProvider, AiProviderConfig } from '../types'
import type { AiProviderId } from '../providerMeta'
import { createAnthropicProvider } from './anthropic'
import { createOpenAiProvider } from './openai'
import { createGeminiProvider } from './gemini'

// The one place that maps a provider id to its implementation. To add a provider:
// 1. add an entry to AI_PROVIDER_META (../providerMeta.ts),
// 2. add an impl file in this folder,
// 3. add a case here.
export function createProvider(id: AiProviderId, config: AiProviderConfig): AiProvider {
  switch (id) {
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'openai':
      return createOpenAiProvider(config)
    case 'gemini':
      return createGeminiProvider(config)
    default: {
      // Exhaustiveness guard — a new AiProviderId must be handled above.
      const _exhaustive: never = id
      throw new Error(`Unknown AI provider: ${String(_exhaustive)}`)
    }
  }
}

export { createAnthropicProvider, createOpenAiProvider, createGeminiProvider }
