import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createProvider } from './index'
import type { AiProviderConfig } from '../types'
import { AiError } from '../types'
import { getAiUsage, resetAiUsage } from '../usage'

// Provider implementations are thin adapters over `fetch`. We stub `fetch` to
// drive every branch: success, each mapped HTTP error, network failure,
// malformed body, refusal/safety, empty output, and JSON parse/validate.

const cfg: AiProviderConfig = { apiKey: 'k', model: 'm' }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function stubFetch(impl: () => unknown) {
  vi.stubGlobal('fetch', vi.fn(impl))
}
function res(init: { ok: boolean; status: number; json: () => Promise<unknown> }): Response {
  return init as unknown as Response
}
function okText(text: string) {
  // body shapes differ per provider; include all three so one helper serves all.
  return res({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text }],
      choices: [{ message: { content: text } }],
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  })
}

afterEach(() => vi.unstubAllGlobals())

const PROVIDERS = ['anthropic', 'openai', 'gemini'] as const

describe('AI providers', () => {
  for (const id of PROVIDERS) {
    describe(id, () => {
      it('complete returns the model text', async () => {
        stubFetch(() => okText('hello world'))
        const p = createProvider(id, cfg)
        expect(await p.complete({ system: 's', user: 'u' })).toBe('hello world')
      })

      it('completeJson parses and validates', async () => {
        stubFetch(() => okText('{"a":1}'))
        const p = createProvider(id, cfg)
        const out = await p.completeJson({ system: 's', user: 'u', schema: {}, validate: isObj })
        expect(out).toEqual({ a: 1 })
      })

      it('completeJson tolerates fenced and prose-wrapped JSON', async () => {
        stubFetch(() => okText('Here you go:\n```json\n{"a":2}\n```\nthanks'))
        const p = createProvider(id, cfg)
        expect(await p.completeJson({ system: 's', user: 'u', schema: {}, validate: isObj })).toEqual({ a: 2 })
      })

      it('completeJson rejects output that fails validation', async () => {
        stubFetch(() => okText('{"a":1}'))
        const p = createProvider(id, cfg)
        await expect(p.completeJson({ system: 's', user: 'u', schema: {}, validate: (v): v is { b: number } => isObj(v) && 'b' in v }))
          .rejects.toMatchObject({ kind: 'invalid-response' })
      })

      it('completeJson rejects non-JSON output', async () => {
        stubFetch(() => okText('definitely not json'))
        const p = createProvider(id, cfg)
        await expect(p.completeJson({ system: 's', user: 'u', schema: {}, validate: isObj }))
          .rejects.toBeInstanceOf(AiError)
      })

      it('maps a network failure to a connection error', async () => {
        stubFetch(() => { throw new Error('blocked by extension') })
        const p = createProvider(id, cfg)
        await expect(p.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'connection' })
      })

      it('reports an empty model response', async () => {
        stubFetch(() => res({ ok: true, status: 200, json: async () => ({ content: [], choices: [{ message: { content: '' } }], candidates: [{ content: { parts: [] } }] }) }))
        const p = createProvider(id, cfg)
        await expect(p.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'invalid-response' })
      })

      it('reports a malformed (non-JSON) response body', async () => {
        stubFetch(() => res({ ok: true, status: 200, json: async () => { throw new Error('bad body') } }))
        const p = createProvider(id, cfg)
        await expect(p.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'invalid-response' })
      })
    })
  }

  it('salvages JSON even when the prose preamble contains a brace', async () => {
    stubFetch(() => okText('Here is the result {as requested}: {"a":3}'))
    const p = createProvider('anthropic', cfg)
    expect(await p.completeJson({ system: 's', user: 'u', schema: {}, validate: isObj })).toEqual({ a: 3 })
  })

  it('threads chat history without error', async () => {
    stubFetch(() => okText('ok'))
    for (const id of PROVIDERS) {
      const p = createProvider(id, cfg)
      expect(await p.complete({ system: 's', user: 'u', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }] })).toBe('ok')
    }
  })

  it('honors an explicit temperature for openai/gemini completeJson', async () => {
    stubFetch(() => okText('{"ok":true}'))
    for (const id of ['openai', 'gemini'] as const) {
      const p = createProvider(id, cfg)
      expect(await p.completeJson({ system: 's', user: 'u', schema: {}, validate: isObj, temperature: 0.2 })).toEqual({ ok: true })
    }
  })

  // HTTP error mapping (http.ts) — exercised through the anthropic adapter.
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [408, 'connection'],
    [504, 'connection'],
    [500, 'network'],
    [503, 'network'],
    [400, 'unknown'],
  ])('maps HTTP %i to a %s error', async (status, kind) => {
    stubFetch(() => res({ ok: false, status, json: async () => ({ error: { message: `boom ${status}` } }) }))
    const p = createProvider('anthropic', cfg)
    await expect(p.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind })
  })

  it('falls back to a status message when the error body is not JSON', async () => {
    stubFetch(() => res({ ok: false, status: 500, json: async () => { throw new Error('html error page') } }))
    const p = createProvider('anthropic', cfg)
    await expect(p.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'network' })
  })

  it('surfaces a model refusal / safety stop', async () => {
    stubFetch(() => res({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'x' }], stop_reason: 'refusal' }) }))
    await expect(createProvider('anthropic', cfg).complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'invalid-response' })

    stubFetch(() => res({ ok: true, status: 200, json: async () => ({ choices: [{ message: { refusal: 'no' } }] }) }))
    await expect(createProvider('openai', cfg).complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'invalid-response' })

    stubFetch(() => res({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) }))
    await expect(createProvider('gemini', cfg).complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('throws for an unknown provider id', () => {
    expect(() => createProvider('bogus' as 'anthropic', cfg)).toThrow(/Unknown AI provider/)
  })

  // ─── Anthropic prompt caching (TEA-49) ────────────────────────────────
  it('sends the Anthropic system as a plain string by default', async () => {
    const fetchMock = vi.fn(() => okText('ok'))
    stubFetch(fetchMock)
    await createProvider('anthropic', cfg).complete({ system: 'ctx', user: 'u' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.system).toBe('ctx')
  })

  it('flags the Anthropic system block cacheable when cacheSystem is set', async () => {
    const fetchMock = vi.fn(() => okText('ok'))
    stubFetch(fetchMock)
    await createProvider('anthropic', cfg).complete({ system: 'ctx', user: 'u', cacheSystem: true })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.system).toEqual([{ type: 'text', text: 'ctx', cache_control: { type: 'ephemeral' } }])
  })

  it('caches the Anthropic system block for completeJson too', async () => {
    const fetchMock = vi.fn(() => okText('{"a":1}'))
    stubFetch(fetchMock)
    await createProvider('anthropic', cfg).completeJson({ system: 'ctx', user: 'u', schema: {}, validate: isObj, cacheSystem: true })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('ignores cacheSystem for non-Anthropic providers (no crash, plain system)', async () => {
    for (const id of ['openai', 'gemini'] as const) {
      stubFetch(() => okText('ok'))
      expect(await createProvider(id, cfg).complete({ system: 's', user: 'u', cacheSystem: true })).toBe('ok')
    }
  })
})

// ─── Streaming (completeStream over SSE) ────────────────────────────────
//
// Streaming adapters share the same fetch/error mapping as the JSON path but
// read a `text/event-stream` body. We stub fetch to return a fake ReadableStream
// of SSE `data:` frames and drive every branch: per-delta callbacks, the full
// accumulated result, cross-chunk buffering, [DONE]/keep-alive handling, error
// and refusal frames, empty output, non-OK responses, and abort propagation.

/** A Response whose body streams `chunks` (arbitrary byte slices of an SSE
 *  stream) through a minimal getReader(), so tests can split frames anywhere. */
function streamRes(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read() {
            return i < chunks.length
              ? Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) })
              : Promise.resolve({ done: true, value: undefined })
          },
        }
      },
    },
  } as unknown as Response
}

