import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'

const ROOT = `workspace "Org" {
    model {
        !include rw.dsl
        !include ro.dsl
        u = person "User"
        u -> a "Uses"
    }
    views {
        systemLandscape "Land" { include * }
    }
}`
const read = async (p: string) => ({
  // Has its own directive → read-only.
  'ro.dsl': '!const X "1"\na = softwareSystem "A"\na -> b "Calls"\n',
  'rw.dsl': 'b = softwareSystem "B"\n',
})[p] ?? null

function store() { return useWorkspaceStore.getState() }

describe('read-only included content (TEA-325)', () => {
  beforeEach(async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    store().loadWorkspace(workspace)
  })

  it('blocks edits to elements from a read-only file but allows writable and root ones', () => {
    const before = store().undoStack.length
    store().updateElement('a', { description: 'nope' })
    expect(store().workspace!.model.softwareSystems.find((s) => s.id === 'a')!.description).toBeUndefined()
    expect(store().undoStack.length).toBe(before)

    store().updateElement('b', { description: 'yes' })
    expect(store().workspace!.model.softwareSystems.find((s) => s.id === 'b')!.description).toBe('yes')
    store().updateElement('u', { description: 'root' })
    expect(store().workspace!.model.people[0].description).toBe('root')
  })

  it('never deletes read-only elements, nor elements a read-only file still references', () => {
    // `a` is read-only; `b` is writable but ro.dsl declares `a -> b`, which
    // would dangle if `b` went — and ro.dsl is never rewritten.
    store().deleteElements(['a', 'b'])
    const ids = store().workspace!.model.softwareSystems.map((s) => s.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('blocks relationship edits and deletes owned by a read-only file', () => {
    const rel = store().workspace!.model.relationships.find((r) => r.description === 'Calls')!
    store().updateRelationship(rel.id, { description: 'changed' })
    expect(store().workspace!.model.relationships.find((r) => r.id === rel.id)!.description).toBe('Calls')
    store().deleteRelationship(rel.id)
    expect(store().workspace!.model.relationships.some((r) => r.id === rel.id)).toBe(true)

    const rootRel = store().workspace!.model.relationships.find((r) => r.description === 'Uses')!
    store().deleteRelationship(rootRel.id)
    expect(store().workspace!.model.relationships.some((r) => r.id === rootRel.id)).toBe(false)
  })

  it('a code-pane apply of the root text keeps included content attached', () => {
    const rootText = `workspace "Org" {
    model {
        !include rw.dsl
        !include ro.dsl
        u = person "User Renamed"
        u -> a "Uses"
    }
    views {
        systemLandscape "Land" { include * }
    }
}`
    const result = store().replaceWorkspaceFromDSL(rootText)
    expect(result.ok).toBe(true)
    const ws = store().workspace!
    expect(ws.model.people[0].name).toBe('User Renamed')
    expect(ws.model.softwareSystems.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(ws.model.softwareSystems.find((s) => s.id === 'a')!.sourcePath).toBe('ro.dsl')
    expect(ws.includedFiles?.map((f) => f.path)).toEqual(['rw.dsl', 'ro.dsl'])
    expect(ws.model.relationships.map((r) => r.description).sort()).toEqual(['Calls', 'Uses'])
  })
})
