import { AiError } from '../types'
import { stripCodeFence } from '../dsl'
import { createLogger } from '@/lib/logger'

// Shared HTTP + parsing helpers for BYOK provider implementations. Each provider
// owns its own request/response shape, but they map failures to the same AiError
// kinds, and — critically for debugging — log the provider, status, and raw
// model output to the console when something goes wrong.

const log = createLogger('ai/provider')

export function mapHttpError(status: number, message: string): AiError {
  // 408 (Request Timeout) and 504 (Gateway Timeout) read as connectivity issues.
  if (status === 408 || status === 504) return new AiError('connection', message)
  if (status === 401 || status === 403) return new AiError('auth', message)
  if (status === 429) return new AiError('rate-limit', message)
  if (status >= 500) return new AiError('network', message)
  return new AiError('unknown', message)
}

/** Throw a mapped error for a non-OK HTTP response, logging the details first. */
export function httpFail(provider: string, status: number, message: string): never {
  log.error('AI provider HTTP error', { provider, status, message })
  throw mapHttpError(status, message)
}

/** POST a JSON body and return the parsed JSON response, mapping every failure
 *  mode to the shared AiError kinds. Each provider differs only in url/headers/
 *  body/host/label, so the fetch + connection-error + non-OK + malformed-body
 *  handling lives here instead of being copy-pasted three times. */
export async function postJson(opts: {
  url: string
  headers: Record<string, string>
  body: unknown
  /** Host shown in the connection-error message, e.g. `api.anthropic.com`. */
  host: string
  /** Provider label for logs / errors, e.g. `Anthropic (claude-…)`. */
  label: string
}): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.body),
    })
  } catch {
    throw new AiError(
      'connection',
      `The browser blocked or failed the request to ${opts.host} before it left. This is `
      + 'usually a privacy/ad-block extension, a stale cached page (try a hard refresh or an '
      + 'incognito window), or a network firewall — not your API key. Check the browser console '
      + 'for the exact reason.',
    )
  }

  if (!res.ok) {
    httpFail(opts.label, res.status, await readErrorMessage(res, `Request failed (${res.status})`))
  }

  try {
    return await res.json()
  } catch {
    throw new AiError('invalid-response', `Malformed response from ${opts.label}.`)
  }
}

/** Parse a JSON error body's `error.message` (Anthropic / OpenAI / Gemini all
 *  use this shape), falling back to a status string. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body?.error?.message) return body.error.message
  } catch {
    // non-JSON error body — keep the fallback
  }
  return fallback
}

// Find the index of the brace that closes the `{` at `open`, ignoring braces
// inside string literals. Returns -1 if unbalanced.
function matchBrace(text: string, open: number): number {
  let depth = 0
  let inString = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') { i++; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return i }
  }
  return -1
}

// Try the raw text, then a fence-stripped version, then each balanced `{ … }`
// block in order — models occasionally wrap JSON in markdown or a sentence of
// prose. We brace-balance (string-aware) each candidate rather than slicing the
// first `{` to the last `}`, which a stray brace in the prose would corrupt.
function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const candidates = [text, stripCodeFence(text)]
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    const close = matchBrace(text, i)
    if (close !== -1) candidates.push(text.slice(i, close + 1))
  }
  for (const c of candidates) {
    try {
      return { ok: true, value: JSON.parse(c) }
    } catch {
      // try the next candidate
    }
  }
  return { ok: false }
}

/** Parse structured-output text and validate it, logging the raw output to the
 *  console on any failure so the user can see exactly what the model returned. */
export function parseAndValidate<T>(text: string, validate: (v: unknown) => v is T, provider: string): T {
  const parsed = tryParseJson(text)
  if (!parsed.ok) {
    log.error('AI provider returned non-JSON output', { provider, output: text.slice(0, 4000) })
    throw new AiError('invalid-response', 'The model did not return valid JSON. The raw output is in the browser console.')
  }
  const value = parsed.value
  if (!validate(value)) {
    log.error('AI provider output failed schema validation', { provider, output: value })
    throw new AiError('invalid-response', 'The model response did not match the expected shape. The raw output is in the browser console.')
  }
  return value
}
