import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const busyBrowser = vi.hoisted(() => {
  let nextId = 0
  const pending = new Map<number, ReturnType<typeof setTimeout> | undefined>()
  const request = vi.fn((callback: IdleRequestCallback, options?: IdleRequestOptions) => {
    const id = ++nextId
    // This browser has no idle periods. Only a requested timeout can make an
    // idle callback run; without one, an applied model edit stays off disk.
    const timer = options?.timeout === undefined ? undefined : setTimeout(() => {
      pending.delete(id)
      callback({ didTimeout: true, timeRemaining: () => 0 })
    }, options.timeout)
    pending.set(id, timer)
    return id
  })
  const cancel = vi.fn((id: number) => {
    const timer = pending.get(id)
    if (timer !== undefined) clearTimeout(timer)
    pending.delete(id)
  })
  const install = () => {
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
  }
  install()
  return {
    install,
    reset: () => {
      for (const id of pending.keys()) cancel(id)
      nextId = 0
    },
  }
})

const saves = vi.hoisted(() => ({
  isWorkspaceLinked: vi.fn(() => true),
  writeLinkedWorkspace: vi.fn(async () => true),
  saveToLocalStorage: vi.fn(),
}))
vi.mock('@/lib/workspaceSave', () => saves)
vi.mock('@/lib/fileIO', () => ({ saveToLocalStorage: saves.saveToLocalStorage }))

import { writeLinkedWorkspace } from '@/lib/workspaceSave'
import { saveToLocalStorage } from '@/lib/fileIO'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { useAutoSave } from './useAutoSave'

const DSL = `workspace "Workspace" {
  model {
    s = softwareSystem "Shop" {
      api = container "API"
    }
  }
  views {
    container s "Services" { include * }
  }
}`

function Harness() { useAutoSave(); return null }

function openWorkspace(text = DSL, filename = 'workspace.dsl') {
  useWorkspaceStore.getState().loadWorkspace(parseDSL(text).workspace)
  useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

beforeEach(() => {
  vi.useFakeTimers()
  busyBrowser.reset()
  busyBrowser.install()
  vi.clearAllMocks()
  vi.mocked(writeLinkedWorkspace).mockResolvedValue(true)
  useWorkspaceStore.getState().closeWorkspace()
})

afterEach(() => {
  cleanup()
  busyBrowser.reset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('autosave when the browser has no idle time', () => {
  it('persists an applied model edit within the bounded delay and marks it saved only after completion', async () => {
    let complete!: (ok: boolean) => void
    vi.mocked(writeLinkedWorkspace).mockImplementationOnce(() => new Promise<boolean>((resolve) => { complete = resolve }))
    render(<Harness />)
    act(() => {
      openWorkspace()
      expect(useWorkspaceStore.getState().replaceWorkspaceFromDSL(DSL.replace('"API"', '"Updated API"')).ok).toBe(true)
    })
    const savedUndoLength = useWorkspaceStore.getState().undoStack.length
    expect(savedUndoLength).toBeGreaterThan(0)

    await advance(1000)
    expect(saveToLocalStorage).toHaveBeenCalledOnce()
    expect(vi.mocked(saveToLocalStorage).mock.calls[0][0].model.softwareSystems[0].containers[0].name).toBe('Updated API')
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    await advance(999)
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    await advance(1)

    expect(writeLinkedWorkspace).toHaveBeenCalledOnce()
    const [workspace, filename] = vi.mocked(writeLinkedWorkspace).mock.calls[0]
    expect(workspace.model.softwareSystems[0].containers[0].name).toBe('Updated API')
    expect(filename).toBe('workspace.dsl')
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)

    await act(async () => { complete(true); await Promise.resolve() })
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(savedUndoLength)
  })

  it('does not save a workspace closed while its idle callback is pending', async () => {
    render(<Harness />)
    act(() => { openWorkspace() })
    await advance(1000)
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()

    act(() => { useWorkspaceStore.getState().closeWorkspace() })
    await advance(2000)

    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().workspace).toBeNull()
  })

  it('cancels the prior idle callback when switching to a workspace with the same name', async () => {
    render(<Harness />)
    act(() => { openWorkspace(DSL, 'first.dsl') })
    await advance(1000)

    act(() => { openWorkspace(DSL.replace('"API"', '"Second API"'), 'second.dsl') })
    // The first callback would expire here. The second workspace must get
    // its own debounce and idle delay rather than inherit that pending save.
    await advance(1000)
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    await advance(1000)

    expect(writeLinkedWorkspace).toHaveBeenCalledOnce()
    const [workspace, filename] = vi.mocked(writeLinkedWorkspace).mock.calls[0]
    expect(workspace.model.softwareSystems[0].containers[0].name).toBe('Second API')
    expect(filename).toBe('second.dsl')
  })
})
