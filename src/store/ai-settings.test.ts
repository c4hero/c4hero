import { describe, it, expect } from 'vitest'
import { normalizeAiSettings, isAiReady, activeAiConfig } from './ai-settings'

describe('normalizeAiSettings', () => {
  it('fills defaults for empty input', () => {
    const s = normalizeAiSettings(undefined)
    expect(s.enabled).toBe(true)
    expect(s.provider).toBe('anthropic')
    expect(s.apiKeys).toEqual({ anthropic: '', openai: '', gemini: '' })
    expect(s.models.anthropic).toBe('claude-opus-4-8')
    expect(s.models.openai).toBe('gpt-5')
    expect(s.models.gemini).toBe('gemini-2.5-pro')
    expect(s.placement).toBe('docked')
  })

  it('preserves a valid placement and rejects an invalid one', () => {
    expect(normalizeAiSettings({ placement: 'center' }).placement).toBe('center')
    expect(normalizeAiSettings({ placement: 'sideways' }).placement).toBe('docked')
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
    expect(activeAiConfig(s).model).toBe('gpt-5')
  })
})

describe('isAiReady', () => {
  it('requires enabled and a non-empty key for the active provider', () => {
    const base = normalizeAiSettings({ provider: 'anthropic', apiKeys: { anthropic: 'sk-x', openai: '' } })
    expect(isAiReady(base)).toBe(true)
    expect(isAiReady({ ...base, enabled: false })).toBe(false)
    // Switching to a provider with no key makes it not-ready.
    expect(isAiReady({ ...base, provider: 'openai' })).toBe(false)
  })
})
