import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAiModelsStore, liveModels } from './ai-models'
import { writeCachedModels } from '@/lib/ai/modelCatalog'

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('useAiModelsStore.refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    useAiModelsStore.setState({ lists: {}, error: {}, status: { anthropic: 'idle', openai: 'idle', gemini: 'idle' } })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('does nothing without a key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await useAiModelsStore.getState().refresh('anthropic', '   ')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(liveModels('anthropic')).toBeNull()
  })

  it('fetches, stores, and caches the list', async () => {
    const fetchMock = vi.fn(async () => respond({ data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-08-01T00:00:00Z' }] }))
    vi.stubGlobal('fetch', fetchMock)
    await useAiModelsStore.getState().refresh('anthropic', 'sk-ant-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const s = useAiModelsStore.getState()
    expect(s.status.anthropic).toBe('ready')
    expect(s.lists.anthropic?.source).toBe('fetched')
    expect(liveModels('anthropic')?.map((m) => m.id)).toEqual(['claude-sonnet-5'])

    // A second refresh with the same key is served from cache: no fetch.
    useAiModelsStore.setState({ lists: {} })
    await useAiModelsStore.getState().refresh('anthropic', 'sk-ant-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAiModelsStore.getState().lists.anthropic?.source).toBe('cache')

    // force bypasses the cache.
    await useAiModelsStore.getState().refresh('anthropic', 'sk-ant-1', { force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves a warm cache without touching the network', async () => {
    writeCachedModels('openai', 'sk-o', [{ id: 'gpt-5', label: 'gpt-5' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await useAiModelsStore.getState().refresh('openai', 'sk-o')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(liveModels('openai')?.map((m) => m.id)).toEqual(['gpt-5'])
  })

  it('records an error and keeps any previous list on failure', async () => {
    useAiModelsStore.setState({ lists: { gemini: { models: [{ id: 'gemini-2.5-pro', label: 'x' }], fetchedAt: 1, source: 'cache' } } })
    vi.stubGlobal('fetch', vi.fn(async () => respond({ error: { message: 'nope' } }, 403)))
    await useAiModelsStore.getState().refresh('gemini', 'AIza', { force: true })
    const s = useAiModelsStore.getState()
    expect(s.status.gemini).toBe('error')
    expect(s.error.gemini).toMatch(/403/)
    expect(liveModels('gemini')?.map((m) => m.id)).toEqual(['gemini-2.5-pro'])
  })

  it('collapses concurrent refreshes into one fetch', async () => {
    const fetchMock = vi.fn(async () => respond({ data: [{ id: 'gpt-5', created: 1 }] }))
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([
      useAiModelsStore.getState().refresh('openai', 'sk-o', { force: true }),
      useAiModelsStore.getState().refresh('openai', 'sk-o', { force: true }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forget drops the in-memory list', async () => {
    useAiModelsStore.setState({ lists: { openai: { models: [{ id: 'gpt-5', label: 'x' }], fetchedAt: 1, source: 'cache' } }, status: { anthropic: 'idle', openai: 'ready', gemini: 'idle' } })
    useAiModelsStore.getState().forget('openai')
    expect(liveModels('openai')).toBeNull()
    expect(useAiModelsStore.getState().status.openai).toBe('idle')
  })
})
