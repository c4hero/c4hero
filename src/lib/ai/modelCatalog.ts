// Live model catalog (TEA-249): ask each provider which models the user's key
// can actually use, instead of trusting the curated list in providerMeta.ts
// (which goes stale between releases). Pure: the fetch is injectable, parsing
// and ranking are plain functions, and the cache is a small localStorage blob.
//
// Every list endpoint is on a host already in the CSP connect-src allowlist
// and takes the same BYOK key the chat calls use, so no new permissions.

import { AI_PROVIDER_META, type AiModelOption, type AiProviderId } from './providerMeta'
import { readJSON, writeJSON } from '@/lib/safeStorage'
import { isRecord } from '@/lib/guards'
import { createLogger } from '@/lib/logger'

const log = createLogger('ai/models')

export const MODEL_CACHE_KEY = 'c4hero.ai.models.json'
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ─── Per-provider list endpoints ─────────────────────────────────────

const LIST_URLS: Record<AiProviderId, string> = {
  anthropic: 'https://api.anthropic.com/v1/models?limit=100',
  openai: 'https://api.openai.com/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
}

function listHeaders(provider: AiProviderId, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    case 'openai':
      return { authorization: `Bearer ${apiKey}` }
    case 'gemini':
      return { 'x-goog-api-key': apiKey }
  }
}

// ─── Parsing + filtering ─────────────────────────────────────────────

/** Anthropic: `{ data: [{ id, display_name, created_at }] }`, every entry is a
 *  chat model. Newest first. */
export function parseAnthropicModels(body: unknown): AiModelOption[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return []
  const rows = body.data.flatMap((row): Array<AiModelOption & { created: number }> => {
    if (!isRecord(row) || typeof row.id !== 'string') return []
    const label = typeof row.display_name === 'string' && row.display_name ? row.display_name : row.id
    const created = typeof row.created_at === 'string' ? Date.parse(row.created_at) || 0 : 0
    return [{ id: row.id, label, created }]
  })
  rows.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
  return rows.map(({ id, label }) => ({ id, label }))
}

// OpenAI's list is dominated by embeddings, audio, image and moderation models.
// Keep the chat families, drop everything that can't take a chat completion.
const OPENAI_CHAT_PREFIX = /^(gpt-|o\d|chatgpt-)/
const OPENAI_NOT_CHAT = /(embedding|audio|realtime|tts|transcribe|whisper|image|dall-e|moderation|-search|instruct|computer-use|codex|deep-research|-pro\b)/
// Dated snapshots (`gpt-4o-2024-08-06`) duplicate their alias; hide them when
// the alias itself is in the list.
const DATED_SNAPSHOT = /-\d{4}-\d{2}-\d{2}$/

export function parseOpenAiModels(body: unknown): AiModelOption[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return []
  const rows = body.data.flatMap((row): Array<{ id: string; created: number }> => {
    if (!isRecord(row) || typeof row.id !== 'string') return []
    const id = row.id
    if (!OPENAI_CHAT_PREFIX.test(id) || OPENAI_NOT_CHAT.test(id)) return []
    return [{ id, created: typeof row.created === 'number' ? row.created : 0 }]
  })
  const ids = new Set(rows.map((r) => r.id))
  const kept = rows.filter((r) => !(DATED_SNAPSHOT.test(r.id) && ids.has(r.id.replace(DATED_SNAPSHOT, ''))))
  kept.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
  return kept.map(({ id }) => ({ id, label: id }))
}

// Gemini: `{ models: [{ name: 'models/gemini-2.5-pro', displayName,
// supportedGenerationMethods }] }`. Keep text generators, drop embedding /
// image / audio / live variants that share the prefix.
const GEMINI_NOT_CHAT = /(embedding|imagen|image|tts|audio|live|aqa|veo|learnlm)/

export function parseGeminiModels(body: unknown): AiModelOption[] {
  if (!isRecord(body) || !Array.isArray(body.models)) return []
  const rows = body.models.flatMap((row): AiModelOption[] => {
    if (!isRecord(row) || typeof row.name !== 'string') return []
    const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : []
    if (!methods.includes('generateContent')) return []
    const id = row.name.replace(/^models\//, '')
    if (!id.startsWith('gemini') || GEMINI_NOT_CHAT.test(id)) return []
    const label = typeof row.displayName === 'string' && row.displayName ? row.displayName : id
    return [{ id, label }]
  })
  // Stable releases before previews/experiments; within a group, higher version
  // first (string compare on the numeric segment is good enough for x.y ids).
  const rank = (id: string) => (/(preview|exp|latest)/.test(id) ? 1 : 0)
  rows.sort((a, b) => rank(a.id) - rank(b.id) || b.id.localeCompare(a.id, undefined, { numeric: true }))
  return rows
}

export function parseProviderModels(provider: AiProviderId, body: unknown): AiModelOption[] {
  switch (provider) {
    case 'anthropic': return parseAnthropicModels(body)
    case 'openai': return parseOpenAiModels(body)
    case 'gemini': return parseGeminiModels(body)
  }
}

// ─── Fetch ───────────────────────────────────────────────────────────

export class ModelListError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ModelListError'
    this.status = status
  }
}

