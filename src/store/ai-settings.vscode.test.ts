import { beforeEach, expect, it, vi } from 'vitest'
const secrets = vi.hoisted(() => vi.fn())
vi.mock('@/lib/host', () => ({ isVsCodeHost: () => true, setVsCodeSecret: secrets }))
beforeEach(() => { vi.resetModules(); localStorage.clear(); secrets.mockClear() })
it('loads extension keys only from the host and never persists them in webview storage', async () => {
  localStorage.setItem('c4hero.ai.json', JSON.stringify({ apiKeys: { anthropic: 'old-browser-value' } }))
  const { useAiSettingsStore: store } = await import('./ai-settings')
  expect(store.getState().apiKeys.anthropic).toBe('')
  store.getState().setApiKey('test-secret-only')
  expect(secrets).toHaveBeenCalledWith('anthropic', 'test-secret-only')
  expect(store.getState().apiKeys.anthropic).toBe('test-secret-only')
  store.getState().setModel('test-model')
  const stored = localStorage.getItem('c4hero.ai.json')!
  expect(stored).not.toContain('test-secret-only')
  expect(stored).not.toContain('old-browser-value')
  store.getState().setApiKey('')
  expect(secrets).toHaveBeenLastCalledWith('anthropic', '')
})
