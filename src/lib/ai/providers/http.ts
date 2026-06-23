import { AiError } from '../types'

// Shared HTTP error mapping for BYOK provider implementations. Each provider
// owns its own request/response shape (Anthropic and OpenAI differ), but maps
// failures to the same AiError kinds so the UI handles them uniformly.

export function mapHttpError(status: number, message: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', message)
  if (status === 429) return new AiError('rate-limit', message)
  if (status >= 500) return new AiError('network', message)
  return new AiError('unknown', message)
}

/** Parse a JSON error body's message from either the Anthropic (`error.message`)
 *  or OpenAI (`error.message`) envelope, falling back to a status string. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body?.error?.message) return body.error.message
  } catch {
    // non-JSON error body — keep the fallback
  }
  return fallback
}

export function parseJsonOrThrow<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AiError('invalid-response', 'The model did not return valid JSON.')
  }
}
