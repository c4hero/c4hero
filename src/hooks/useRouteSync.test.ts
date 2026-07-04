import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useRouteSync, useRefreshRedirect } from './useRouteSync'
import { getCurrentDirHandle, restoreDirHandleByName, readDSLFile } from '@/lib/folderIO'
import { loadFromLocalStorage } from '@/lib/fileIO'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import type { Workspace } from '@/types/model'

// Controllable router doubles — this file-level mock overrides the static one
// registered in src/test-setup.ts.
const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/', search: '', hash: '', state: null as unknown, key: 'default' },
  params: {} as { viewKey?: string },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useLocation: () => ({ ...router.location }),
  useParams: () => router.params,
}))

vi.mock('@/lib/folderIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/folderIO')>()),
  getCurrentDirHandle: vi.fn(),
  restoreDirHandleByName: vi.fn(),
  readDSLFile: vi.fn(),
}))

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileIO')>()),
  loadFromLocalStorage: vi.fn(),
}))

vi.mock('@/lib/workspaceDocument', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspaceDocument')>()),
  parseWorkspaceDocument: vi.fn(),
}))

function makeWs(): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {},
          containers: [
            { id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] },
          ],
        },
      ],
      relationships: [], groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land', elements: [{ id: 'sys' }], relationships: [],
      }],
      systemContextViews: [],
      containerViews: [{
        type: 'container', key: 'cont', softwareSystemId: 'sys',
        elements: [{ id: 'c1' }], relationships: [],
      }],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

const teamHandle = { name: 'team' } as unknown as FileSystemDirectoryHandle

function seedCanvas() {
  useWorkspaceStore.getState().loadWorkspace(makeWs())
  useWorkspaceStore.getState().setActiveView('land')
  useWorkspaceStore.getState().setActiveWorkspaceFilename('my-ws.dsl')
  useWorkspaceStore.setState({ viewHistory: [] })
  vi.mocked(getCurrentDirHandle).mockReturnValue(teamHandle)
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  router.navigate.mockReset()
  router.location = { pathname: '/', search: '', hash: '', state: null, key: 'default' }
  router.params = {}
  vi.mocked(getCurrentDirHandle).mockReset().mockReturnValue(null)
  vi.mocked(restoreDirHandleByName).mockReset().mockResolvedValue(null)
  vi.mocked(readDSLFile).mockReset().mockResolvedValue(null)
  vi.mocked(loadFromLocalStorage).mockReset().mockReturnValue(null)
  vi.mocked(parseWorkspaceDocument).mockReset().mockReturnValue({ workspace: makeWs(), errors: [] })
})

describe('useRouteSync — state → URL', () => {
  it('replaces the URL with the canvas path on initial sync', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws'

    renderHook(() => useRouteSync())

    expect(router.navigate).toHaveBeenCalledWith('/collection/team/my-ws/land', { replace: true })
  })

  it('falls back to "workspace" slugs when no folder handle or filename exist', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('land')
    router.location.pathname = '/collection/workspace/workspace'

    renderHook(() => useRouteSync())

    expect(router.navigate).toHaveBeenCalledWith('/collection/workspace/workspace/land', { replace: true })
  })

  it('does not navigate when the URL already matches', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'

    renderHook(() => useRouteSync())

    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('pushes (no replace) when the active view changes after mount', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'
    renderHook(() => useRouteSync())

    act(() => useWorkspaceStore.getState().setActiveView('cont'))

    expect(router.navigate).toHaveBeenCalledTimes(1)
    expect(router.navigate).toHaveBeenCalledWith('/collection/team/my-ws/cont')
  })

  it('does nothing when no workspace is loaded', () => {
    renderHook(() => useRouteSync())
    expect(router.navigate).not.toHaveBeenCalled()
  })
})

