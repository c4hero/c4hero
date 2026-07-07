import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiChatTurn, AiStreamRequest } from '../types'
import { AiError } from '../types'
import { isRecord } from '@/lib/guards'
import { postJson, postStream, parseAndValidate, jsonSchemaSystemPrompt, type UsageDelta } from './http'

// Google Gemini (Generative Language API), called directly from the browser with
// the user's key. For structured output we request a JSON response MIME type and
// append the JSON Schema to the system instruction, then validate client-side —
// robust across models, with the caller's validator as the real guarantee.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
}

// Map one streamGenerateContent SSE chunk (`data:` JSON) to a text delta. Each
// chunk carries a candidate whose parts hold the incremental text; a SAFETY /
// BLOCKLIST finishReason marks a decline.
function parseGeminiEvent(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates) || !data.candidates.length) return ''
  const candidate = data.candidates[0]
  if (!isRecord(candidate)) return ''
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST') {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  const content = candidate.content
  if (!isRecord(content) || !Array.isArray(content.parts)) return ''
  return content.parts.map((p) => (isRecord(p) && typeof p.text === 'string' ? p.text : '')).join('')
}

function toContents(history: AiChatTurn[] | undefined, user: string) {
  const turns = (history ?? []).map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))
  return [...turns, { role: 'user', parts: [{ text: user }] }]
}

// `usageMetadata` appears on the JSON response and on streaming chunks, where
// its counts are cumulative — so the stream reader's "keep the latest absolute
// value" merge yields the final total without double-counting.
function parseGeminiUsage(data: unknown): UsageDelta | null {
  if (!isRecord(data) || !isRecord(data.usageMetadata)) return null
  const m = data.usageMetadata
  const input = typeof m.promptTokenCount === 'number' ? m.promptTokenCount : 0
  const output = typeof m.candidatesTokenCount === 'number' ? m.candidatesTokenCount : 0
  return input || output ? { input: input || undefined, output: output || undefined } : null
}

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
  const url = `${BASE}/${encodeURIComponent(config.model)}:generateContent`
  const data = (await postJson({
    url,
    headers: { 'x-goog-api-key': config.apiKey },
    body,
    host: 'generativelanguage.googleapis.com',
    label: `Gemini (${config.model})`,
    parseUsage: parseGeminiUsage,
  })) as GeminiResponse

  const candidate = data.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKLIST') {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!text.trim()) {
    // Reasoning ("thinking") models — e.g. the default Gemini 2.5 Flash — can
    // spend the whole output budget on internal reasoning and return no content
    // with finishReason MAX_TOKENS. Give an actionable error, not a bare "empty".
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new AiError('invalid-response', 'The model spent its entire output budget on reasoning and returned no answer. Try a smaller scope, or pick a non-reasoning model in AI settings.')
    }
    throw new AiError('invalid-response', 'The model returned an empty response.')
  }
  return text
}

export function createGeminiProvider(config: AiProviderConfig): AiProvider {
  return {
    async complete(req: AiTextRequest): Promise<string> {
      return call(config, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toContents(req.history, req.user),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 8000, temperature: req.temperature },
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      const system = jsonSchemaSystemPrompt(req.system, req.schema)
      const text = await call(config, {
        systemInstruction: { parts: [{ text: system }] },
        contents: toContents(req.history, req.user),
        // Higher floor than `complete`'s caller passes: reasoning models share
        // this budget with their thinking tokens, so structured output needs room.
        generationConfig: { maxOutputTokens: req.maxTokens ?? 8000, responseMimeType: 'application/json', temperature: req.temperature ?? 0 },
      })
      return parseAndValidate(text, req.validate, `Gemini (${config.model})`)
    },

    async completeStream(req: AiStreamRequest): Promise<string> {
      // `streamGenerateContent` with `alt=sse` returns a `data:`-framed SSE body
      // (the default is a streamed JSON array, which our line parser can't read).
      const url = `${BASE}/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`
      const text = await postStream({
        url,
        headers: { 'x-goog-api-key': config.apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: toContents(req.history, req.user),
          generationConfig: { maxOutputTokens: req.maxTokens ?? 8000, temperature: req.temperature },
        },
        host: 'generativelanguage.googleapis.com',
        label: `Gemini (${config.model})`,
        parseEvent: parseGeminiEvent,
        parseUsage: parseGeminiUsage,
        onText: req.onText,
        signal: req.signal,
      })
      if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
      return text
    },
  }
}
