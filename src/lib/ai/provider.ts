import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest } from './types'
import { AiError } from './types'

// BYOK provider: calls the Anthropic Messages REST API directly from the browser
// with the user's own key. We deliberately avoid the official SDK — it bundles
// Node-oriented transitive dependencies (undici, etc.) that bloat a local-first
// browser app and add attack surface. A small fetch wrapper is all the browser
// path needs.
//
// Direct browser calls require the `anthropic-dangerous-direct-browser-access`
// header. The key lives only in this browser and is sent only to Anthropic. This
// is the standard, documented BYOK tradeoff for a no-backend tool.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

interface AnthropicTextBlock {
  type: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[]
  stop_reason?: string
}

function mapError(status: number, message: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', message)
  if (status === 429) return new AiError('rate-limit', message)
  if (status >= 500) return new AiError('network', message)
  return new AiError('unknown', message)
}

async function postMessage(
  config: AiProviderConfig,
  body: Record<string, unknown>,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: config.model, ...body }),
    })
  } catch {
    throw new AiError('network', "Couldn't reach Anthropic.")
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const errBody = (await res.json()) as { error?: { message?: string } }
      if (errBody?.error?.message) detail = errBody.error.message
    } catch {
      // non-JSON error body — keep the generic detail
    }
    throw mapError(res.status, detail)
  }

  let data: AnthropicResponse
  try {
    data = (await res.json()) as AnthropicResponse
  } catch {
    throw new AiError('invalid-response', 'Malformed response from Anthropic.')
  }

  if (data.stop_reason === 'refusal') {
    throw new AiError('invalid-response', 'The model declined this request.')
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')

  if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
  return text
}

export function createAnthropicProvider(config: AiProviderConfig): AiProvider {
  return {
    async complete(req: AiTextRequest): Promise<string> {
      return postMessage(config, {
        max_tokens: req.maxTokens ?? 8000,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      const text = await postMessage(config, {
        max_tokens: req.maxTokens ?? 4000,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      })
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new AiError('invalid-response', 'The model did not return valid JSON.')
      }
      if (!req.validate(parsed)) {
        throw new AiError('invalid-response', 'The model response did not match the expected shape.')
      }
      return parsed
    },
  }
}
