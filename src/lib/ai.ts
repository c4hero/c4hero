import { createLogger } from '@/lib/logger'
import { isNonEmptyString, isRecord } from '@/lib/guards'

const log = createLogger('ai')
const API_TIMEOUT_MS = 30_000

const ANTHROPIC_API_URL: string = (import.meta.env.VITE_ANTHROPIC_API_URL as string | undefined) ?? 'https://api.anthropic.com/v1/messages'
const OPENAI_API_URL: string = (import.meta.env.VITE_OPENAI_API_URL as string | undefined) ?? 'https://api.openai.com/v1/chat/completions'

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function throwProviderError(provider: 'Anthropic' | 'OpenAI', response: Response): Promise<never> {
  let requestId: string | null = null
  try {
    requestId = response.headers.get('request-id')
      ?? response.headers.get('x-request-id')
      ?? response.headers.get('anthropic-request-id')
  } catch {
    // Header access can fail in unusual CORS/proxy configurations; status is enough.
  }
  log.error(`${provider} API error ${response.status}`, {
    status: response.status,
    requestId: requestId ?? undefined,
  })
  const suffix = requestId ? ` (request ${requestId})` : ''
  throw new Error(`${provider} API error: ${response.status}${suffix}`)
}

export type AIProvider = 'anthropic' | 'openai'

interface AIConfig {
  provider: AIProvider
  apiKey: string
}

/** Get stored AI config from sessionStorage (keys stay in-memory per session) */
export function getAIConfig(): AIConfig | null {
  try {
    const data = sessionStorage.getItem('c4hero_ai_config')
    if (!data) return null
    const parsed = JSON.parse(data)
    if (!isRecord(parsed)) return null
    if (parsed.provider !== 'anthropic' && parsed.provider !== 'openai') return null
    if (!isNonEmptyString(parsed.apiKey)) return null
    return { provider: parsed.provider, apiKey: parsed.apiKey.trim() }
  } catch (err) {
    log.warn('Failed to read AI config from sessionStorage', err)
    return null
  }
}

/** Save AI config to sessionStorage */
export function saveAIConfig(config: AIConfig) {
  try {
    sessionStorage.setItem('c4hero_ai_config', JSON.stringify(config))
  } catch (err) {
    log.warn('Failed to save AI config to sessionStorage', err)
  }
}

/** Clear AI config */
export function clearAIConfig() {
  try {
    sessionStorage.removeItem('c4hero_ai_config')
  } catch (err) {
    log.warn('Failed to clear AI config from sessionStorage', err)
  }
}

/** Generate a description for an element using AI */
export async function generateDescription(
  elementName: string,
  elementType: string,
  technology?: string,
  context?: string,
): Promise<string> {
  const config = getAIConfig()
  if (!config) throw new Error('AI not configured. Please set your API key in settings.')

  const prompt = `You are a software architect. Generate a concise 1-2 sentence description for a C4 architecture model element.

Element type: ${elementType}
Element name: ${elementName}
${technology ? `Technology: ${technology}` : ''}
${context ? `Context: ${context}` : ''}

Respond with ONLY the description text, no quotes or explanation.`

  if (config.provider === 'anthropic') {
    const response = await fetchWithTimeout(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      await throwProviderError('Anthropic', response)
    }
    const data = await response.json()
    return data.content[0]?.text?.trim() ?? ''
  }

  if (config.provider === 'openai') {
    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      await throwProviderError('OpenAI', response)
    }
    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() ?? ''
  }

  throw new Error(`Unknown AI provider: ${config.provider}`)
}

/** Generate a workspace from a natural language description */
export async function generateWorkspaceFromDescription(description: string): Promise<string> {
  const config = getAIConfig()
  if (!config) throw new Error('AI not configured. Please set your API key in settings.')

  const prompt = `You are a software architect. Convert the following natural language description into a valid Structurizr DSL workspace.

Description: ${description}

Requirements:
- Use proper Structurizr DSL syntax
- Include people, software systems, containers where appropriate
- Define relationships between elements
- Include at least a systemLandscape view with "include *" and "autoLayout"
- Include basic styles for Person and Software System elements
- Use meaningful variable names

Respond with ONLY the Structurizr DSL code, no explanation or markdown.`

  if (config.provider === 'anthropic') {
    const response = await fetchWithTimeout(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      await throwProviderError('Anthropic', response)
    }
    const data = await response.json()
    return data.content[0]?.text?.trim() ?? ''
  }

  if (config.provider === 'openai') {
    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      await throwProviderError('OpenAI', response)
    }
    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() ?? ''
  }

  throw new Error(`Unknown AI provider: ${config.provider}`)
}
