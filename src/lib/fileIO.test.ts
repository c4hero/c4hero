import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Workspace } from '@/types/model'

// We need to mock localStorage before importing fileIO so the module-level
// code picks up the mock. We use vi.stubGlobal in each test.

function makeMockLocalStorage() {
  const store: Record<string, string> = {}
  return {
    store,
    mock: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { for (const k of Object.keys(store)) delete store[k] },
    },
  }
}

function makeWorkspace(name = 'Test Workspace'): Workspace {
  return {
    name,
    model: {
      people: [
        { id: 'p1', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [
        {
          id: 's1',
          type: 'softwareSystem',
          name: 'My App',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

// ─── isWorkspaceShape ────────────────────────────────────────────────

describe('isWorkspaceShape', () => {
  it('returns true for a valid workspace shape', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const ws = makeWorkspace()
    expect(isWorkspaceShape(ws)).toBe(true)
  })

  it('returns false when model is missing', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = { views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } } }
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('returns false when people array is missing', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = {
      model: { softwareSystems: [], relationships: [], groups: [] },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('returns false for null', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    expect(isWorkspaceShape(null)).toBe(false)
  })

  it('returns false for a plain string', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    expect(isWorkspaceShape('not a workspace')).toBe(false)
  })
})

// ─── getRecentFiles / addRecentFile ──────────────────────────────────

describe('getRecentFiles', () => {
  beforeEach(() => {
    const { mock } = makeMockLocalStorage()
    vi.stubGlobal('localStorage', mock)
  })

  it('returns empty array when localStorage is empty', async () => {
    const { getRecentFiles } = await import('./fileIO')
    const result = getRecentFiles()
    expect(result).toEqual([])
  })
})

describe('addRecentFile', () => {
  it('adds a file to the recent list', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('workspace.dsl')
    const files = getRecentFiles()
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('workspace.dsl')
  })

  it('moves an existing entry to front when added again', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('first.dsl')
    addRecentFile('second.dsl')
    addRecentFile('first.dsl') // should bubble to front

    const files = getRecentFiles()
    expect(files[0].name).toBe('first.dsl')
    expect(files).toHaveLength(2)
  })

  it('caps the recent files list at 10', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    for (let i = 1; i <= 12; i++) {
      addRecentFile(`file${i}.dsl`)
    }

    const files = getRecentFiles()
    expect(files.length).toBeLessThanOrEqual(10)
    // Most recently added should be first
    expect(files[0].name).toBe('file12.dsl')
  })
})

// ─── saveToLocalStorage / loadFromLocalStorage / clearLocalStorage ───

describe('localStorage crash recovery', () => {
  it('round-trips a workspace through save → load', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { saveToLocalStorage, loadFromLocalStorage } = await import('./fileIO')

    const ws = makeWorkspace('Crash Recovery Test')
    saveToLocalStorage(ws)

    const loaded = loadFromLocalStorage()
    expect(loaded).not.toBeNull()
    expect(loaded!.name).toBe('Crash Recovery Test')
    expect(loaded!.model.people).toHaveLength(1)
    expect(loaded!.model.softwareSystems).toHaveLength(1)
  })

  it('loadFromLocalStorage returns null when nothing is saved', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { loadFromLocalStorage } = await import('./fileIO')

    const loaded = loadFromLocalStorage()
    expect(loaded).toBeNull()
  })

  it('clearLocalStorage causes loadFromLocalStorage to return null', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } = await import('./fileIO')

    saveToLocalStorage(makeWorkspace())
    expect(loadFromLocalStorage()).not.toBeNull()

    clearLocalStorage()
    expect(loadFromLocalStorage()).toBeNull()
  })

  it('loadFromLocalStorage returns null for invalid JSON', async () => {
    const ls = makeMockLocalStorage()
    ls.store['c4hero_crash_recovery'] = 'not valid json {'
    vi.stubGlobal('localStorage', ls.mock)
    const { loadFromLocalStorage } = await import('./fileIO')

    const loaded = loadFromLocalStorage()
    expect(loaded).toBeNull()
  })

  it('loadFromLocalStorage returns null for valid JSON that is not a workspace shape', async () => {
    const ls = makeMockLocalStorage()
    ls.store['c4hero_crash_recovery'] = JSON.stringify({ foo: 'bar' })
    vi.stubGlobal('localStorage', ls.mock)
    const { loadFromLocalStorage } = await import('./fileIO')

    const loaded = loadFromLocalStorage()
    expect(loaded).toBeNull()
  })

  it('saveToLocalStorage also stores a timestamp', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { saveToLocalStorage } = await import('./fileIO')

    saveToLocalStorage(makeWorkspace())
    expect(ls.store['c4hero_crash_recovery_time']).toBeDefined()
    expect(typeof ls.store['c4hero_crash_recovery_time']).toBe('string')
  })

  it('clearLocalStorage removes both recovery data and timestamp', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { saveToLocalStorage, clearLocalStorage } = await import('./fileIO')

    saveToLocalStorage(makeWorkspace())
    expect(ls.store['c4hero_crash_recovery']).toBeDefined()
    expect(ls.store['c4hero_crash_recovery_time']).toBeDefined()

    clearLocalStorage()
    expect(ls.store['c4hero_crash_recovery']).toBeUndefined()
    expect(ls.store['c4hero_crash_recovery_time']).toBeUndefined()
  })
})

