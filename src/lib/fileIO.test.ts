import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('returns empty array when stored value is not an array', async () => {
    localStorage.setItem('c4hero_recent_files', JSON.stringify({ name: 'workspace.dsl' }))
    const { getRecentFiles } = await import('./fileIO')
    expect(getRecentFiles()).toEqual([])
  })

  it('filters malformed recent file entries', async () => {
    localStorage.setItem('c4hero_recent_files', JSON.stringify([
      { name: 'valid.dsl', openedAt: '2026-04-30T00:00:00.000Z' },
      { name: '', openedAt: '2026-04-30T00:00:00.000Z' },
      { name: 'missing-date.dsl' },
      'not-an-entry',
    ]))
    const { getRecentFiles } = await import('./fileIO')
    expect(getRecentFiles()).toEqual([
      { name: 'valid.dsl', openedAt: '2026-04-30T00:00:00.000Z' },
    ])
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

  it('trims recent file names before storing them', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('  workspace.dsl  ')
    expect(getRecentFiles()[0].name).toBe('workspace.dsl')
  })

  it('ignores blank recent file names', async () => {
    const ls = makeMockLocalStorage()
    vi.stubGlobal('localStorage', ls.mock)
    const { addRecentFile, getRecentFiles } = await import('./fileIO')

    addRecentFile('   ')
    expect(getRecentFiles()).toEqual([])
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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

  it('clearLocalStorage does not throw when storage removal fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      removeItem: () => { throw new Error('storage disabled') },
    })
    const { clearLocalStorage } = await import('./fileIO')
    expect(() => clearLocalStorage()).not.toThrow()
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

describe('file picker hardening', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('limits the native open picker to DSL and text files', async () => {
    const { mock } = makeMockLocalStorage()
    vi.stubGlobal('localStorage', mock)

    const file = new File(['workspace {}'], 'example.dsl', { type: 'text/plain' })
    const handle = { getFile: vi.fn().mockResolvedValue(file) }
    const showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    vi.stubGlobal('showOpenFilePicker', showOpenFilePicker)

    const { openDSLFile } = await import('./fileIO')
    const result = await openDSLFile()

    expect(result).toMatchObject({ content: 'workspace {}', name: 'example.dsl' })
    expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({
      types: [
        expect.objectContaining({
          accept: { 'text/plain': ['.dsl', '.txt'] },
        }),
      ],
    }))
  })

  it('sanitizes suggested names passed to the native save picker', async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const handle = { createWritable: vi.fn().mockResolvedValue(writable) }
    const showSaveFilePicker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker)

    const { saveDSLFile } = await import('./fileIO')
    const saved = await saveDSLFile('workspace {}', '../CON.dsl')

    expect(saved).toBe(true)
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: '__CON.dsl',
    }))
    expect(writable.write).toHaveBeenCalledWith('workspace {}')
    expect(writable.close).toHaveBeenCalled()
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ls = makeMockLocalStorage()
    ls.store['c4hero_recent_files'] = 'broken json {'
    vi.stubGlobal('localStorage', ls.mock)
    const { getRecentFiles } = await import('./fileIO')

    const files = getRecentFiles()
    expect(files).toEqual([])
  })
})

// ─── getRecentFolders / addRecentFolder ─────────────────────────────

describe('recent folders', () => {
  beforeEach(() => {
    const { mock } = makeMockLocalStorage()
    vi.stubGlobal('localStorage', mock)
  })

  it('returns empty array when localStorage is empty', async () => {
    const { getRecentFolders } = await import('./fileIO')
    expect(getRecentFolders()).toEqual([])
  })

  it('filters malformed recent folder entries', async () => {
    localStorage.setItem('c4hero_recent_folders', JSON.stringify([
      { name: 'team-architecture', path: 'team-architecture', displayName: 'Team Architecture', openedAt: '2026-04-30T00:00:00.000Z' },
      { name: 'missing-path', openedAt: '2026-04-30T00:00:00.000Z' },
      { name: 'bad-display', path: 'bad-display', displayName: 42, openedAt: '2026-04-30T00:00:00.000Z' },
      [],
    ]))
    const { getRecentFolders } = await import('./fileIO')
    expect(getRecentFolders()).toEqual([
      { name: 'team-architecture', path: 'team-architecture', displayName: 'Team Architecture', openedAt: '2026-04-30T00:00:00.000Z' },
      { name: 'bad-display', path: 'bad-display', displayName: undefined, openedAt: '2026-04-30T00:00:00.000Z' },
    ])
  })

  it('moves an existing folder to the front when added again', async () => {
    const { addRecentFolder, getRecentFolders } = await import('./fileIO')
    addRecentFolder({ name: 'first', path: 'first' })
    addRecentFolder({ name: 'second', path: 'second' })
    addRecentFolder({ name: 'first', path: 'first', displayName: 'First' })

    const folders = getRecentFolders()
    expect(folders).toHaveLength(2)
    expect(folders[0].name).toBe('first')
    expect(folders[0].displayName).toBe('First')
  })

  it('trims recent folder values before storing them', async () => {
    const { addRecentFolder, getRecentFolders } = await import('./fileIO')
    addRecentFolder({ name: '  team  ', path: '  team  ', displayName: '  Team  ' })
    expect(getRecentFolders()[0]).toMatchObject({ name: 'team', path: 'team', displayName: 'Team' })
  })

  it('ignores recent folders with blank name or path', async () => {
    const { addRecentFolder, getRecentFolders } = await import('./fileIO')
    addRecentFolder({ name: 'team', path: '' })
    addRecentFolder({ name: '', path: 'team' })
    expect(getRecentFolders()).toEqual([])
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

  it('returns true for a minimal complete valid shape', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const ok = makeWorkspace('Minimal')
    expect(isWorkspaceShape(ok)).toBe(true)
  })

  it('rejects non-finite view coordinates', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = makeWorkspace()
    bad.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'landscape',
      elements: [{ id: 'p1', x: Number.NaN, y: 0 }],
      relationships: [],
    })
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('rejects non-finite auto-layout spacing', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = makeWorkspace()
    bad.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'landscape',
      elements: [],
      relationships: [],
      autoLayout: { direction: 'TB', rankSeparation: Infinity },
    })
    expect(isWorkspaceShape(bad)).toBe(false)
  })

  it('rejects non-finite style numbers', async () => {
    const { isWorkspaceShape } = await import('./fileIO')
    const bad = makeWorkspace()
    bad.views.configuration.styles.elements.push({ tag: 'Element', fontSize: Number.NaN })
    expect(isWorkspaceShape(bad)).toBe(false)
  })
})
