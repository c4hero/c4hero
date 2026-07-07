import { useMemo } from 'react'
import { create } from 'zustand'
import { isRecord } from '@/lib/guards'
import { readJSON, writeJSON } from '@/lib/safeStorage'
import { createProvider, type AiProvider } from '@/lib/ai'
import {
  AI_PROVIDER_IDS, AI_PROVIDER_META, isAiProviderId, type AiProviderId,
} from '@/lib/ai/providerMeta'

// ─── Types ──────────────────────────────────────────────────────────

export interface AiSettings {
  /** Whether the AI assistant launcher (the spark button on the tool rail) is
   *  shown. When false, the launcher is hidden but the assistant is still
   *  reachable from the command palette (I) and the app menu — it's a visibility
   *  preference, not a kill switch. */
  enabled: boolean
  /** Currently selected provider. */
  provider: AiProviderId
  /** API key per provider — keeping both lets users switch without re-entering.
   *  Stored only in this browser; sent only to the matching provider's host. */
  apiKeys: Record<AiProviderId, string>
  /** Model id per provider (free text; suggestions come from provider metadata). */
  models: Record<AiProviderId, string>
  /** Route mechanical drafts (auto-describe, technology drafts, tag/field
   *  suggestions) to the provider's cheap tier, reserving the selected model for
   *  review / interview / generate. On by default; a BYOK cost saver. */
  routeCheapDrafts: boolean
}

function emptyKeys(): Record<AiProviderId, string> {
  return AI_PROVIDER_IDS.reduce((acc, id) => { acc[id] = ''; return acc }, {} as Record<AiProviderId, string>)
}

function defaultModels(): Record<AiProviderId, string> {
  return AI_PROVIDER_IDS.reduce((acc, id) => { acc[id] = AI_PROVIDER_META[id].defaultModel; return acc }, {} as Record<AiProviderId, string>)
}

const DEFAULTS: AiSettings = {
  enabled: true,
  provider: 'anthropic',
  apiKeys: emptyKeys(),
  models: defaultModels(),
  routeCheapDrafts: true,
}

const STORAGE_KEY = 'c4hero.ai.json'

function readStringMap(source: Record<string, unknown>, key: string, fallback: Record<AiProviderId, string>): Record<AiProviderId, string> {
  const raw = isRecord(source[key]) ? (source[key] as Record<string, unknown>) : {}
  return AI_PROVIDER_IDS.reduce((acc, id) => {
    acc[id] = typeof raw[id] === 'string' ? (raw[id] as string) : fallback[id]
    return acc
  }, {} as Record<AiProviderId, string>)
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const source = isRecord(value) ? value : {}

  const apiKeys = readStringMap(source, 'apiKeys', emptyKeys())
  const models = readStringMap(source, 'models', defaultModels())

  // Back-compat: migrate the original single-provider (Anthropic-only) shape
  // where the key/model lived at the top level as `apiKey` / `model`. Check the
  // specific stored anthropic field (not the whole `models` object) — readStringMap
  // already defaulted models.anthropic, so a partial `models` object must not
  // shadow a legacy top-level `model` and silently reset the user's choice.
  const rawModels = isRecord(source.models) ? (source.models as Record<string, unknown>) : {}
  if (typeof source.apiKey === 'string' && !apiKeys.anthropic) apiKeys.anthropic = source.apiKey
  if (typeof source.model === 'string' && typeof rawModels.anthropic !== 'string') models.anthropic = source.model

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULTS.enabled,
    provider: isAiProviderId(source.provider) ? source.provider : DEFAULTS.provider,
    apiKeys,
    models,
    routeCheapDrafts: typeof source.routeCheapDrafts === 'boolean' ? source.routeCheapDrafts : DEFAULTS.routeCheapDrafts,
  }
}

/** Resolved config for the active provider: its id, key, and model. */
export function activeAiConfig(settings: AiSettings): { provider: AiProviderId; apiKey: string; model: string } {
  return {
    provider: settings.provider,
    apiKey: settings.apiKeys[settings.provider] ?? '',
    model: settings.models[settings.provider] || AI_PROVIDER_META[settings.provider].defaultModel,
  }
}

/** The model mechanical drafts should use: the provider's cheap tier when
 *  routing is on, else the selected model. Returns the SAME string as
 *  `activeAiConfig().model` when routing is off or the cheap tier already equals
 *  the selection — callers can compare to decide whether a second provider is
 *  even needed. */
export function draftModel(settings: AiSettings): string {
  const { model } = activeAiConfig(settings)
  if (!settings.routeCheapDrafts) return model
  return AI_PROVIDER_META[settings.provider].cheapModel || model
}

/** True when the active provider has a non-empty key — i.e. AI can actually run.
 *  Independent of `enabled` (which only hides/shows the launcher): the assistant
 *  works from the command palette even when its rail button is hidden. */
export function isAiReady(settings: AiSettings): boolean {
  return (settings.apiKeys[settings.provider]?.trim().length ?? 0) > 0
}

// ─── Persistence ────────────────────────────────────────────────────

function load(): AiSettings {
  const raw = readJSON<unknown>(STORAGE_KEY, (v): v is unknown => v !== null && v !== undefined)
  return normalizeAiSettings(raw)
}

function persist(settings: AiSettings) {
  writeJSON(STORAGE_KEY, settings)
}

// ─── Store ──────────────────────────────────────────────────────────

interface AiSettingsState extends AiSettings {
  update: (patch: Partial<AiSettings>) => void
  /** Set the active provider's API key. */
  setApiKey: (key: string) => void
  /** Set the active provider's model. */
  setModel: (model: string) => void
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  ...load(),

  update: (patch) => {
    set(patch)
    persistFrom(get)
  },

  setApiKey: (key) => {
    const s = get()
    set({ apiKeys: { ...s.apiKeys, [s.provider]: key } })
    persistFrom(get)
  },

  setModel: (model) => {
    const s = get()
    set({ models: { ...s.models, [s.provider]: model } })
    persistFrom(get)
  },
}))

function persistFrom(get: () => AiSettingsState) {
  const { update: _u, setApiKey: _k, setModel: _m, ...rest } = get()
  void _u; void _k; void _m
  persist(rest as AiSettings)
}

/** Build an AI provider from the current settings — null until a key is set and
 *  AI is enabled. Returns the resolved config too, for BYOK gating UI. The single
 *  source of truth for provider construction across the assistant surfaces. */
export function useAiProvider(): {
  ready: boolean
  hasKey: boolean
  provider: AiProvider | null
  /** Provider for mechanical drafts — the cheap tier when per-task routing is on,
   *  else the same instance as `provider`. Callers route auto-describe / tech
   *  drafts / tag & field suggestions here. */
  draftProvider: AiProvider | null
  providerId: AiProviderId
  apiKey: string
  model: string
} {
  const settings = useAiSettingsStore()
  const ready = isAiReady(settings)
  const { provider: providerId, apiKey, model } = activeAiConfig(settings)
  const draft = draftModel(settings)
  const provider = useMemo(
    () => (ready ? createProvider(providerId, { apiKey, model }) : null),
    [ready, providerId, apiKey, model],
  )
  // Reuse the main provider instance when the draft model matches the selection
  // (routing off, or the cheap tier is already what's selected) — no need for a
  // second client.
  const draftProvider = useMemo(
    () => (!ready ? null : draft === model ? provider : createProvider(providerId, { apiKey, model: draft })),
    [ready, providerId, apiKey, model, draft, provider],
  )
  return { ready, hasKey: apiKey.trim().length > 0, provider, draftProvider, providerId, apiKey, model }
}
