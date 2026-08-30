import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { eligibleStepElements } from '@/lib/dynamicSteps'

const DSL = `workspace {
  model {
    user = person "User"
    sys = softwareSystem "Sys" {
      web = container "Web"
      api = container "Api"
    }
    other = softwareSystem "Other"
    user -> web "Uses"
    web -> api "Calls"
    api -> other "Notifies"
  }
  views {
    container sys "Containers" { include * }
    dynamic sys "Flow" {
      user -> web "Opens app"
      web -> api "Calls"
    }
  }
}`

function load() {
  const { workspace: ws, errors } = parseDSL(DSL)
  expect(errors).toHaveLength(0)
  useWorkspaceStore.getState().loadWorkspace(ws)
  return useWorkspaceStore.getState().workspace!
}

function view() {
  return useWorkspaceStore.getState().workspace!.views.dynamicViews[0]
}

function idOf(name: string): string {
  const ws = useWorkspaceStore.getState().workspace!
  const all = [
    ...ws.model.people,
    ...ws.model.softwareSystems,
    ...ws.model.softwareSystems.flatMap(s => s.containers),
  ]
  return all.find(el => el.name === name)!.id
}

describe('dynamic step editing', () => {
  beforeEach(() => {
    load()
  })

  it('adds a step over an existing forward relationship without creating a duplicate', () => {
    const relCount = useWorkspaceStore.getState().workspace!.model.relationships.length
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('Web'), idOf('Api'), 'Retries')
    const v = view()
    expect(v.relationships).toHaveLength(3)
    expect(v.relationships[2].order).toBe('3')
    expect(v.relationships[2].description).toBe('Retries')
    expect(v.relationships[2].response).toBeUndefined()
    // Reused the existing web -> api relationship
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(relCount)
    expect(v.relationships[2].id).toBe(v.relationships[1].id)
  })

  it('adds a response step when only the reverse relationship exists', () => {
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('Api'), idOf('Web'), 'Returns data')
    const v = view()
    const step = v.relationships[2]
    expect(step.response).toBe(true)
    expect(step.sourceId).toBe(idOf('Api'))
    expect(step.destinationId).toBe(idOf('Web'))
    // Backed by the existing forward relationship
    expect(step.id).toBe(v.relationships[1].id)
  })

  it('creates the model relationship when none exists, and syncs it into non-dynamic views', () => {
    const before = useWorkspaceStore.getState().workspace!.model.relationships.length
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('Web'), idOf('Other'), 'Streams events')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(before + 1)
    const created = ws.model.relationships[ws.model.relationships.length - 1]
    expect(created.description).toBe('Streams events')
    // The container view holds both endpoints, so it picks the relationship up…
    const containerView = ws.views.containerViews[0]
    expect(containerView.relationships.some(r => r.id === created.id)).toBe(true)
    // …and the step does NOT duplicate the description as an override.
    expect(view().relationships[2].description).toBeUndefined()
    // The new endpoint joins the dynamic view's membership.
    expect(view().elements.some(e => e.id === idOf('Other'))).toBe(true)
  })

  it('reorders steps and renumbers sequentially', () => {
    useWorkspaceStore.getState().moveDynamicStep('Flow', 1, 'up')
    const v = view()
    expect(v.relationships.map(r => r.order)).toEqual(['1', '2'])
    expect(v.relationships[0].description).toBe('Calls')
    expect(v.relationships[1].description).toBe('Opens app')
    // No-ops at the boundaries
    useWorkspaceStore.getState().moveDynamicStep('Flow', 0, 'up')
    expect(view().relationships[0].description).toBe('Calls')
  })

  it('deletes a step, renumbers, and drops elements with no surviving steps', () => {
    useWorkspaceStore.getState().deleteDynamicStep('Flow', 0)
    const v = view()
    expect(v.relationships).toHaveLength(1)
    expect(v.relationships[0].order).toBe('1')
    expect(v.relationships[0].description).toBe('Calls')
    // 'User' only appeared in the deleted step
    expect(v.elements.some(e => e.id === idOf('User'))).toBe(false)
    expect(v.elements.some(e => e.id === idOf('Web'))).toBe(true)
  })

  it('updates and clears a step description override', () => {
    useWorkspaceStore.getState().updateDynamicStepDescription('Flow', 1, 'Calls with retry')
    expect(view().relationships[1].description).toBe('Calls with retry')
    // Setting it back to the relationship's own description clears the override
    useWorkspaceStore.getState().updateDynamicStepDescription('Flow', 1, 'Calls')
    expect(view().relationships[1].description).toBeUndefined()
  })

  it('step edits are undoable', () => {
    useWorkspaceStore.getState().deleteDynamicStep('Flow', 0)
    expect(view().relationships).toHaveLength(1)
    useWorkspaceStore.getState().undo()
    const v = view()
    expect(v.relationships).toHaveLength(2)
    expect(v.relationships[0].description).toBe('Opens app')
  })

  it('an edited view serializes to DSL that re-parses to the same steps', () => {
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('Api'), idOf('Web'), 'Returns data')
    useWorkspaceStore.getState().moveDynamicStep('Flow', 2, 'up')
    const ws = useWorkspaceStore.getState().workspace!
    const { workspace: reparsed, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toHaveLength(0)
    const original = ws.views.dynamicViews[0]
    const roundTripped = reparsed.views.dynamicViews[0]
    expect(roundTripped.relationships.map(r => r.order)).toEqual(original.relationships.map(r => r.order))
    expect(roundTripped.relationships[1].response).toBe(true)
  })

  it('ignores invalid input: self-steps, unknown elements, non-dynamic views', () => {
    const before = view().relationships.length
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('Web'), idOf('Web'))
    useWorkspaceStore.getState().addDynamicStep('Flow', 'nope', idOf('Web'))
    useWorkspaceStore.getState().addDynamicStep('Containers', idOf('Web'), idOf('Api'))
    expect(view().relationships).toHaveLength(before)
    expect(useWorkspaceStore.getState().workspace!.views.containerViews[0].relationships).toHaveLength(3)
  })

  it('eligibleStepElements follows the oracle-verified scope rules', () => {
    const ws = useWorkspaceStore.getState().workspace!
    const dynamicView = ws.views.dynamicViews[0] // scoped to sys
    const names = eligibleStepElements(ws, dynamicView).map(e => e.name)
    expect(names).toContain('User')
    expect(names).toContain('Other')
    expect(names).toContain('Web')
    // Unscoped: people + systems only
    const unscoped = { ...dynamicView, softwareSystemId: undefined, containerId: undefined }
    const unscopedNames = eligibleStepElements(ws, unscoped).map(e => e.name)
    expect(unscopedNames).toContain('User')
    expect(unscopedNames).not.toContain('Web')
  })
})
