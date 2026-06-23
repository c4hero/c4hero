import { create } from 'zustand'
import { isRecord } from '@/lib/guards'
import { readJSON, writeJSON } from '@/lib/safeStorage'

// ─── Types ──────────────────────────────────────────────────────────

/** Anthropic models offered for BYOK use. Defaults to the most capable. */
export type AiModel = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'

export const AI_MODELS: ReadonlyArray<{ id: AiModel; label: string; blurb: string }> = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', blurb: 'Most capable — best diagrams' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', blurb: 'Faster, cheaper, very capable' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', blurb: 'Fastest, lowest cost' },
]

export interface AiSettings {
  /** User's Anthropic API key. Stored only in this browser's localStorage and
   *  used solely for direct browser→api.anthropic.com calls. Never sent elsewhere. */
  apiKey: string
  model: AiModel
  /** Master toggle. When false, all AI UI is hidden. */
  enabled: boolean
}

const DEFAULTS: AiSettings = {
  apiKey: '',
  model: 'claude-opus-4-8',
  enabled: true,
}

// Stored separately from the main settings file so the key never rides along
// with workspace/theme settings that might be shared or exported.
const STORAGE_KEY = 'c4hero.ai.json'

const MODEL_IDS: ReadonlySet<string> = new Set<AiModel>(AI_MODELS.map((m) => m.id))

function isAiModel(value: unknown): value is AiModel {
  return typeof value === 'string' && MODEL_IDS.has(value)
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const source = isRecord(value) ? value : {}
  return {
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : DEFAULTS.apiKey,
    model: isAiModel(source.model) ? source.model : DEFAULTS.model,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULTS.enabled,
  }
}

/** True when the settings are sufficient to make AI calls. */
export function isAiReady(settings: Pick<AiSettings, 'apiKey' | 'enabled'>): boolean {
  return settings.enabled && settings.apiKey.trim().length > 0
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
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  ...load(),

  update: (patch) => {
    set(patch)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- exclude `update` from persisted settings
    const { update: _, ...rest } = get()
    persist(rest as AiSettings)
  },
}))