/** Fetch the live model list. Throws ModelListError on any failure — callers
 *  fall back to the curated list and never block chat on this. */
export async function fetchProviderModels(
  provider: AiProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AiModelOption[]> {
  let res: Response
  try {
    res = await fetchImpl(LIST_URLS[provider], { method: 'GET', headers: listHeaders(provider, apiKey) })
  } catch {
    throw new ModelListError(`Could not reach ${AI_PROVIDER_META[provider].endpointHost}`)
  }
  if (!res.ok) throw new ModelListError(`Model list request failed (${res.status})`, res.status)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ModelListError('Malformed model list response')
  }
  const models = parseProviderModels(provider, body)
  if (models.length === 0) throw new ModelListError('The provider returned no chat models')
  return models
}

// ─── Cache ───────────────────────────────────────────────────────────

export interface CachedModelList {
  models: AiModelOption[]
  fetchedAt: number
  /** Fingerprint of the key the list was fetched with — a different key may
   *  see a different set of models, so it invalidates the cache. */
  keyFingerprint: string
}

type ModelCache = Partial<Record<AiProviderId, CachedModelList>>

/** Non-reversible short fingerprint of a key. Only for cache invalidation;
 *  the key itself is never written by this module. */
export function keyFingerprint(apiKey: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < apiKey.length; i++) {
    h ^= apiKey.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${apiKey.length}:${h.toString(16)}`
}

function isModelOption(v: unknown): v is AiModelOption {
  return isRecord(v) && typeof v.id === 'string' && typeof v.label === 'string'
}

function isCachedList(v: unknown): v is CachedModelList {
  return isRecord(v)
    && Array.isArray(v.models) && v.models.every(isModelOption)
    && typeof v.fetchedAt === 'number'
    && typeof v.keyFingerprint === 'string'
}

function readCache(): ModelCache {
  const raw = readJSON<unknown>(MODEL_CACHE_KEY, (v): v is unknown => isRecord(v))
  if (!isRecord(raw)) return {}
  const out: ModelCache = {}
  for (const id of Object.keys(AI_PROVIDER_META) as AiProviderId[]) {
    if (isCachedList(raw[id])) out[id] = raw[id]
  }
  return out
}

export function readCachedModels(provider: AiProviderId, apiKey: string, now = Date.now()): CachedModelList | null {
  const entry = readCache()[provider]
  if (!entry) return null
  if (entry.keyFingerprint !== keyFingerprint(apiKey)) return null
  if (now - entry.fetchedAt > MODEL_CACHE_TTL_MS) return null
  return entry
}

export function writeCachedModels(provider: AiProviderId, apiKey: string, models: AiModelOption[], now = Date.now()): CachedModelList {
  const entry: CachedModelList = { models, fetchedAt: now, keyFingerprint: keyFingerprint(apiKey) }
  writeJSON(MODEL_CACHE_KEY, { ...readCache(), [provider]: entry })
  return entry
}

export function clearCachedModels(provider?: AiProviderId): void {
  if (!provider) { writeJSON(MODEL_CACHE_KEY, {}); return }
  const cache = readCache()
  delete cache[provider]
  writeJSON(MODEL_CACHE_KEY, cache)
}

// ─── Resolution against a live list ──────────────────────────────────

/** Strip the version/date tail from a model id so `claude-sonnet-4-6` and
 *  `claude-sonnet-5` share a family (`claude-sonnet`). */
export function modelFamily(id: string): string {
  return id
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')       // dated snapshot
    .replace(/(-\d+(\.\d+)?)+$/, '')          // trailing -4-6 / -2.5
    .replace(/-(latest|preview|exp)$/, '')
    .replace(/-\d+(\.\d+)?-/, '-')            // gemini-2.5-flash -> gemini-flash
}

/** Pick the id to actually send for a curated default/cheap id: itself when
 *  the live list has it, else the newest live model of the same family, else
 *  the curated id unchanged (providers accept aliases). User-typed ids are
 *  never rewritten — pass only curated ids here. */
export function resolveCuratedModel(id: string, live: AiModelOption[] | null | undefined): string {
  if (!live || live.length === 0) return id
  if (live.some((m) => m.id === id)) return id
  const family = modelFamily(id)
  const match = live.find((m) => modelFamily(m.id) === family)
  if (match) {
    log.info('Curated model id not offered by provider; using same-family model', { curated: id, resolved: match.id })
    return match.id
  }
  return id
}

/** The options to show in the picker: the live list when we have one, else
 *  the curated list. The user's current selection is always present so the
 *  picker never shows "nothing selected" for a hand-typed or retired id. */
export function pickerOptions(provider: AiProviderId, live: AiModelOption[] | null | undefined, selected?: string): AiModelOption[] {
  const base = live && live.length > 0 ? live : AI_PROVIDER_META[provider].models
  if (selected && !base.some((m) => m.id === selected)) {
    return [...base, { id: selected, label: selected }]
  }
  return base
}