// ─── hasDirectoryAccess ──────────────────────────────────────────────

describe('hasDirectoryAccess', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns false when showDirectoryPicker is not in window', async () => {
    const orig = (window as Record<string, unknown>).showDirectoryPicker
    delete (window as Record<string, unknown>).showDirectoryPicker
    const { hasDirectoryAccess } = await import('./fileIO')
    expect(hasDirectoryAccess()).toBe(false)
    if (orig !== undefined) (window as Record<string, unknown>).showDirectoryPicker = orig
  })

  it('returns true when showDirectoryPicker is present', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    const { hasDirectoryAccess } = await import('./fileIO')
    expect(hasDirectoryAccess()).toBe(true)
  })
})

// ─── hasFileSystemAccess ─────────────────────────────────────────────

describe('hasFileSystemAccess', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns false when showOpenFilePicker is not in window', async () => {
    const orig = (window as Record<string, unknown>).showOpenFilePicker
    delete (window as Record<string, unknown>).showOpenFilePicker
    const { hasFileSystemAccess } = await import('./fileIO')
    expect(hasFileSystemAccess()).toBe(false)
    if (orig !== undefined) (window as Record<string, unknown>).showOpenFilePicker = orig
  })

  it('returns true when showOpenFilePicker is present', async () => {
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    const { hasFileSystemAccess } = await import('./fileIO')
    expect(hasFileSystemAccess()).toBe(true)
  })
})

// ─── addRecentFile edge cases ────────────────────────────────────────

describe('addRecentFile edge cases', () => {
  it('stores entries with openedAt timestamp', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('workspace.dsl')
    const files = getRecentFiles()
    expect(files[0].openedAt).toBeDefined()
    expect(typeof files[0].openedAt).toBe('string')
  })

  it('getRecentFiles returns most recent first', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('first.dsl')
    addRecentFile('second.dsl')
    addRecentFile('third.dsl')

    const files = getRecentFiles()
    expect(files[0].name).toBe('third.dsl')
    expect(files[1].name).toBe('second.dsl')
    expect(files[2].name).toBe('first.dsl')
  })

  it('getRecentFiles handles malformed JSON gracefully', async () => {
    const ls = makeMockLocalStorage()
    ls.store['c4hero_recent_files'] = 'broken json {'
    vi.stubGlobal('localStorage', ls.mock)
    const { getRecentFiles } = await import('./fileIO')

    const files = getRecentFiles()
    expect(files).toEqual([])
  })
})

// ─── isWorkspaceShape edge cases ─────────────────────────────────────

describe('isWorkspaceShape edge cases', () => {
  it('returns false for array', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    expect(isWorkspaceShape([])).toBe(false)
  })

  it('returns false for undefined', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    expect(isWorkspaceShape(undefined)).toBe(false)
  })

  it('returns false when views is missing', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = { model: { people: [], softwareSystems: [] } }
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('returns false when softwareSystems is not an array', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = {
      model: { people: [], softwareSystems: 'not an array' },
      views: {},
    }
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('returns true for minimal valid shape', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const ok = {
      model: { people: [], softwareSystems: [] },
      views: {},
    }
    expect(isWorkspaceShape(ok)).toBe(true)
  })
})
