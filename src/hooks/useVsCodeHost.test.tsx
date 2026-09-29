import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { HostToWebviewMessage } from '@/lib/host/protocol'
const bridge = vi.hoisted(() => ({
  edit: vi.fn(), init: vi.fn(), listeners: new Set<(message: HostToWebviewMessage) => void>(),
  flush: undefined as (() => Promise<void>) | undefined,
}))
vi.mock('@/lib/host', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/host')>(),
  isVsCodeHost: () => true,
  requestVsCodeInit: bridge.init,
  replaceVsCodeDocument: bridge.edit,
  postHostMessage: vi.fn(),
  subscribeHostMessages: (listener: (message: HostToWebviewMessage) => void) => {
    bridge.listeners.add(listener); return () => bridge.listeners.delete(listener)
  },
  setDocumentFlusher: (flush?: () => Promise<void>) => { bridge.flush = flush },
}))
import { useVsCodeHost } from './useVsCodeHost'
import { useWorkspaceStore } from '@/store/workspace'
import { useHostStatus } from '@/lib/host/status'
const content = 'workspace "Host" {\n model {\n p = person "Person"\n }\n views {\n systemLandscape "All" {\n include *\n }\n }\n}\n'
beforeEach(() => {
  bridge.edit.mockReset().mockResolvedValue(2)
  bridge.init.mockResolvedValue({ content, includes: {}, uri: 'file:///project/a.dsl', folderUri: 'file:///project', name: 'a.dsl', revision: 1, dirty: false, apiKeys: { anthropic: '', openai: '', gemini: '' } })
  bridge.listeners.clear(); bridge.flush = undefined
  useHostStatus.setState({ loading: true, error: null, dirty: false })
})
it('loads without writing, forwards canvas edits, and flushes before save', async () => {
  const hook = renderHook(() => useVsCodeHost())
  await waitFor(() => expect(useHostStatus.getState().loading).toBe(false))
  expect(bridge.edit).not.toHaveBeenCalled()
  act(() => useWorkspaceStore.setState(state => ({ workspace: { ...state.workspace!, name: 'Renamed' } })))
  await act(async () => { await bridge.flush!() })
  expect(bridge.edit).toHaveBeenCalledTimes(1)
  expect(bridge.edit.mock.calls[0][0].content).toContain('Renamed')
  expect(bridge.edit.mock.calls[0][1]).toBe(1)
  hook.unmount()
  expect(bridge.listeners.size).toBe(0)
  expect(bridge.flush).toBeUndefined()
})
it('external text updates reload the canvas without echoing edits back', async () => {
  const hook = renderHook(() => useVsCodeHost())
  await waitFor(() => expect(useHostStatus.getState().loading).toBe(false))
  act(() => {
    for (const listener of bridge.listeners) listener({ type: 'documentChanged', snapshot: { content: content.replace('"Host"', '"External"'), includes: {} }, revision: 6, dirty: true })
  })
  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.name).toBe('External'))
  await act(async () => { await bridge.flush!() })
  expect(bridge.edit).not.toHaveBeenCalled()
  expect(useHostStatus.getState().dirty).toBe(true)
  hook.unmount()
})
