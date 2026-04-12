import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAIConfig, saveAIConfig, clearAIConfig } from './ai'

const KEY = 'c4hero_ai_config'

describe('AI config storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getAIConfig', () => {
    it('returns null when nothing is stored', () => {
      expect(getAIConfig()).toBeNull()
    })

    it('returns a valid anthropic config', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-abc' }))
      expect(getAIConfig()).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-abc' })
    })

    it('returns a valid openai config', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'openai', apiKey: 'sk-xyz' }))
      expect(getAIConfig()).toEqual({ provider: 'openai', apiKey: 'sk-xyz' })
    })

    it('returns null for invalid provider', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'bogus', apiKey: 'sk-xyz' }))
      expect(getAIConfig()).toBeNull()
    })

    it('returns null for missing apiKey', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'openai' }))
      expect(getAIConfig()).toBeNull()
    })

    it('returns null for empty-string apiKey', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'openai', apiKey: '' }))
      expect(getAIConfig()).toBeNull()
    })

    it('returns null for non-string apiKey', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ provider: 'openai', apiKey: 12345 }))
      expect(getAIConfig()).toBeNull()
    })

    it('returns null for malformed JSON', () => {
      sessionStorage.setItem(KEY, '{not valid json')
      expect(getAIConfig()).toBeNull()
    })

    it('returns null when stored value is null', () => {
      sessionStorage.setItem(KEY, 'null')
      expect(getAIConfig()).toBeNull()
    })

    it('returns null when stored value is a primitive', () => {
      sessionStorage.setItem(KEY, '"just-a-string"')
      expect(getAIConfig()).toBeNull()
    })

    it('returns null when storage read throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      expect(getAIConfig()).toBeNull()
    })
  })

  describe('saveAIConfig', () => {
    it('persists config to sessionStorage as JSON', () => {
      saveAIConfig({ provider: 'anthropic', apiKey: 'sk-ant-key' })
      const raw = sessionStorage.getItem(KEY)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!)).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-key' })
    })

    it('overwrites any previous config', () => {
      saveAIConfig({ provider: 'openai', apiKey: 'first' })
      saveAIConfig({ provider: 'anthropic', apiKey: 'second' })
      expect(getAIConfig()).toEqual({ provider: 'anthropic', apiKey: 'second' })
    })
  })

  describe('clearAIConfig', () => {
    it('removes the stored config', () => {
      saveAIConfig({ provider: 'openai', apiKey: 'sk-xyz' })
      expect(getAIConfig()).not.toBeNull()
      clearAIConfig()
      expect(getAIConfig()).toBeNull()
    })

    it('is a no-op when no config is stored', () => {
      clearAIConfig()
      expect(getAIConfig()).toBeNull()
    })
  })

  describe('round-trip', () => {
    it('save → get returns the same config', () => {
      const cfg = { provider: 'openai' as const, apiKey: 'sk-roundtrip' }
      saveAIConfig(cfg)
      expect(getAIConfig()).toEqual(cfg)
    })
  })
})
