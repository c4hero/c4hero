import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { File as NativeFile } from 'node:buffer'
import { parseDSL } from './dsl'
import { setDirHandle } from './folderIO'
import { writeFileIfChanged } from './fileIO'
import { writeLinkedWorkspace } from './workspaceSave'
import { loadWorkspaceDocument } from './workspaceDocument'
import { resetSaveCoordinator } from './saveCoordinator'
import { makeCountingDirHandle } from './testing/countingDirHandle'
import { useWorkspaceStore } from '@/store/workspace'

const DSL = `workspace "Capture" {
  model {
    s = softwareSystem "Shop"
  }
  views { systemContext s "Context" { include * } }
}`
const INCLUDE = 's = softwareSystem "Shop"\n'

function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

async function holdUnrelatedWrite() {
  const entered = barrier()
  const release = barrier()
  const pending = writeFileIfChanged({
    getFile: async () => new NativeFile(['old'], 'doc.md'),
    createWritable: async () => ({
      write: async () => {},
      close: async () => { entered.release(); await release.promise },
    }),
  } as unknown as FileSystemFileHandle, 'new')
  await entered.promise
  return { pending, release: release.release }
}

async function includedWorkspace() {
  const result = await loadWorkspaceDocument({
    content: DSL.replace('s = softwareSystem "Shop"', '!include inc.dsl\n'),
    readInclude: async () => INCLUDE,
  })
  expect(result.errors).toEqual([])
  expect(result.workspace.includedFiles?.[0].writable).toBe(true)
  return result.workspace
}

