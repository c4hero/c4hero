import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiStreamRequest } from '../types'
import { AiError } from '../types'
import { isRecord } from '@/lib/guards'
import { postJson, postStream, parseAndValidate, type UsageDelta } from './http'

// Anthropic Messages API, called directly from the browser with the user's key.
// Direct browser calls require the `anthropic-dangerous-direct-browser-access`
// header. Native structured outputs (`output_config.format`) are used for JSON.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; stop_reason?: string }

/** The `system` request field: a plain string, or — when `cache` is set — a
 *  single text block flagged `cache_control: ephemeral` so Anthropic caches the
 *  (large, reused) system prefix. Multi-turn features re-send the same system
 *  every turn, so caching it is a cheap win after the first turn. The ephemeral
 *  cache is a no-op below the model's minimum cacheable prefix, so flagging a
 *  short system does no harm. */
function systemParam(system: string, cache?: boolean): unknown {
  if (!cache) return system
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
}

// Map one Anthropic SSE event (its `data:` JSON) to a text delta. The Messages
// stream interleaves `content_block_delta` (text/thinking), `message_delta`
// (carries the final stop_reason), and `error` frames; we surface only the
// visible `text_delta` and turn refusals / error events into AiErrors.
function parseAnthropicEvent(data: unknown): string {
  if (!isRecord(data)) return ''
  if (data.type === 'error') {
    const err = isRecord(data.error) ? data.error : {}
    const type = typeof err.type === 'string' ? err.type : ''
    const message = typeof err.message === 'string' ? err.message : 'The AI provider reported a streaming error.'
    if (type === 'overloaded_error' || type === 'api_error') throw new AiError('network', message)
    if (type === 'rate_limit_error') throw new AiError('rate-limit', message)
    throw new AiError('unknown', message)
  }
  if (data.type === 'content_block_delta') {
    const delta = data.delta
    if (isRecord(delta) && delta.type === 'text_delta' && typeof delta.text === 'string') return delta.text
  }
  if (data.type === 'message_delta') {
    const delta = data.delta
    if (isRecord(delta) && delta.stop_reason === 'refusal') {
      throw new AiError('invalid-response', 'The model declined this request.')
    }
  }
  return ''
}

function num(v: unknown): number { return typeof v === 'number' ? v : 0 }

/** Sum an Anthropic `usage` block into input/output totals. Cached-prefix tokens
 *  (read + creation) are reported separately from `input_tokens`; count them as
 *  input so the session total reflects the full prompt size. */
function anthropicUsage(u: unknown): UsageDelta | null {
  if (!isRecord(u)) return null
  const input = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens)
  const output = num(u.output_tokens)
  return input || output ? { input: input || undefined, output: output || undefined } : null
}

// Non-streaming responses carry usage at the top level; streaming splits it
// across `message_start` (input) and `message_delta` (final output).
function parseAnthropicJsonUsage(data: unknown): UsageDelta | null {
  return isRecord(data) ? anthropicUsage(data.usage) : null
}
function parseAnthropicStreamUsage(data: unknown): UsageDelta | null {
  if (!isRecord(data)) return null
  if (data.type === 'message_start' && isRecord(data.message)) return anthropicUsage(data.message.usage)
  if (data.type === 'message_delta') return anthropicUsage(data.usage)
  return null
}

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
    parseUsage: parseAnthropicJsonUsage,
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
        system: systemParam(req.system, req.cacheSystem),
        messages: [...(req.history ?? []), { role: 'user', content: req.user }],
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      // Note: `temperature` is deprecated on current Claude models (Opus 4.6+),
      // so it's intentionally not sent. Consistency comes from the deterministic
      // repo snapshot and the prompt instead.
      const text = await call(config, {
        max_tokens: req.maxTokens ?? 4000,
        system: systemParam(req.system, req.cacheSystem),
        messages: [...(req.history ?? []), { role: 'user', content: req.user }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      })
      return parseAndValidate(text, req.validate, `Anthropic (${config.model})`)
    },

    async completeStream(req: AiStreamRequest): Promise<string> {
      const text = await postStream({
        url: API_URL,
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: {
          model: config.model,
          stream: true,
          max_tokens: req.maxTokens ?? 8000,
          system: systemParam(req.system, req.cacheSystem),
          messages: [...(req.history ?? []), { role: 'user', content: req.user }],
        },
        host: 'api.anthropic.com',
        label: `Anthropic (${config.model})`,
        parseEvent: parseAnthropicEvent,
        parseUsage: parseAnthropicStreamUsage,
        onText: req.onText,
        signal: req.signal,
      })
      if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
      return text
    },
  }
}
