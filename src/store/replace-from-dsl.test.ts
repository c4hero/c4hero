import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { parseDSL } from '@/lib/dsl'

const BASE_DSL = `workspace "Test" {
    model {
        u = person "User"
        sys = softwareSystem "Sys"
        u -> sys "Uses"
    }
    views {
        systemContext sys "Main" {
            include *
        }
        systemLandscape "Land" {
            include *
        }
    }
}`

function load(dsl: string = BASE_DSL) {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  useWorkspaceStore.getState().loadWorkspace(workspace)
}

function store() {
  return useWorkspaceStore.getState()
}

describe('replaceWorkspaceFromDSL', () => {
  beforeEach(() => {
    load()
  })

  it('applies clean DSL as exactly one undo entry', () => {
    const before = store().workspace!
    const undoLenBefore = store().undoStack.length

    const result = store().replaceWorkspaceFromDSL(
      BASE_DSL.replace('u = person "User"', 'u = person "User" "A customer"'),
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(store().undoStack.length).toBe(undoLenBefore + 1)
    expect(store().workspace!.model.people[0].description).toBe('A customer')

    store().undo()
    expect(store().workspace).toBe(before)
    expect(store().workspace!.model.people[0].description).toBeUndefined()
  })

  it('rejects DSL with parse errors and leaves the store untouched', () => {
    const before = store().workspace!
    const undoLenBefore = store().undoStack.length

    const result = store().replaceWorkspaceFromDSL('workspace "Broken" { model { u = person }')

    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toHaveProperty('line')
    expect(result.errors[0]).toHaveProperty('column')
    expect(store().workspace).toBe(before)
    expect(store().undoStack.length).toBe(undoLenBefore)
  })

  it('carries element positions and view locks over by view key + element id', () => {
    // Position an element in the "Main" view and lock the "Land" view.
    store().setActiveView('Main')
    store().updateNodePosition('u', 123, 456)
    store().setViewLocked('Land', true)

    const result = store().replaceWorkspaceFromDSL(
      BASE_DSL.replace('sys = softwareSystem "Sys"', 'sys = softwareSystem "Sys" "The system"'),
    )
    expect(result.ok).toBe(true)

    const ws = store().workspace!
    const main = ws.views.systemContextViews.find((v) => v.key === 'Main')!
    const u = main.elements.find((el) => el.id === 'u')!
    expect(u.x).toBe(123)
    expect(u.y).toBe(456)
    const land = ws.views.systemLandscapeViews.find((v) => v.key === 'Land')!
    expect(land.locked).toBe(true)
  })

  it('falls back to the first view when the active view was deleted by the edit', () => {
    store().setActiveView('Land')
    expect(store().activeViewKey).toBe('Land')

    const withoutLand = BASE_DSL.replace(/systemLandscape "Land" \{\s*include \*\s*\}/, '')
    const result = store().replaceWorkspaceFromDSL(withoutLand)

    expect(result.ok).toBe(true)
    expect(store().activeViewKey).toBe('Main')
    expect(store().viewHistory).toEqual([])
  })

  it('clears the selection on apply', () => {
    store().selectElements(['u'])
    const result = store().replaceWorkspaceFromDSL(BASE_DSL.replace('"Uses"', '"Calls"'))
    expect(result.ok).toBe(true)
    expect(store().selectedElementIds).toEqual([])
    expect(store().selectedRelationshipId).toBeNull()
  })

  it('carries positions by name when an element has no stable id (id churn)', () => {
    // The landscape view includes elements regardless of relationships, so the
    // person stays in view even after its (anonymous) relationship is dropped.
    store().setActiveView('Land')
    store().updateNodePosition('u', 77, 88)

    // Drop the `u =` identifier: the parser now generates a fresh id for the
    // person on every parse, so the id-based match misses and the name-based
    // fallback must kick in.
    const anonymous = BASE_DSL.replace('u = person "User"', 'person "User"').replace('u -> sys "Uses"', '')
    const result = store().replaceWorkspaceFromDSL(anonymous)
    expect(result.ok).toBe(true)

    const ws = store().workspace!
    const person = ws.model.people.find((p) => p.name === 'User')!
    expect(person.id).not.toBe('u')
    const land = ws.views.systemLandscapeViews.find((v) => v.key === 'Land')!
    const el = land.elements.find((e) => e.id === person.id)!
    expect(el.x).toBe(77)
    expect(el.y).toBe(88)
  })

  it('refuses to empty a non-empty model (lenient-parser guard)', () => {
    const before = store().workspace!
    // All of these parse with ZERO errors but yield an empty model — the exact
    // states the editor passes through mid-typing.
    for (const text of ['', 'workspace "Broken" {', 'garbage text here', 'workspace {{{']) {
      const result = store().replaceWorkspaceFromDSL(text)
      expect(result.ok).toBe(false)
      expect(result.errors[0].message).toMatch(/empty model/i)
    }
    expect(store().workspace).toBe(before)
  })

  it('still allows applying an empty model over an already-empty one', () => {
    load('workspace "Empty" { model { } }')
    const result = store().replaceWorkspaceFromDSL('workspace "Still Empty" { model { } }')
    expect(result.ok).toBe(true)
    expect(store().workspace!.name).toBe('Still Empty')
  })

  it('fails without touching anything when no workspace is open', () => {
    store().closeWorkspace()
    const result = store().replaceWorkspaceFromDSL(BASE_DSL)
    expect(result.ok).toBe(false)
    expect(result.errors[0].message).toMatch(/no workspace/i)
    expect(store().workspace).toBeNull()
  })
})
