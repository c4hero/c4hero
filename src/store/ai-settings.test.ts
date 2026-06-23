import { describe, it, expect } from 'vitest'
import { normalizeAiSettings, isAiReady } from './ai-settings'

describe('normalizeAiSettings', () => {
  it('fills defaults for missing/invalid fields', () => {
    expect(normalizeAiSettings(undefined)).toEqual({
      apiKey: '', model: 'claude-opus-4-8', enabled: true,
    })
    expect(normalizeAiSettings({ model: 'bogus', enabled: 'yes', apiKey: 5 })).toEqual({
      apiKey: '', model: 'claude-opus-4-8', enabled: true,
    })
  })

  it('preserves valid fields', () => {
    expect(normalizeAiSettings({ apiKey: 'sk-x', model: 'claude-haiku-4-5', enabled: false })).toEqual({
      apiKey: 'sk-x', model: 'claude-haiku-4-5', enabled: false,
    })
  })
})

describe('isAiReady', () => {
  it('requires enabled and a non-empty key', () => {
    expect(isAiReady({ enabled: true, apiKey: 'sk-x' })).toBe(true)
    expect(isAiReady({ enabled: false, apiKey: 'sk-x' })).toBe(false)
    expect(isAiReady({ enabled: true, apiKey: '   ' })).toBe(false)
  })
})
