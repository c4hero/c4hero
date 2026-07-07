import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiStreamRequest } from '../types'
import { AiError } from '../types'
import { isRecord } from '@/lib/guards'
import { postJson, postStream, parseAndValidate, jsonSchemaSystemPrompt, type UsageDelta } from './http'

// OpenAI Chat Completions API, called directly from the browser with the user's
// key. For structured output we use JSON mode (`response_format: json_object`)
// and append the JSON Schema to the system prompt, then validate client-side.
// This is robust across OpenAI's model/strict-schema variations — the caller's
// runtime validator is the real guarantee — and keeps the same AiProvider seam.

const API_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiChoice {
  message?: { content?: string | null; refusal?: string | null }
  finish_reason?: string
}
interface OpenAiResponse { choices?: OpenAiChoice[] }

// Map one Chat Completions stream chunk (`data:` JSON) to a text delta. Chunks
// carry `choices[0].delta.content`; a `delta.refusal` marks a safety decline.
function parseOpenAiEvent(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices) || !data.choices.length) return ''
  const choice = data.choices[0]
  if (!isRecord(choice)) return ''
  const delta = choice.delta
  if (!isRecord(delta)) return ''
  if (typeof delta.refusal === 'string' && delta.refusal.trim()) {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  return typeof delta.content === 'string' ? delta.content : ''
}

// Both the JSON response and the final streaming chunk (with include_usage)
// carry `usage: { prompt_tokens, completion_tokens }`.
function parseOpenAiUsage(data: unknown): UsageDelta | null {
  if (!isRecord(data) || !isRecord(data.usage)) return null
  const input = typeof data.usage.prompt_tokens === 'number' ? data.usage.prompt_tokens : 0
  const output = typeof data.usage.completion_tokens === 'number' ? data.usage.completion_tokens : 0
  return input || output ? { input: input || undefined, output: output || undefined } : null
}

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
  const data = (await postJson({
    url: API_URL,
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: { model: config.model, ...body },
    host: 'api.openai.com',
    label: `OpenAI (${config.model})`,
    parseUsage: parseOpenAiUsage,
  })) as OpenAiResponse

  const choice = data.choices?.[0]
  if (choice?.message?.refusal) {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  const text = choice?.message?.content ?? ''
  if (!text.trim()) {
    // Reasoning models — e.g. the default GPT-5 mini — count reasoning tokens
    // against the completion budget and can stop with finish_reason 'length'
    // before emitting any visible content. Give an actionable error.
    if (choice?.finish_reason === 'length') {
      throw new AiError('invalid-response', 'The model spent its entire output budget on reasoning and returned no answer. Try a smaller scope, or pick a non-reasoning model in AI settings.')
    }
    throw new AiError('invalid-response', 'The model returned an empty response.')
  }
  return text
}

function messages(system: string, user: string, history?: { role: 'user' | 'assistant'; content: string }[]) {
  return [
    { role: 'system', content: system },
    ...(history ?? []),
    { role: 'user', content: user },
  ]
}

export function createOpenAiProvider(config: AiProviderConfig): AiProvider {
  return {
    async complete(req: AiTextRequest): Promise<string> {
      return call(config, {
        max_completion_tokens: req.maxTokens ?? 8000,
        // Only sent when explicitly set: reasoning models (gpt-5, o-series)
        // reject any temperature other than the default.
        temperature: req.temperature,
        messages: messages(req.system, req.user, req.history),
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      // JSON mode requires the word "json" in the prompt; the schema block supplies it.
      const system = jsonSchemaSystemPrompt(req.system, req.schema)
      const text = await call(config, {
        // Higher floor than the caller passes: reasoning models share this budget
        // with their reasoning tokens, so structured output needs room.
        max_completion_tokens: req.maxTokens ?? 8000,
        temperature: req.temperature,
        messages: messages(system, req.user, req.history),
        response_format: { type: 'json_object' },
      })
      return parseAndValidate(text, req.validate, `OpenAI (${config.model})`)
    },

    async completeStream(req: AiStreamRequest): Promise<string> {
      const text = await postStream({
        url: API_URL,
        headers: { authorization: `Bearer ${config.apiKey}` },
        body: {
          model: config.model,
          stream: true,
          // Ask for a final usage-only chunk so the session meter can count tokens.
          stream_options: { include_usage: true },
          max_completion_tokens: req.maxTokens ?? 8000,
          temperature: req.temperature,
          messages: messages(req.system, req.user, req.history),
        },
        host: 'api.openai.com',
        label: `OpenAI (${config.model})`,
        parseEvent: parseOpenAiEvent,
        parseUsage: parseOpenAiUsage,
        onText: req.onText,
        signal: req.signal,
      })
      if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
      return text
    },
  }
}
