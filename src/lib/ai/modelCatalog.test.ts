import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseAnthropicModels, parseOpenAiModels, parseGeminiModels, fetchProviderModels, ModelListError,
  readCachedModels, writeCachedModels, clearCachedModels, MODEL_CACHE_TTL_MS, keyFingerprint,
  modelFamily, resolveCuratedModel, pickerOptions,
} from './modelCatalog'
import { AI_PROVIDER_META } from './providerMeta'

describe('parseAnthropicModels', () => {
  it('keeps every model, newest first, labelled by display name', () => {
    const out = parseAnthropicModels({
      data: [
        { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', created_at: '2026-02-01T00:00:00Z' },
        { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-08-01T00:00:00Z' },
        { id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-08-01T00:00:00Z' },
        { bogus: true },
      ],
    })
    expect(out.map((m) => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5', 'claude-sonnet-4-6'])
    expect(out[0].label).toBe('Claude Opus 5')
  })

  it('returns [] for an unexpected body', () => {
    expect(parseAnthropicModels(null)).toEqual([])
    expect(parseAnthropicModels({ data: 'nope' })).toEqual([])
  })
})

describe('parseOpenAiModels', () => {
  it('keeps chat families, drops the noise, hides dated snapshots of a present alias', () => {
    const out = parseOpenAiModels({
      data: [
        { id: 'gpt-5', created: 300 },
        { id: 'gpt-5-mini', created: 300 },
        { id: 'gpt-4o', created: 100 },
        { id: 'gpt-4o-2024-08-06', created: 100 },
        { id: 'gpt-4o-2099-01-01', created: 100 }, // alias present → hidden
        { id: 'o3', created: 200 },
        { id: 'text-embedding-3-large', created: 500 },
        { id: 'gpt-4o-audio-preview', created: 500 },
        { id: 'gpt-4o-realtime-preview', created: 500 },
        { id: 'whisper-1', created: 500 },
        { id: 'dall-e-3', created: 500 },
        { id: 'tts-1', created: 500 },
        { id: 'omni-moderation-latest', created: 500 },
        { id: 'gpt-3.5-turbo-instruct', created: 500 },
        { id: 'gpt-4o-transcribe', created: 500 },
      ],
    })
    expect(out.map((m) => m.id)).toEqual(['gpt-5', 'gpt-5-mini', 'o3', 'gpt-4o'])
  })

  it('keeps a dated snapshot whose alias is absent', () => {
    const out = parseOpenAiModels({ data: [{ id: 'gpt-4.1-2025-04-14', created: 1 }] })
    expect(out.map((m) => m.id)).toEqual(['gpt-4.1-2025-04-14'])
  })
})

describe('parseGeminiModels', () => {
  it('keeps generateContent text models, strips the prefix, ranks stable before preview', () => {
    const out = parseGeminiModels({
      models: [
        { name: 'models/gemini-2.5-flash-preview-05-20', displayName: 'Gemini 2.5 Flash Preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash-preview-tts', displayName: 'TTS', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0', displayName: 'Imagen', supportedGenerationMethods: ['predict'] },
        { name: 'models/gemini-2.5-flash-live', displayName: 'Live', supportedGenerationMethods: ['bidiGenerateContent'] },
      ],
    })
    expect(out.map((m) => m.id)).toEqual(['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20'])
    expect(out[0].label).toBe('Gemini 2.5 Pro')
  })
})

describe('fetchProviderModels', () => {
  function fakeFetch(status: number, body: unknown, capture?: { url?: string; headers?: Record<string, string> }) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (capture) { capture.url = String(url); capture.headers = init?.headers as Record<string, string> }
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
  }

  it('sends the provider auth header and parses the list', async () => {
    const cap: { url?: string; headers?: Record<string, string> } = {}
    const models = await fetchProviderModels('anthropic', 'sk-ant-x', fakeFetch(200, {
      data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-08-01T00:00:00Z' }],
    }, cap))
    expect(models).toEqual([{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }])
    expect(cap.url).toContain('https://api.anthropic.com/v1/models')
    expect(cap.headers?.['x-api-key']).toBe('sk-ant-x')
    expect(cap.headers?.['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('uses bearer auth for OpenAI and the goog header for Gemini', async () => {
    const cap: { headers?: Record<string, string> } = {}
    await fetchProviderModels('openai', 'sk-o', fakeFetch(200, { data: [{ id: 'gpt-5', created: 1 }] }, cap))
    expect(cap.headers?.authorization).toBe('Bearer sk-o')
    await fetchProviderModels('gemini', 'AIza', fakeFetch(200, {
      models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }],
    }, cap))
    expect(cap.headers?.['x-goog-api-key']).toBe('AIza')
  })

  it('throws ModelListError on HTTP failure, network failure, bad JSON, and an empty list', async () => {
    await expect(fetchProviderModels('openai', 'k', fakeFetch(401, { error: { message: 'bad key' } })))
      .rejects.toMatchObject({ name: 'ModelListError', status: 401 })
    const boom = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect(fetchProviderModels('openai', 'k', boom)).rejects.toBeInstanceOf(ModelListError)
    const notJson = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(fetchProviderModels('openai', 'k', notJson)).rejects.toBeInstanceOf(ModelListError)
    await expect(fetchProviderModels('openai', 'k', fakeFetch(200, { data: [{ id: 'whisper-1' }] })))
      .rejects.toThrow(/no chat models/)
  })
})

describe('model cache', () => {
  beforeEach(() => { localStorage.clear() })

  it('round-trips per provider and is keyed to the API key', () => {
    const now = 1_000_000
    writeCachedModels('anthropic', 'key-a', [{ id: 'm', label: 'M' }], now)
    expect(readCachedModels('anthropic', 'key-a', now)?.models).toEqual([{ id: 'm', label: 'M' }])
    expect(readCachedModels('anthropic', 'key-b', now)).toBeNull()
    expect(readCachedModels('openai', 'key-a', now)).toBeNull()
  })

  it('expires after the TTL', () => {
    const now = 1_000_000
    writeCachedModels('gemini', 'k', [{ id: 'g', label: 'G' }], now)
    expect(readCachedModels('gemini', 'k', now + MODEL_CACHE_TTL_MS - 1)).not.toBeNull()
    expect(readCachedModels('gemini', 'k', now + MODEL_CACHE_TTL_MS + 1)).toBeNull()
  })

  it('never stores the key itself', () => {
    writeCachedModels('openai', 'sk-super-secret', [{ id: 'gpt-5', label: 'gpt-5' }])
    expect(localStorage.getItem('c4hero.ai.models.json')).not.toContain('sk-super-secret')
    expect(keyFingerprint('sk-super-secret')).not.toContain('secret')
  })

  it('clears one provider or all', () => {
    writeCachedModels('openai', 'k', [{ id: 'a', label: 'a' }], 1)
    writeCachedModels('gemini', 'k', [{ id: 'b', label: 'b' }], 1)
    clearCachedModels('openai')
    expect(readCachedModels('openai', 'k', 1)).toBeNull()
    expect(readCachedModels('gemini', 'k', 1)).not.toBeNull()
    clearCachedModels()
    expect(readCachedModels('gemini', 'k', 1)).toBeNull()
  })

  it('ignores a corrupt cache entry', () => {
    localStorage.setItem('c4hero.ai.models.json', JSON.stringify({ openai: { models: 'nope' } }))
    expect(readCachedModels('openai', 'k')).toBeNull()
  })
})

describe('resolution', () => {
  it('modelFamily strips versions, dates and preview tags', () => {
    expect(modelFamily('claude-sonnet-4-6')).toBe('claude-sonnet')
    expect(modelFamily('claude-sonnet-5')).toBe('claude-sonnet')
    expect(modelFamily('claude-haiku-4-5-20251001')).toBe('claude-haiku')
    expect(modelFamily('gpt-4o-2024-08-06')).toBe('gpt-4o')
    expect(modelFamily('gpt-5-mini')).toBe('gpt-mini') // mini tiers upgrade across generations
    expect(modelFamily('gemini-2.5-flash')).toBe('gemini-flash')
    expect(modelFamily('gemini-2.0-flash')).toBe('gemini-flash')
  })

  it('keeps a curated id the provider still offers', () => {
    expect(resolveCuratedModel('claude-sonnet-4-6', [{ id: 'claude-sonnet-4-6', label: '' }])).toBe('claude-sonnet-4-6')
  })

  it('upgrades a retired curated id to the newest same-family live model', () => {
    const live = [{ id: 'claude-opus-5', label: '' }, { id: 'claude-sonnet-5', label: '' }, { id: 'claude-haiku-4-5', label: '' }]
    expect(resolveCuratedModel('claude-sonnet-4-6', live)).toBe('claude-sonnet-5')
    expect(resolveCuratedModel('claude-haiku-4-5', live)).toBe('claude-haiku-4-5')
  })

  it('falls back to the curated id when nothing in the family is live, or no list', () => {
    expect(resolveCuratedModel('claude-sonnet-4-6', [{ id: 'gpt-5', label: '' }])).toBe('claude-sonnet-4-6')
    expect(resolveCuratedModel('claude-sonnet-4-6', null)).toBe('claude-sonnet-4-6')
    expect(resolveCuratedModel('claude-sonnet-4-6', [])).toBe('claude-sonnet-4-6')
  })

  it('pickerOptions prefers the live list and always includes the selection', () => {
    expect(pickerOptions('anthropic', null)).toBe(AI_PROVIDER_META.anthropic.models)
    const live = [{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }]
    expect(pickerOptions('anthropic', live, 'claude-sonnet-5')).toEqual(live)
    expect(pickerOptions('anthropic', live, 'my-custom-id')).toEqual([...live, { id: 'my-custom-id', label: 'my-custom-id' }])
  })
})
