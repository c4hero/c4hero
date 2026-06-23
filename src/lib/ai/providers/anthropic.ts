import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest } from '../types'
import { AiError } from '../types'
import { mapHttpError, readErrorMessage, parseJsonOrThrow } from './http'

// Anthropic Messages API, called directly from the browser with the user's key.
// Direct browser calls require the `anthropic-dangerous-direct-browser-access`
// header. Native structured outputs (`output_config.format`) are used for JSON.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; stop_reason?: string }

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
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
    throw mapHttpError(res.status, await readErrorMessage(res, `Request failed (${res.status})`))
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
      return call(config, {
        max_tokens: req.maxTokens ?? 8000,
        system: req.system,
        messages: [...(req.history ?? []), { role: 'user', content: req.user }],
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      const text = await call(config, {
        max_tokens: req.maxTokens ?? 4000,
        system: req.system,
        messages: [...(req.history ?? []), { role: 'user', content: req.user }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      })
      const parsed = parseJsonOrThrow(text)
      if (!req.validate(parsed)) {
        throw new AiError('invalid-response', 'The model response did not match the expected shape.')
      }
      return parsed
    },
  }
}