describe('useRouteSync — URL → state', () => {
  it('applies a valid view key from the URL params on mount', () => {
    seedCanvas()
    router.params = { viewKey: 'cont' }
    router.location.pathname = '/collection/team/my-ws/cont'

    renderHook(() => useRouteSync())

    expect(useWorkspaceStore.getState().activeViewKey).toBe('cont')
  })

  it('ignores an unknown view key from the URL params', () => {
    seedCanvas()
    router.params = { viewKey: 'bogus' }
    router.location.pathname = '/collection/team/my-ws/land'

    renderHook(() => useRouteSync())

    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
  })

  it('switches views and clears selection on browser back/forward', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'
    const { rerender } = renderHook(() => useRouteSync())
    useWorkspaceStore.getState().selectElements(['sys'])

    router.location.pathname = '/collection/team/my-ws/cont'
    rerender()

    const s = useWorkspaceStore.getState()
    expect(s.activeViewKey).toBe('cont')
    expect(s.selectedElementIds).toEqual([])
  })

  it('closes the workspace when navigating away from the canvas', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'
    const { rerender } = renderHook(() => useRouteSync())

    router.location.pathname = '/collection/team'
    rerender()

    expect(useWorkspaceStore.getState().workspace).toBeNull()
  })

  it('corrects an invalid view key in the URL with a replace navigation', () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'
    const { rerender } = renderHook(() => useRouteSync())

    router.location.pathname = '/collection/team/my-ws/bogus'
    rerender()

    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
    expect(router.navigate).toHaveBeenCalledWith('/collection/team/my-ws/land', { replace: true })
  })
})

describe('useRefreshRedirect', () => {
  it('does nothing when the URL is not a canvas path', async () => {
    router.location.pathname = '/'
    renderHook(() => useRefreshRedirect())
    await act(async () => {})

    expect(restoreDirHandleByName).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('does nothing when a workspace is already in memory', async () => {
    seedCanvas()
    router.location.pathname = '/collection/team/my-ws/land'
    renderHook(() => useRefreshRedirect())
    await act(async () => {})

    expect(restoreDirHandleByName).not.toHaveBeenCalled()
    expect(readDSLFile).not.toHaveBeenCalled()
  })

  it('restores the workspace from disk and applies the URL view key', async () => {
    vi.mocked(restoreDirHandleByName).mockResolvedValue(teamHandle)
    vi.mocked(readDSLFile).mockResolvedValue({ content: 'workspace {}', sidecarJson: '{}' })
    vi.mocked(parseWorkspaceDocument).mockReturnValue({
      workspace: makeWs(),
      errors: [{ message: 'warn', line: 1, column: 1 }],
    })
    router.location.pathname = '/collection/team/my-ws/cont'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(useWorkspaceStore.getState().workspace).not.toBeNull())
    const s = useWorkspaceStore.getState()
    expect(restoreDirHandleByName).toHaveBeenCalledWith('team')
    expect(readDSLFile).toHaveBeenCalledWith('my-ws.dsl')
    expect(s.activeWorkspaceFilename).toBe('my-ws.dsl')
    expect(s.activeViewKey).toBe('cont')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('reuses an already-open folder handle whose name matches the slug', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue(teamHandle)
    vi.mocked(readDSLFile).mockResolvedValue({ content: 'workspace {}' })
    router.location.pathname = '/collection/team/my-ws'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(useWorkspaceStore.getState().workspace).not.toBeNull())
    expect(restoreDirHandleByName).not.toHaveBeenCalled()
  })

  it('keeps the first view when the URL view key does not exist', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue(teamHandle)
    vi.mocked(readDSLFile).mockResolvedValue({ content: 'workspace {}' })
    router.location.pathname = '/collection/team/my-ws/bogus'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(useWorkspaceStore.getState().workspace).not.toBeNull())
    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
  })

  it('recovers from localStorage when no folder handle is available', async () => {
    vi.mocked(loadFromLocalStorage).mockReturnValue(makeWs())
    router.location.pathname = '/collection/team/my-ws/cont'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(useWorkspaceStore.getState().workspace).not.toBeNull())
    expect(useWorkspaceStore.getState().activeViewKey).toBe('cont')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('redirects to startup when neither a handle nor localStorage can recover', async () => {
    router.location.pathname = '/collection/team/my-ws'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(useWorkspaceStore.getState().workspace).toBeNull()
  })

  it('redirects to the collection home when the DSL file is gone', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue(teamHandle)
    vi.mocked(readDSLFile).mockResolvedValue(null)
    router.location.pathname = '/collection/team/my-ws/land'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/collection/team', { replace: true }))
  })

  it('redirects to startup when recovery throws', async () => {
    vi.mocked(restoreDirHandleByName).mockRejectedValue(new Error('idb broke'))
    router.location.pathname = '/collection/team/my-ws'

    renderHook(() => useRefreshRedirect())

    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/', { replace: true }))
  })
})
