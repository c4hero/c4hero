import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Workspace } from '@/types/model'
import { makeCountingDirHandle } from './testing/countingDirHandle'

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

  it('opens a save picker during the call even when an earlier operation holds the write queue', async () => {
    const handle = { getFile: async () => new File(['saved'], 'saved.dsl') }
    const picker = vi.fn(async () => handle)
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    vi.stubGlobal('showSaveFilePicker', picker)
    const { saveDSLFile, writeFileIfChanged } = await import('./fileIO')
    let release!: () => void
    let started!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const queued = new Promise<void>((resolve) => { started = resolve })
    const earlier = writeFileIfChanged(async () => { started(); await held; return null }, '')
    await queued
    const saved = saveDSLFile('saved')
    try {
      expect(picker).toHaveBeenCalledOnce()
    } finally {
      release()
    }
    expect(await earlier).toBe(false)
    expect(await saved).toBe(true)
  })

  it('keeps a delayed old sidecar save out of the new file and its sidecar cache', async () => {
    const original = makeCountingDirHandle({ 'old.dsl': 'old' })
    const replacement = makeCountingDirHandle({ 'new.dsl': 'new', 'new.c4hero.json': 'new layout' })
    let release!: () => void
    let started!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const resolving = new Promise<void>((resolve) => { started = resolve })
    const oldHandle = {
      ...await original.dir.getFileHandle('old.dsl'),
      getParent: vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
        started()
        await held
        return original.dir
      }),
    }
    const newHandle = { ...await replacement.dir.getFileHandle('new.dsl'), getParent: async () => replacement.dir }
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValueOnce([oldHandle]).mockResolvedValueOnce([newHandle]))
    const { openDSLFile, writeSidecarToHandle, getCurrentSidecarHandle } = await import('./fileIO')
    expect(await openDSLFile()).toMatchObject({ name: 'old.dsl' })
    const earlier = writeSidecarToHandle('old saved layout')
    await resolving
    try {
      expect(await openDSLFile()).toMatchObject({ name: 'new.dsl' })
      expect(getCurrentSidecarHandle()?.name).toBe('new.c4hero.json')
    } finally {
      release()
    }
    expect(await earlier).toBe(true)
    expect(getCurrentSidecarHandle()?.name).toBe('new.c4hero.json')
    expect(await writeSidecarToHandle('new saved layout')).toBe(true)
    expect(original.content['old.c4hero.json']).toBe('old saved layout')
    expect(replacement.content['new.c4hero.json']).toBe('new saved layout')
  })

  it('drops the previous sidecar when a new file cannot resolve a parent directory', async () => {
    const original = makeCountingDirHandle({ 'old.dsl': 'old', 'old.c4hero.json': 'old layout' })
    const replacement = makeCountingDirHandle({ 'new.dsl': 'new' })
    const oldHandle = { ...await original.dir.getFileHandle('old.dsl'), getParent: async () => original.dir }
    const newHandle = await replacement.dir.getFileHandle('new.dsl')
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValueOnce([oldHandle]).mockResolvedValueOnce([newHandle]))
    const { openDSLFile, writeSidecarToHandle, getCurrentSidecarHandle } = await import('./fileIO')
    expect(await openDSLFile()).toMatchObject({ name: 'old.dsl', sidecarJson: 'old layout' })
    expect(await openDSLFile()).toMatchObject({ name: 'new.dsl' })
    expect(getCurrentSidecarHandle()).toBeNull()
    expect(await writeSidecarToHandle('new layout')).toBe(false)
    expect(original.content['old.c4hero.json']).toBe('old layout')
  })

  it.each(['unreadable', 'oversized'] as const)('preserves the previous save destinations when the new file is %s', async (failure) => {
    const rig = makeCountingDirHandle({ 'old.dsl': 'old', 'old.c4hero.json': 'old layout' })
    const oldHandle = { ...await rig.dir.getFileHandle('old.dsl'), getParent: async () => rig.dir }
    const createWritable = vi.fn()
    const rejectedHandle = {
      createWritable,
      getFile: async () => {
        if (failure === 'unreadable') throw new Error('unreadable')
        return { name: 'rejected.dsl', size: 10 * 1024 * 1024 + 1, text: async () => 'too large' }
      },
    }
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValueOnce([oldHandle]).mockResolvedValueOnce([rejectedHandle]))
    const { openDSLFile, getCurrentFileHandle, getCurrentSidecarHandle, saveDSLFile } = await import('./fileIO')
    const { getHandleRevision } = await import('./handleChanges')
    expect(await openDSLFile()).toMatchObject({ name: 'old.dsl' })
    const revision = getHandleRevision()
    expect(await openDSLFile()).toBeNull()
    expect(getHandleRevision()).toBe(revision)
    expect(getCurrentFileHandle()).toBe(oldHandle)
    expect(getCurrentSidecarHandle()?.name).toBe('old.c4hero.json')
    expect(await saveDSLFile('old updated')).toBe(true)
    expect(rig.content['old.dsl']).toBe('old updated')
    expect(createWritable).not.toHaveBeenCalled()
  })

  it('notifies a new file link only after the complete DSL and layout save finishes', async () => {
    const rig = makeCountingDirHandle({ 'linked.dsl': 'before' })
    const selected = { ...await rig.dir.getFileHandle('linked.dsl'), getParent: async () => rig.dir }
    const originalLookup = rig.dir.getFileHandle.bind(rig.dir)
    let release!: () => void
    let started!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const closing = new Promise<void>((resolve) => { started = resolve })
    vi.spyOn(rig.dir, 'getFileHandle').mockImplementation(async (name, options) => {
      const handle = await originalLookup(name, options)
      if (!name.endsWith('.c4hero.json')) return handle
      return {
        ...handle,
        createWritable: async () => {
          const writable = await handle.createWritable()
          return {
            write: (content: string) => writable.write(content),
            close: async () => { started(); await held; await writable.close() },
          }
        },
      } as unknown as FileSystemFileHandle
    })
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    vi.stubGlobal('showSaveFilePicker', vi.fn(async () => selected))
    const { saveDSLFile } = await import('./fileIO')
    const { getHandleRevision, subscribeHandleChanges } = await import('./handleChanges')
    const notify = vi.fn()
    const unsubscribe = subscribeHandleChanges(notify)
    const revision = getHandleRevision()
    const layout = '{"version":1,"views":{"V":{"locked":true}}}'
    try {
      const saved = saveDSLFile('saved root', 'linked.dsl', layout)
      await closing
      try {
        expect(notify).not.toHaveBeenCalled()
        expect(getHandleRevision()).toBe(revision)
      } finally {
        release()
      }
      expect(await saved).toBe(true)
      expect(notify).toHaveBeenCalledOnce()
      expect(getHandleRevision()).toBe(revision + 1)
      expect(rig.content['linked.dsl']).toBe('saved root')
      expect(rig.content['linked.c4hero.json']).toBe(layout)
      expect(await saveDSLFile('saved root', 'linked.dsl', layout)).toBe(true)
      expect(notify).toHaveBeenCalledOnce()
    } finally {
      unsubscribe()
    }
  })

  it('reports failure for material layout without a sidecar destination, while empty layout can be omitted', async () => {
    const handle = { getFile: async () => new File(['saved'], 'saved.dsl') }
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    vi.stubGlobal('showSaveFilePicker', vi.fn(async () => handle))
    const { saveDSLFile } = await import('./fileIO')
    expect(await saveDSLFile('saved', 'saved.dsl', '{"version":1,"views":{}}')).toBe(true)
    expect(await saveDSLFile('saved', 'saved.dsl', '{"version":1,"views":{"V":{"locked":true}}}')).toBe(false)
    expect(await saveDSLFile('saved', 'saved.dsl', '{"version":1,"unknown":{"important":true}}')).toBe(false)
  })

  it('includes layout completion in native save success', async () => {
    const rig = makeCountingDirHandle({ 'saved.dsl': 'before' })
    const handle = { ...await rig.dir.getFileHandle('saved.dsl'), getParent: async () => rig.dir }
    const originalLookup = rig.dir.getFileHandle.bind(rig.dir)
    vi.spyOn(rig.dir, 'getFileHandle').mockImplementation(async (name, options) => {
      const found = await originalLookup(name, options)
      if (!name.endsWith('.c4hero.json')) return found
      return {
        ...found,
        createWritable: async () => ({ write: async () => {}, close: async () => { throw new Error('layout close failed') } }),
      } as unknown as FileSystemFileHandle
    })
    vi.stubGlobal('showOpenFilePicker', vi.fn())
    vi.stubGlobal('showSaveFilePicker', vi.fn(async () => handle))
    const { saveDSLFile } = await import('./fileIO')
    expect(await saveDSLFile('saved', 'saved.dsl', '{"version":1,"views":{"V":{"locked":true}}}')).toBe(false)
    expect(rig.content['saved.dsl']).toBe('saved')
    expect(rig.content['saved.c4hero.json']).toBe('')
  })
})

