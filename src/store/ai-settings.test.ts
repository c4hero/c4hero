import { describe, it, expect } from 'vitest'
import { normalizeAiSettings, isAiReady, activeAiConfig, draftModel } from './ai-settings'

describe('normalizeAiSettings', () => {
  it('fills defaults for empty input', () => {
    const s = normalizeAiSettings(undefined)
    expect(s.enabled).toBe(true)
    expect(s.provider).toBe('anthropic')
    expect(s.apiKeys).toEqual({ anthropic: '', openai: '', gemini: '' })
    expect(s.models.anthropic).toBe('claude-sonnet-4-6')
    expect(s.models.openai).toBe('gpt-5-mini')
    expect(s.models.gemini).toBe('gemini-2.5-flash')
    expect(s.enabled).toBe(true)
    expect(s.routeCheapDrafts).toBe(true)
  })

  it('preserves routeCheapDrafts when set to false', () => {
    expect(normalizeAiSettings({ routeCheapDrafts: false }).routeCheapDrafts).toBe(false)
    expect(normalizeAiSettings({ routeCheapDrafts: 'nope' }).routeCheapDrafts).toBe(true)
  })

  it('preserves the launcher (enabled) flag when set to false', () => {
    expect(normalizeAiSettings({ enabled: false }).enabled).toBe(false)
    expect(normalizeAiSettings({ enabled: 'nope' }).enabled).toBe(true)
  })

  it('preserves valid per-provider values', () => {
    const s = normalizeAiSettings({
      enabled: false,
      provider: 'openai',
      apiKeys: { anthropic: 'sk-ant', openai: 'sk-oai', gemini: 'AIzaX' },
      models: { anthropic: 'claude-haiku-4-5', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' },
    })
    expect(s.enabled).toBe(false)
    expect(s.provider).toBe('openai')
    expect(s.apiKeys).toEqual({ anthropic: 'sk-ant', openai: 'sk-oai', gemini: 'AIzaX' })
    expect(s.models).toEqual({ anthropic: 'claude-haiku-4-5', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' })
  })

  it('rejects an unknown provider', () => {
    expect(normalizeAiSettings({ provider: 'bogus' }).provider).toBe('anthropic')
  })

  it('migrates the old single-provider (apiKey/model) shape to Anthropic', () => {
    const s = normalizeAiSettings({ apiKey: 'sk-old', model: 'claude-sonnet-4-6', enabled: true })
    expect(s.apiKeys.anthropic).toBe('sk-old')
    expect(s.models.anthropic).toBe('claude-sonnet-4-6')
    expect(s.provider).toBe('anthropic')
  })

  it('still migrates a legacy top-level model when a partial models object is present', () => {
    // A partial write left `models` present but without an anthropic entry; the
    // legacy top-level `model` must not be shadowed and reset to the default.
    const s = normalizeAiSettings({ model: 'claude-opus-4-8', models: { openai: 'gpt-5' } })
    expect(s.models.anthropic).toBe('claude-opus-4-8')
    expect(s.models.openai).toBe('gpt-5')
  })

  it('prefers an explicit models.anthropic over the legacy top-level model', () => {
    const s = normalizeAiSettings({ model: 'claude-opus-4-8', models: { anthropic: 'claude-haiku-4-5' } })
    expect(s.models.anthropic).toBe('claude-haiku-4-5')
  })
})

describe('activeAiConfig', () => {
  it('resolves the active provider key and model', () => {
    const s = normalizeAiSettings({
      provider: 'openai',
      apiKeys: { anthropic: 'a', openai: 'o' },
      models: { anthropic: 'claude-opus-4-8', openai: 'gpt-5-mini' },
    })
    expect(activeAiConfig(s)).toEqual({ provider: 'openai', apiKey: 'o', model: 'gpt-5-mini' })
  })

  it('falls back to the provider default model when the stored model is blank', () => {
    const s = normalizeAiSettings({ provider: 'openai', apiKeys: { openai: 'o' }, models: { openai: '' } })
    expect(activeAiConfig(s).model).toBe('gpt-5-mini')
  })
})

describe('draftModel (per-task routing, TEA-48)', () => {
  it('routes drafts to the cheap tier when a capable model is selected', () => {
    const s = normalizeAiSettings({ provider: 'anthropic', apiKeys: { anthropic: 'a' }, models: { anthropic: 'claude-opus-4-8' } })
    expect(draftModel(s)).toBe('claude-haiku-4-5')
    expect(activeAiConfig(s).model).toBe('claude-opus-4-8')
  })

  it('equals the selected model when routing is off', () => {
    const s = normalizeAiSettings({ provider: 'anthropic', apiKeys: { anthropic: 'a' }, models: { anthropic: 'claude-opus-4-8' }, routeCheapDrafts: false })
    expect(draftModel(s)).toBe('claude-opus-4-8')
  })

  it('equals the selected model when the selection already is the cheap tier', () => {
    const s = normalizeAiSettings({ provider: 'openai', apiKeys: { openai: 'o' }, models: { openai: 'gpt-5-mini' } })
    expect(draftModel(s)).toBe('gpt-5-mini')
  })
})

describe('isAiReady', () => {
  it('requires a non-empty key for the active provider, independent of the launcher toggle', () => {
    const base = normalizeAiSettings({ provider: 'anthropic', apiKeys: { anthropic: 'sk-x', openai: '' } })
    expect(isAiReady(base)).toBe(true)
    // `enabled` only hides the launcher button; AI stays usable from the palette.
    expect(isAiReady({ ...base, enabled: false })).toBe(true)
    // Switching to a provider with no key makes it not-ready.
    expect(isAiReady({ ...base, provider: 'openai' })).toBe(false)
  })
})
