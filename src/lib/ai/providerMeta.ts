// Lightweight provider metadata — no network code, so the settings store and
// settings UI can import it without pulling in any provider implementation.
// The actual fetch-based factories live in ./providers and are loaded lazily
// with the AI panel. Adding a provider = add an entry here, an impl in
// ./providers, and a case in ./providers/index.ts.

export type AiProviderId = 'anthropic' | 'openai' | 'gemini'

export interface AiModelOption {
  id: string
  label: string
}

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  /** Suggested models shown in the picker. The model field is free text, so
   *  users can also type any model id the provider supports. */
  models: AiModelOption[]
  defaultModel: string
  /** Cheapest capable tier for this provider. Mechanical drafts (auto-describe,
   *  technology drafts, tag suggestions, single-field rewrites) route here when
   *  per-task routing is on, reserving the user's selected model for the quality
   *  work (review, interview plan, generate). Equal to defaultModel for providers
   *  whose default already is the cheap tier. */
  cheapModel: string
  keyLabel: string
  keyPlaceholder: string
  keyHelpUrl: string
  /** Host the browser connects to directly (shown in the privacy note). Must
   *  also be listed in BOTH static CSP connect-src copies — index.html and
   *  vercel.json — or the browser silently blocks the provider (guarded by
   *  providerMeta.csp.test.ts). */
  endpointHost: string
}

export const AI_PROVIDER_META: Record<AiProviderId, AiProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — faster, cheaper' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' },
    ],
    // Balanced mid-tier is the recommended default — c4hero's structured tasks
    // don't need a frontier model, and BYOK users care about cost. Opus stays
    // selectable for anyone who wants maximum capability.
    defaultModel: 'claude-sonnet-4-6',
    cheapModel: 'claude-haiku-4-5',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-…',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    endpointHost: 'api.anthropic.com',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-5', label: 'GPT-5 — most capable' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini — faster, cheaper' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
    defaultModel: 'gpt-5-mini',
    cheapModel: 'gpt-5-mini',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    endpointHost: 'api.openai.com',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — most capable' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — faster, cheaper' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    defaultModel: 'gemini-2.5-flash',
    cheapModel: 'gemini-2.5-flash',
    keyLabel: 'Google AI API key',
    keyPlaceholder: 'AIza…',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    endpointHost: 'generativelanguage.googleapis.com',
  },
}

// Derived from the metadata map (which is the single source of truth) so adding a
// provider in one place can't drift from the id list. Object.keys preserves the
// declaration order of AI_PROVIDER_META.
export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDER_META) as AiProviderId[]

export function getProviderMeta(id: AiProviderId): AiProviderMeta {
  return AI_PROVIDER_META[id]
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDER_IDS.includes(value as AiProviderId)
}