describe('download fallback saves', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('downloads one ZIP containing both the exact DSL and meaningful layout bytes', async () => {
    const exports = await import('./exportUtils')
    const download = vi.spyOn(exports, 'downloadBlob').mockImplementation(() => {})
    const { saveDSLFile } = await import('./fileIO')
    const dsl = 'workspace "Café 🙂" {}'
    const sidecar = '{"version":1,"views":{"V":{"elements":{"api":{"pinned":true,"x":123,"y":456}}}}}'
    expect(await saveDSLFile(dsl, 'Café.dsl', sidecar)).toBe(true)
    expect(download).toHaveBeenCalledOnce()
    const [blob, filename] = download.mock.calls[0]
    expect(filename).toBe('Café.zip')
    expect(blob.type).toBe('application/zip')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const data = new DataView(bytes.buffer)
    const decoder = new TextDecoder()
    const entries: Array<{ path: string; content: string }> = []
    let offset = 0
    while (data.getUint32(offset, true) === 0x04034b50) {
      expect(data.getUint16(offset + 8, true)).toBe(0)
      const size = data.getUint32(offset + 18, true)
      const nameLength = data.getUint16(offset + 26, true)
      const extraLength = data.getUint16(offset + 28, true)
      const contentOffset = offset + 30 + nameLength + extraLength
      entries.push({
        path: decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)),
        content: decoder.decode(bytes.subarray(contentOffset, contentOffset + size)),
      })
      offset = contentOffset + size
    }
    expect(data.getUint32(offset, true)).toBe(0x02014b50)
    expect(entries).toEqual([
      { path: 'Café.dsl', content: dsl },
      { path: 'Café.c4hero.json', content: sidecar },
    ])
  })

  it.each([undefined, '{"version":1,"views":{}}'])('keeps a plain DSL download when layout is empty or absent (%s)', async (sidecar) => {
    const exports = await import('./exportUtils')
    const download = vi.spyOn(exports, 'downloadBlob').mockImplementation(() => {})
    const { saveDSLFile } = await import('./fileIO')
    expect(await saveDSLFile('workspace {}', 'plain.dsl', sidecar)).toBe(true)
    expect(download).toHaveBeenCalledOnce()
    const [blob, filename] = download.mock.calls[0]
    expect(filename).toBe('plain.dsl')
    expect(blob.type).toBe('text/plain')
    expect(await blob.text()).toBe('workspace {}')
  })

  it('reports failure without starting a download when creating the archive throws', async () => {
    const exports = await import('./exportUtils')
    const zip = await import('./zip')
    const download = vi.spyOn(exports, 'downloadBlob').mockImplementation(() => {})
    vi.spyOn(zip, 'zipBlob').mockImplementation(() => { throw new Error('archive failed') })
    const { saveDSLFile } = await import('./fileIO')
    expect(await saveDSLFile('workspace {}', 'layout.dsl', '{"version":1,"views":{"V":{"locked":true}}}')).toBe(false)
    expect(download).not.toHaveBeenCalled()
  })

  it.each([false, true])('reports failure if dispatching the %s layout download throws', async (hasLayout) => {
    const exports = await import('./exportUtils')
    vi.spyOn(exports, 'downloadBlob').mockImplementation(() => { throw new Error('download failed') })
    const { saveDSLFile } = await import('./fileIO')
    const sidecar = hasLayout ? '{"version":1,"views":{"V":{"locked":true}}}' : undefined
    expect(await saveDSLFile('workspace {}', 'save.dsl', sidecar)).toBe(false)
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


it('normalizes status whitespace when restoring crash recovery', async () => {
  const { mock } = makeMockLocalStorage()
  vi.stubGlobal('localStorage', mock)
  const { saveToLocalStorage, loadFromLocalStorage } = await import('./fileIO')
  const ws = makeWorkspace()
  ws.model.people[0].status = ' Live '
  ws.model.softwareSystems[0].status = ' Proposed '
  saveToLocalStorage(ws)
  const loaded = loadFromLocalStorage()!
  expect(loaded.model.people[0].status).toBe('Live')
  expect(loaded.model.softwareSystems[0].status).toBe('Proposed')
})
