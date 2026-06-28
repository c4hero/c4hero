import { create } from 'zustand'
import { isRecord } from '@/lib/guards'
import { readJSON, writeJSON } from '@/lib/safeStorage'
import {
  AI_PROVIDER_IDS, AI_PROVIDER_META, isAiProviderId, type AiProviderId,
} from '@/lib/ai/providerMeta'

// ─── Types ──────────────────────────────────────────────────────────

/** Persisted top-left position of the (draggable) assistant panel, in viewport
 *  pixels. `null` means "not yet moved" — the panel sits at its default anchor. */
export interface PanelPos { x: number; y: number }

export interface AiSettings {
  /** Master toggle. When false, all AI UI is hidden. */
  enabled: boolean
  /** Currently selected provider. */
  provider: AiProviderId
  /** API key per provider — keeping both lets users switch without re-entering.
   *  Stored only in this browser; sent only to the matching provider's host. */
  apiKeys: Record<AiProviderId, string>
  /** Model id per provider (free text; suggestions come from provider metadata). */
  models: Record<AiProviderId, string>
  /** Where the user dragged the assistant panel; null until first moved. */
  panelPos: PanelPos | null
  /** Show the AI button in the top bar. When false, the assistant is still
   *  reachable from the command palette. */
  showInTopBar: boolean
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
  panelPos: null,
  showInTopBar: true,
}

function isPanelPos(value: unknown): value is PanelPos {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'
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
    panelPos: isPanelPos(source.panelPos) ? source.panelPos : DEFAULTS.panelPos,
    showInTopBar: typeof source.showInTopBar === 'boolean' ? source.showInTopBar : DEFAULTS.showInTopBar,
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

/** True when AI is enabled and the active provider has a non-empty key. */
export function isAiReady(settings: AiSettings): boolean {
  return settings.enabled && (settings.apiKeys[settings.provider]?.trim().length ?? 0) > 0
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
