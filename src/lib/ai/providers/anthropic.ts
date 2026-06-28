import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest } from '../types'
import { AiError } from '../types'
import { postJson, parseAndValidate } from './http'

// Anthropic Messages API, called directly from the browser with the user's key.
// Direct browser calls require the `anthropic-dangerous-direct-browser-access`
// header. Native structured outputs (`output_config.format`) are used for JSON.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; stop_reason?: string }

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
  const data = (await postJson({
    url: API_URL,
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: { model: config.model, ...body },
    host: 'api.anthropic.com',
    label: `Anthropic (${config.model})`,
  })) as AnthropicResponse

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
      // Note: `temperature` is deprecated on current Claude models (Opus 4.6+),
      // so it's intentionally not sent. Consistency comes from the deterministic
      // repo snapshot and the prompt instead.
      const text = await call(config, {
        max_tokens: req.maxTokens ?? 4000,
        system: req.system,
        messages: [...(req.history ?? []), { role: 'user', content: req.user }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      })
      return parseAndValidate(text, req.validate, `Anthropic (${config.model})`)
    },
  }
}
