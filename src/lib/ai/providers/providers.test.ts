import { describe, it, expect, vi, afterEach } from 'vitest'
import { createProvider } from './index'
import type { AiProviderConfig } from '../types'
import { AiError } from '../types'

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
})
