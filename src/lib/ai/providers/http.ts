import { AiError } from '../types'
import { stripCodeFence } from '../dsl'
import { recordAiCall, recordAiTokens } from '../usage'
import { createLogger } from '@/lib/logger'

// Token usage extracted from a provider response (or SSE frame). Fields are
// optional because different providers surface input/output at different points
// (Anthropic splits them across the start/end stream frames); the stream reader
// merges partials and records the final absolute values once per call.
export interface UsageDelta { input?: number; output?: number }
export type UsageParser = (data: unknown) => UsageDelta | null

// Shared HTTP + parsing helpers for BYOK provider implementations. Each provider
// owns its own request/response shape, but they map failures to the same AiError
// kinds, and — critically for debugging — log the provider, status, and raw
// model output to the console when something goes wrong.

const log = createLogger('ai/provider')

/** Build the structured-output system prompt: the caller's system text plus the
 *  JSON Schema the model must conform to. OpenAI (JSON mode needs the word "json"
 *  present) and Gemini (JSON MIME type) append the identical block, so it lives
 *  here instead of being copy-pasted per provider. */
export function jsonSchemaSystemPrompt(system: string, schema: unknown): string {
  return `${system}\n\nReturn ONLY a JSON object that conforms to this JSON Schema:\n${JSON.stringify(schema)}`
}

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
  /** Extract token usage from the parsed response body, when the provider
   *  exposes it — recorded to the session usage meter. */
  parseUsage?: UsageParser
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

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new AiError('invalid-response', `Malformed response from ${opts.label}.`)
  }
  // The single choke point for BYOK cost visibility: one accepted response = one
  // billable call. Record it (and any token usage) before handing the body back.
  recordAiCall()
  recordUsage(opts.parseUsage?.(data))
  return data
}

/** Record a usage delta to the session meter, ignoring absent/empty counts. */
function recordUsage(u: UsageDelta | null | undefined): void {
  if (u) recordAiTokens(u.input ?? 0, u.output ?? 0)
}

/** POST a JSON body and stream a `text/event-stream` response, mapping each
 *  SSE `data:` JSON payload to a text delta via `parseEvent`. Fires `onText` per
 *  non-empty delta and resolves with the full accumulated text. Shares the same
 *  connection-error / non-OK mapping as `postJson`; the SSE framing lives here so
 *  each provider only supplies its own url/headers/body and a per-event mapper.
 *
 *  All three providers send exactly one JSON object per `data:` line and carry a
 *  `type`/`finishReason`/`error` field inside it, so line-based parsing (rather
 *  than full `event:`-aware SSE framing) is sufficient. `parseEvent` may throw an
 *  AiError for provider error/refusal frames. */
export async function postStream(opts: {
  url: string
  headers: Record<string, string>
  body: unknown
  host: string
  label: string
  /** Map one parsed SSE `data:` JSON payload to its text delta (`''` if none). */
  parseEvent: (data: unknown) => string
  /** Extract token usage from an SSE frame. Providers split input/output across
   *  frames (Anthropic) or send a cumulative/final total; partials are merged
   *  and the final absolute values recorded once. */
  parseUsage?: UsageParser
  onText: (delta: string) => void
  signal?: AbortSignal
}): Promise<string> {
  let res: Response
  try {
    res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (err) {
    // A caller-triggered abort is not a connection failure — propagate it as-is
    // so callers can distinguish cancellation from a blocked request.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
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
  if (!res.body) {
    throw new AiError('invalid-response', `No response stream from ${opts.label}.`)
  }
  // Response accepted → one billable call. (Token usage is recorded at the end,
  // once the final usage frame has been merged.)
  recordAiCall()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  // Absolute token counts, merged across frames — providers report input at the
  // start and output at the end (or a cumulative total), so we keep the latest
  // non-empty value for each and record once when the stream closes.
  const usage: UsageDelta = {}

  // Parse one SSE `data:` payload (the text after `data:`) and emit its delta.
  // `[DONE]` (OpenAI) and blank keep-alive frames are ignored; malformed JSON is
  // skipped rather than aborting the whole stream.
  const handleData = (payload: string) => {
    const trimmed = payload.trim()
    if (!trimmed || trimmed === '[DONE]') return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return
    }
    const u = opts.parseUsage?.(parsed)
    if (u) {
      if (u.input != null) usage.input = u.input
      if (u.output != null) usage.output = u.output
    }
    const delta = opts.parseEvent(parsed) // may throw AiError on error/refusal frames
    if (delta) { full += delta; opts.onText(delta) }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // Process only complete lines — a `data:` field may be split across chunks,
    // so keep the trailing partial in the buffer.
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, '')
      buffer = buffer.slice(nl + 1)
      if (line.startsWith('data:')) handleData(line.slice(5))
    }
  }
  // Flush a trailing line with no terminating newline.
  const tail = buffer.replace(/\r$/, '')
  if (tail.startsWith('data:')) handleData(tail.slice(5))

  recordUsage(usage)
  return full
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