/** Build the provider-specific SSE `data:` frame carrying one text delta. */
function sseFrame(id: (typeof PROVIDERS)[number], text: string): string {
  const payload = id === 'anthropic'
    ? { type: 'content_block_delta', delta: { type: 'text_delta', text } }
    : id === 'openai'
      ? { choices: [{ delta: { content: text } }] }
      : { candidates: [{ content: { parts: [{ text }] } }] }
  return `data: ${JSON.stringify(payload)}\n\n`
}

describe('AI provider streaming', () => {
  for (const id of PROVIDERS) {
    describe(id, () => {
      it('fires onText per delta and resolves with the full text', async () => {
        stubFetch(() => streamRes([sseFrame(id, 'Hello, '), sseFrame(id, 'world')]))
        const p = createProvider(id, cfg)
        const deltas: string[] = []
        const full = await p.completeStream!({ system: 's', user: 'u', onText: (d) => deltas.push(d) })
        expect(deltas).toEqual(['Hello, ', 'world'])
        expect(full).toBe('Hello, world')
      })

      it('reassembles frames split across read() chunks', async () => {
        // One SSE stream, sliced into 7-byte pieces to split `data:` lines mid-JSON.
        const stream = sseFrame(id, 'abc') + sseFrame(id, 'def')
        const pieces: string[] = []
        for (let i = 0; i < stream.length; i += 7) pieces.push(stream.slice(i, i + 7))
        stubFetch(() => streamRes(pieces))
        const p = createProvider(id, cfg)
        expect(await p.completeStream!({ system: 's', user: 'u', onText: () => {} })).toBe('abcdef')
      })

      it('ignores keep-alive and non-JSON data frames', async () => {
        stubFetch(() => streamRes([': keep-alive comment\n\n', 'data: not json\n\n', sseFrame(id, 'ok')]))
        const p = createProvider(id, cfg)
        expect(await p.completeStream!({ system: 's', user: 'u', onText: () => {} })).toBe('ok')
      })

      it('reports an empty stream as invalid-response', async () => {
        stubFetch(() => streamRes(['data: [DONE]\n\n']))
        const p = createProvider(id, cfg)
        await expect(p.completeStream!({ system: 's', user: 'u', onText: () => {} }))
          .rejects.toMatchObject({ kind: 'invalid-response' })
      })

      it('maps a non-OK response to the shared error kinds', async () => {
        stubFetch(() => res({ ok: false, status: 429, json: async () => ({ error: { message: 'slow down' } }) }))
        const p = createProvider(id, cfg)
        await expect(p.completeStream!({ system: 's', user: 'u', onText: () => {} }))
          .rejects.toMatchObject({ kind: 'rate-limit' })
      })

      it('propagates a caller abort without wrapping it as a connection error', async () => {
        stubFetch(() => { throw new DOMException('aborted', 'AbortError') })
        const p = createProvider(id, cfg)
        await expect(p.completeStream!({ system: 's', user: 'u', onText: () => {} }))
          .rejects.toMatchObject({ name: 'AbortError' })
      })
    })
  }

  it('tolerates OpenAI-style [DONE] framing after content', async () => {
    stubFetch(() => streamRes([sseFrame('openai', 'hi'), 'data: [DONE]\n\n']))
    const p = createProvider('openai', cfg)
    expect(await p.completeStream!({ system: 's', user: 'u', onText: () => {} })).toBe('hi')
  })

  it('surfaces a mid-stream safety refusal', async () => {
    // OpenAI delta.refusal
    stubFetch(() => streamRes([`data: ${JSON.stringify({ choices: [{ delta: { refusal: 'no' } }] })}\n\n`]))
    await expect(createProvider('openai', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} }))
      .rejects.toMatchObject({ kind: 'invalid-response' })

    // Gemini SAFETY finishReason
    stubFetch(() => streamRes([`data: ${JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })}\n\n`]))
    await expect(createProvider('gemini', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} }))
      .rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('maps an Anthropic error event to a network error', async () => {
    stubFetch(() => streamRes([`data: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } })}\n\n`]))
    await expect(createProvider('anthropic', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} }))
      .rejects.toMatchObject({ kind: 'network' })
  })

  it('ends the Anthropic stream cleanly on a non-refusal message_delta', async () => {
    stubFetch(() => streamRes([
      sseFrame('anthropic', 'done'),
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })}\n\n`,
    ]))
    expect(await createProvider('anthropic', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} })).toBe('done')
  })
})

// ─── Session usage meter (TEA-47) ───────────────────────────────────────
describe('AI provider usage metering', () => {
  beforeEach(() => resetAiUsage())

  it('counts one call per successful JSON request', async () => {
    stubFetch(() => okText('ok'))
    await createProvider('anthropic', cfg).complete({ system: 's', user: 'u' })
    await createProvider('openai', cfg).complete({ system: 's', user: 'u' })
    expect(getAiUsage().calls).toBe(2)
  })

  it('does not count a failed (non-OK) request', async () => {
    stubFetch(() => res({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }))
    await expect(createProvider('anthropic', cfg).complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(AiError)
    expect(getAiUsage().calls).toBe(0)
  })

  it('records Anthropic token usage (including cached tokens as input)', async () => {
    stubFetch(() => res({ ok: true, status: 200, json: async () => ({
      content: [{ type: 'text', text: 'hi' }],
      usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 100 },
    }) }))
    await createProvider('anthropic', cfg).complete({ system: 's', user: 'u' })
    const u = getAiUsage()
    expect(u.inputTokens).toBe(140)
    expect(u.outputTokens).toBe(12)
    expect(u.measuredCalls).toBe(1)
  })

  it('records OpenAI token usage from the response body', async () => {
    stubFetch(() => res({ ok: true, status: 200, json: async () => ({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 30, completion_tokens: 8 },
    }) }))
    await createProvider('openai', cfg).complete({ system: 's', user: 'u' })
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 30, outputTokens: 8, measuredCalls: 1 })
  })

  it('records Gemini token usage from usageMetadata', async () => {
    stubFetch(() => res({ ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 22, candidatesTokenCount: 6 },
    }) }))
    await createProvider('gemini', cfg).complete({ system: 's', user: 'u' })
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 22, outputTokens: 6 })
  })

  it('merges Anthropic streaming usage across message_start and message_delta into one call', async () => {
    stubFetch(() => streamRes([
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 200 } } })}\n\n`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 15 } })}\n\n`,
    ]))
    await createProvider('anthropic', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} })
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 200, outputTokens: 15, measuredCalls: 1 })
  })

  it('records OpenAI streaming usage from the final include_usage chunk once', async () => {
    stubFetch(() => streamRes([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } })}\n\n`,
    ]))
    await createProvider('openai', cfg).completeStream!({ system: 's', user: 'u', onText: () => {} })
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 12, outputTokens: 4 })
  })
})