beforeEach(() => {
  resetSaveCoordinator()
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = {
        onsuccess: null as (() => void) | null,
        result: { transaction: () => ({ objectStore: () => ({ put: () => {} }) }) },
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('workspace saves through real writer boundaries', () => {
  it('preserves both collections when the selection changes while a save is queued', async () => {
    const original = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'original')
    const switched = makeCountingDirHandle({
      'workspace.dsl': 'workspace "Other" {}',
      'workspace.c4hero.json': '{"version":1,"views":{"Other":{"locked":true}}}',
      'inc.dsl': 'other collection model',
    }, 'switched')
    const before = { ...switched.content }
    await setDirHandle(original.dir)
    const workspace = await includedWorkspace()
    Object.assign(workspace.views.systemContextViews[0].elements[0], { x: 42, y: 17, pinned: true })
    const held = await holdUnrelatedWrite()
    const save = writeLinkedWorkspace(workspace, 'workspace.dsl')
    try {
      await setDirHandle(switched.dir)
    } finally {
      held.release()
    }
    expect(await save).toBe(true)
    await held.pending
    expect(switched.content).toEqual(before)
    expect(switched.opened).toEqual({})
    expect(original.content['workspace.c4hero.json']).toContain('42')
    expect(original.content['inc.dsl']).toContain('softwareSystem "Shop"')
  })

  it('returns failure for a rejected layout write and succeeds after permission is restored', async () => {
    const rig = makeCountingDirHandle({}, 'layout-failure')
    const lookup = rig.dir.getFileHandle.bind(rig.dir)
    let fail = true
    vi.spyOn(rig.dir, 'getFileHandle').mockImplementation(async (name, opts) => {
      if (fail && name.endsWith('.c4hero.json')) throw new DOMException('Permission denied', 'NotAllowedError')
      return lookup(name, opts)
    })
    await setDirHandle(rig.dir)
    const workspace = parseDSL(DSL).workspace
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(false)
    expect(rig.content['workspace.dsl']).toContain('softwareSystem "Shop"')
    expect(rig.content['workspace.c4hero.json']).toBeUndefined()
    fail = false
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(true)
    expect(rig.opened['workspace.dsl']).toBe(1)
    expect(rig.content['workspace.c4hero.json']).toBeDefined()
  })

  it('retries unchanged included bytes after a temporary failure', async () => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'include-failure')
    const lookup = rig.dir.getFileHandle.bind(rig.dir)
    let fail = true
    let attempts = 0
    vi.spyOn(rig.dir, 'getFileHandle').mockImplementation(async (name, opts) => {
      const handle = await lookup(name, opts)
      if (name !== 'inc.dsl') return handle
      return {
        ...handle,
        createWritable: async () => {
          attempts++
          if (fail) throw new Error('Temporary include failure')
          return handle.createWritable()
        },
      } as FileSystemFileHandle
    })
    await setDirHandle(rig.dir)
    const workspace = await includedWorkspace()
    workspace.model.softwareSystems[0].name = 'Changed Shop'
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(false)
    expect(rig.content['inc.dsl']).toBe(INCLUDE)
    fail = false
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(true)
    expect(attempts).toBe(2)
    expect(rig.content['inc.dsl']).toContain('softwareSystem "Changed Shop"')
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(true)
    expect(attempts).toBe(2)
  })

  it('captures all serialized bytes at request time and completes saves in request order', async () => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'ordered')
    await setDirHandle(rig.dir)
    const workspace = await includedWorkspace()
    workspace.model.softwareSystems[0].name = 'First edit'
    const held = await holdUnrelatedWrite()
    const first = writeLinkedWorkspace(workspace, 'workspace.dsl')
    workspace.model.softwareSystems[0].name = 'Newest'
    Object.assign(workspace.views.systemContextViews[0].elements[0], { x: 99, y: 17, pinned: true })
    const second = writeLinkedWorkspace(workspace, 'workspace.dsl')
    const written: string[] = []
    const lookup = rig.dir.getFileHandle.bind(rig.dir)
    vi.spyOn(rig.dir, 'getFileHandle').mockImplementation(async (name, opts) => {
      const handle = await lookup(name, opts)
      if (name !== 'inc.dsl') return handle
      return {
        ...handle,
        createWritable: async () => {
          const writable = await handle.createWritable()
          return { write: async (data: string) => { written.push(data); await writable.write(data) }, close: () => writable.close() }
        },
      } as FileSystemFileHandle
    })
    held.release()
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    await held.pending
    expect(written).toHaveLength(2)
    expect(written[0]).toContain('softwareSystem "First edit"')
    expect(written[1]).toContain('softwareSystem "Newest"')
    expect(rig.content['workspace.c4hero.json']).toContain('99')
    expect(rig.content['inc.dsl']).toBe(written[1])
  })

  it('reserves a complete queued save before a later direct writer', async () => {
    const rig = makeCountingDirHandle({}, 'direct-order')
    await setDirHandle(rig.dir)
    const held = await holdUnrelatedWrite()
    const save = writeLinkedWorkspace(parseDSL(DSL).workspace, 'workspace.dsl')
    const newest = 'workspace "Later direct save" {}'
    const direct = writeFileIfChanged(() => rig.dir.getFileHandle('workspace.dsl', { create: true }), newest)
    held.release()
    expect(await save).toBe(true)
    expect(await direct).toBe(true)
    await held.pending
    expect(rig.content['workspace.dsl']).toBe(newest)
  })

  it('preserves external include edits during a layout-only save and a later model save', async () => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'external-include')
    await setDirHandle(rig.dir)
    const workspace = await includedWorkspace()
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(true)
    const writes = rig.opened['inc.dsl'] ?? 0
    const external = 's = softwareSystem "External editor change"\n'
    rig.content['inc.dsl'] = external
    Object.assign(workspace.views.systemContextViews[0].elements[0], { x: 81, y: 39, pinned: true })
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(false)
    expect(rig.content['workspace.c4hero.json']).toContain('81')
    expect(rig.content['inc.dsl']).toBe(external)
    workspace.model.softwareSystems[0].name = 'Unsaved local change'
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(false)
    expect(rig.content['inc.dsl']).toBe(external)
    expect(rig.opened['inc.dsl'] ?? 0).toBe(writes)
  })

  it('accepts externally changed includes after they are deliberately reloaded', async () => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'reloaded-include')
    await setDirHandle(rig.dir)
    expect(await writeLinkedWorkspace(await includedWorkspace(), 'workspace.dsl')).toBe(true)
    const external = 's = softwareSystem "Reloaded Shop"\n'
    rig.content['inc.dsl'] = external
    const loaded = await loadWorkspaceDocument({
      content: DSL.replace('s = softwareSystem "Shop"', '!include inc.dsl\n'),
      readInclude: async () => external,
    })
    loaded.workspace.model.softwareSystems[0].name = 'Edited after reload'
    expect(await writeLinkedWorkspace(loaded.workspace, 'workspace.dsl')).toBe(true)
    expect(rig.content['inc.dsl']).toContain('softwareSystem "Edited after reload"')
  })

  it('does not overwrite include edits made before the first save', async () => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'first-save-external')
    await setDirHandle(rig.dir)
    const workspace = await includedWorkspace()
    rig.content['inc.dsl'] = 's = softwareSystem "Changed after opening"\n'
    const external = rig.content['inc.dsl']
    expect(await writeLinkedWorkspace(workspace, 'workspace.dsl')).toBe(false)
    expect(rig.content['inc.dsl']).toBe(external)
    expect(rig.opened['inc.dsl']).toBeUndefined()
  })

  it.each(['loadWorkspace', 'reloadWorkspaceFromDisk'] as const)('accepts a deliberate restoration to the original text after %s', async load => {
    const rig = makeCountingDirHandle({ 'inc.dsl': INCLUDE }, 'restored-include')
    await setDirHandle(rig.dir)
    const first = await includedWorkspace()
    first.model.softwareSystems[0].name = 'First edit'
    useWorkspaceStore.getState().loadWorkspace(first)
    expect(await writeLinkedWorkspace(first, 'workspace.dsl')).toBe(true)
    rig.content['inc.dsl'] = INCLUDE
    const restored = await includedWorkspace()
    restored.model.softwareSystems[0].name = 'Edited restoration'
    useWorkspaceStore.getState()[load](restored)
    expect(await writeLinkedWorkspace(restored, 'workspace.dsl')).toBe(true)
    expect(rig.content['inc.dsl']).toContain('softwareSystem "Edited restoration"')
  })
})
