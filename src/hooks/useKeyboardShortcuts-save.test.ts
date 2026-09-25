/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { saveDSLFile, writeSidecarToHandle } from '@/lib/fileIO'

vi.mock('@xyflow/react', () => ({ useReactFlow: () => { throw new Error('not in flow') } }))
vi.mock('@/lib/fileIO', () => ({
  saveDSLFile: vi.fn(), writeSidecarToHandle: vi.fn().mockResolvedValue(true), openDSLFile: vi.fn(),
}))
vi.mock('@/lib/workspaceSave', () => ({ isWorkspaceLinked: () => false, writeLinkedWorkspace: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace {\n model {\n s = softwareSystem "System"\n }\n}').workspace)
})

it.each([true, false])('waits for the DSL save result before writing layout (success: %s)', async success => {
  let finish!: (result: boolean) => void
  vi.mocked(saveDSLFile).mockReturnValue(new Promise(resolve => { finish = resolve }))
  renderHook(() => useKeyboardShortcuts())
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  })
  expect(saveDSLFile).toHaveBeenCalledOnce()
  expect(writeSidecarToHandle).not.toHaveBeenCalled()
  await act(async () => { finish(success) })
  expect(writeSidecarToHandle).toHaveBeenCalledTimes(success ? 1 : 0)
  if (success) expect(JSON.parse(vi.mocked(writeSidecarToHandle).mock.calls[0][0])).toEqual({ version: 1, views: {} })
})
