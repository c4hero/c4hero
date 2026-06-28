import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiChatTurn } from '../types'
import { AiError } from '../types'
import { postJson, parseAndValidate } from './http'

// Google Gemini (Generative Language API), called directly from the browser with
// the user's key. For structured output we request a JSON response MIME type and
// append the JSON Schema to the system instruction, then validate client-side —
// robust across models, with the caller's validator as the real guarantee.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
}

function toContents(history: AiChatTurn[] | undefined, user: string) {
  const turns = (history ?? []).map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))
  return [...turns, { role: 'user', parts: [{ text: user }] }]
}

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
  const url = `${BASE}/${encodeURIComponent(config.model)}:generateContent`
  const data = (await postJson({
    url,
    headers: { 'x-goog-api-key': config.apiKey },
    body,
    host: 'generativelanguage.googleapis.com',
    label: `Gemini (${config.model})`,
  })) as GeminiResponse

  const candidate = data.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKLIST') {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
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
      const system = `${req.system}\n\nReturn ONLY a JSON object that conforms to this JSON Schema:\n${JSON.stringify(req.schema)}`
      const text = await call(config, {
        systemInstruction: { parts: [{ text: system }] },
        contents: toContents(req.history, req.user),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 4000, responseMimeType: 'application/json', temperature: req.temperature ?? 0 },
      })
      return parseAndValidate(text, req.validate, `Gemini (${config.model})`)
    },
  }
}
