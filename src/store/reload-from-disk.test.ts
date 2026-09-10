import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { parseDSL } from '@/lib/dsl'

const BASE_DSL = `workspace "Test" {
    model {
        u = person "User"
        sys = softwareSystem "Sys" {
            web = container "Web"
        }
        u -> sys "Uses"
    }
    views {
        systemLandscape "Land" {
            include *
        }
        systemContext sys "Ctx" {
            include *
        }
        container sys "Containers" {
            include *
        }
    }
}`

function parse(dsl: string) {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  return workspace
}

function store() {
  return useWorkspaceStore.getState()
}

describe('reloadWorkspaceFromDisk', () => {
  beforeEach(() => {
    store().loadWorkspace(parse(BASE_DSL))
  })

  it('keeps the active view when its key survives', () => {
    store().setActiveView('Ctx')
    store().reloadWorkspaceFromDisk(parse(BASE_DSL.replace('"Web"', '"Web App"')))
    expect(store().activeViewKey).toBe('Ctx')
    expect(store().workspace!.model.softwareSystems[0].containers[0].name).toBe('Web App')
  })

  it('falls back to a view of the same type, then to the first view', () => {
    store().setActiveView('Ctx')
    // Ctx renamed → another systemContext view exists → pick it.
    store().reloadWorkspaceFromDisk(parse(BASE_DSL.replace('systemContext sys "Ctx"', 'systemContext sys "Overview"')))
    expect(store().activeViewKey).toBe('Overview')

    // No systemContext view at all → first view.
    store().reloadWorkspaceFromDisk(parse(BASE_DSL.replace(/systemContext sys "Ctx" \{\s*include \*\s*\}/, '')))
    expect(store().activeViewKey).toBe('Land')
  })

  it('prunes view history and keeps only surviving selected elements', () => {
    store().setActiveView('Containers')
    // drillInto is what normally pushes history; seed it directly here.
    useWorkspaceStore.setState({ viewHistory: ['Land', 'Containers'] })
    store().selectElements(['u', 'web'])

    store().reloadWorkspaceFromDisk(parse(BASE_DSL
      .replace(/container sys "Containers" \{\s*include \*\s*\}/, '')
      .replace(/web = container "Web"\s*/, '')))

    expect(store().viewHistory).toEqual(['Land'])
    expect(store().selectedElementIds).toEqual(['u'])
    // The active view was removed and was a container view; none remain → first view.
    expect(store().activeViewKey).toBe('Land')
  })

  it('clears undo history and marks the workspace clean', () => {
    store().updateWorkspaceMeta({ name: 'Renamed' })
    expect(store().undoStack.length).toBe(1)
    store().reloadWorkspaceFromDisk(parse(BASE_DSL))
    expect(store().undoStack).toEqual([])
    expect(store().redoStack).toEqual([])
    expect(store().lastSavedUndoLength).toBe(0)
    expect(store().canUndo()).toBe(false)
  })

  it('clears any disk conflict and missing-file flag', () => {
    store().setDiskConflict({
      filename: 'test.dsl',
      snapshot: { content: 'x' },
      hashes: { dsl: 'a', sidecar: 'b' },
      reason: 'dirty',
    })
    store().setDiskFileMissing(true)
    store().reloadWorkspaceFromDisk(parse(BASE_DSL))
    expect(store().diskConflict).toBeNull()
    expect(store().diskFileMissing).toBe(false)
  })

  it('leaves canvas highlight filters alone, unlike loadWorkspace', () => {
    useWorkspaceStore.setState({ activeTagFilter: ['Person'] })
    store().reloadWorkspaceFromDisk(parse(BASE_DSL))
    expect(store().activeTagFilter).toEqual(['Person'])
  })
})

describe('watch mode flags', () => {
  it('turning watch off drops any pending prompt', () => {
    store().setDiskFileMissing(true)
    store().setWatchDisk(false)
    expect(store().watchDisk).toBe(false)
    expect(store().diskFileMissing).toBe(false)
    store().toggleWatchDisk()
    expect(store().watchDisk).toBe(true)
  })

  it('setCodePaneDirty is a no-op when unchanged', () => {
    const before = useWorkspaceStore.getState()
    store().setCodePaneDirty(false)
    expect(useWorkspaceStore.getState()).toBe(before)
    store().setCodePaneDirty(true)
    expect(store().codePaneDirty).toBe(true)
    store().setCodePaneDirty(false)
  })
})
