import type { AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest } from '../types'
import { AiError } from '../types'
import { httpFail, readErrorMessage, parseAndValidate } from './http'

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

async function call(config: AiProviderConfig, body: Record<string, unknown>): Promise<string> {
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, ...body }),
    })
  } catch {
    throw new AiError(
      'connection',
      'The browser blocked or failed the request to api.openai.com before it left. This is '
      + 'usually a privacy/ad-block extension, a stale cached page (try a hard refresh or an '
      + 'incognito window), or a network firewall — not your API key. Check the browser console '
      + 'for the exact reason.',
    )
  }

  if (!res.ok) {
    httpFail(`OpenAI (${config.model})`, res.status, await readErrorMessage(res, `Request failed (${res.status})`))
  }

  let data: OpenAiResponse
  try {
    data = (await res.json()) as OpenAiResponse
  } catch {
    throw new AiError('invalid-response', 'Malformed response from OpenAI.')
  }

  const choice = data.choices?.[0]
  if (choice?.message?.refusal) {
    throw new AiError('invalid-response', 'The model declined this request.')
  }
  const text = choice?.message?.content ?? ''
  if (!text.trim()) throw new AiError('invalid-response', 'The model returned an empty response.')
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
        messages: messages(req.system, req.user, req.history),
      })
    },

    async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
      // JSON mode requires the word "json" in the prompt; the schema block supplies it.
      const system = `${req.system}\n\nReturn ONLY a JSON object that conforms to this JSON Schema:\n${JSON.stringify(req.schema)}`
      const text = await call(config, {
        max_completion_tokens: req.maxTokens ?? 4000,
        messages: messages(system, req.user, req.history),
        response_format: { type: 'json_object' },
      })
      return parseAndValidate(text, req.validate, `OpenAI (${config.model})`)
    },
  }
}
