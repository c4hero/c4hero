// Live model lists per provider (TEA-249). Sits beside the settings store:
// settings hold the user's choice, this holds what the provider says exists.
// Cold start reads the 24h localStorage cache; `refresh` fetches when a key is
// present and the cache is stale (or `force`). Failures fall back to the
// curated list silently — the picker is never empty and chat never waits.

import { create } from 'zustand'
import type { AiModelOption, AiProviderId } from '@/lib/ai/providerMeta'
import { AI_PROVIDER_IDS } from '@/lib/ai/providerMeta'
import {
  fetchProviderModels, readCachedModels, writeCachedModels, ModelListError,
} from '@/lib/ai/modelCatalog'
import { createLogger } from '@/lib/logger'

const log = createLogger('ai/models')

export type ModelListStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProviderModelList {
  models: AiModelOption[]
  fetchedAt: number
  source: 'fetched' | 'cache'
}

interface AiModelsState {
  lists: Partial<Record<AiProviderId, ProviderModelList>>
  status: Record<AiProviderId, ModelListStatus>
  error: Partial<Record<AiProviderId, string>>
  /** Load the list for `provider` using `apiKey`. Serves the cache when fresh,
   *  otherwise fetches. No-op without a key. Resolves when settled; never throws. */
  refresh: (provider: AiProviderId, apiKey: string, opts?: { force?: boolean }) => Promise<void>
  /** Drop an in-memory list (e.g. the key was cleared). */
  forget: (provider: AiProviderId) => void
}

const inflight = new Map<string, Promise<void>>()

export const useAiModelsStore = create<AiModelsState>((set) => ({
  lists: {},
  status: AI_PROVIDER_IDS.reduce((acc, id) => { acc[id] = 'idle'; return acc }, {} as Record<AiProviderId, ModelListStatus>),
  error: {},

  refresh: (provider, apiKey, opts) => {
    const key = apiKey.trim()
    if (!key) return Promise.resolve()

    const cached = readCachedModels(provider, key)
    if (cached && !opts?.force) {
      set((s) => ({
        lists: { ...s.lists, [provider]: { models: cached.models, fetchedAt: cached.fetchedAt, source: 'cache' } },
        status: { ...s.status, [provider]: 'ready' },
        error: { ...s.error, [provider]: undefined },
      }))
      return Promise.resolve()
    }

    // One fetch per provider+key at a time; concurrent callers share it.
    const inflightKey = `${provider}:${key.length}:${key.slice(-4)}`
    const existing = inflight.get(inflightKey)
    if (existing) return existing

    set((s) => ({ status: { ...s.status, [provider]: 'loading' } }))
    const run = (async () => {
      try {
        const models = await fetchProviderModels(provider, key)
        const entry = writeCachedModels(provider, key, models)
        set((s) => ({
          lists: { ...s.lists, [provider]: { models, fetchedAt: entry.fetchedAt, source: 'fetched' } },
          status: { ...s.status, [provider]: 'ready' },
          error: { ...s.error, [provider]: undefined },
        }))
      } catch (err) {
        const message = err instanceof ModelListError ? err.message : 'Could not load the model list'
        log.warn('Model list fetch failed; using curated list', { provider, message })
        // Keep whatever list we already had (a stale cache beats nothing).
        set((s) => ({ status: { ...s.status, [provider]: 'error' }, error: { ...s.error, [provider]: message } }))
      } finally {
        inflight.delete(inflightKey)
      }
    })()
    inflight.set(inflightKey, run)
    return run
  },

  forget: (provider) => set((s) => {
    const lists = { ...s.lists }
    delete lists[provider]
    return { lists, status: { ...s.status, [provider]: 'idle' }, error: { ...s.error, [provider]: undefined } }
  }),
}))

/** Live models for a provider, or null when only the curated list is known. */
export function liveModels(provider: AiProviderId): AiModelOption[] | null {
  return useAiModelsStore.getState().lists[provider]?.models ?? null
}
