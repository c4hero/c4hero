import { describe, it, expect, vi } from 'vitest'
import { applyEditPlan, describeOps, type EditActions } from './operations'
import type { EditPlan } from './types'
import { makeWorkspace } from './testFixture'

function fakeActions() {
  let counter = 0
  const newId = () => `gen${++counter}`
  const actions: EditActions = {
    addPerson: vi.fn(() => newId()),
    addSoftwareSystem: vi.fn(() => newId()),
    addContainer: vi.fn(() => newId()),
    addComponent: vi.fn(() => newId()),
    addRelationship: vi.fn(() => newId()),
    updateElement: vi.fn(),
    updateRelationship: vi.fn(),
    deleteElement: vi.fn(),
  }
  return actions
}

describe('applyEditPlan', () => {
  it('creates a new container and connects it to an existing element via refs', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = {
      operations: [
        { op: 'addContainer', ref: 'cache', parent: 'shop', name: 'Redis Cache', technology: 'Redis' },
        { op: 'addRelationship', source: 'web', destination: 'cache', description: 'Caches sessions' },
      ],
    }
    const result = applyEditPlan(plan, actions, ws)

    expect(actions.addContainer).toHaveBeenCalledWith('shop', 'Redis Cache')
    // The relationship resolves the ref to the id the store returned ('gen1').
    expect(actions.addRelationship).toHaveBeenCalledWith('web', 'gen1', 'Caches sessions', undefined)
    expect(result.appliedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
  })

  it('skips ops with an unresolvable parent or endpoint', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = {
      operations: [
        { op: 'addContainer', ref: 'x', parent: 'ghost', name: 'Nope' },
        { op: 'addRelationship', source: 'web', destination: 'ghost' },
      ],
    }
    const result = applyEditPlan(plan, actions, ws)
    expect(actions.addContainer).not.toHaveBeenCalled()
    expect(actions.addRelationship).not.toHaveBeenCalled()
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(2)
    expect(result.applied[0].reason).toBe('unknown parent system')
  })

  it('skips updates/deletes targeting non-existent ids', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = {
      operations: [
        { op: 'updateElement', id: 'missing', description: 'x' },
        { op: 'deleteElement', id: 'cust' },
      ],
    }
    const result = applyEditPlan(plan, actions, ws)
    expect(actions.updateElement).not.toHaveBeenCalled()
    expect(actions.deleteElement).toHaveBeenCalledWith('cust')
    expect(result.appliedCount).toBe(1)
  })

  it('skips self-relationships', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = { operations: [{ op: 'addRelationship', source: 'web', destination: 'web' }] }
    const result = applyEditPlan(plan, actions, ws)
    expect(result.skippedCount).toBe(1)
    expect(result.applied[0].reason).toBe('self-relationship')
  })

  it('applies a description on a newly added element', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = {
      operations: [{ op: 'addPerson', ref: 'p', name: 'Auditor', description: 'Reviews logs' }],
    }
    applyEditPlan(plan, actions, ws)
    expect(actions.updateElement).toHaveBeenCalledWith('gen1', { description: 'Reviews logs' })
  })

  it('resolves parents and relationship endpoints by element name, not just id/ref', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan: EditPlan = {
      operations: [
        // parent given by name ("Shop") rather than id ("shop")
        { op: 'addContainer', ref: 'c1', parent: 'Shop', name: 'Redis Cache' },
        // both endpoints by name: existing ("Web App") + the just-added ("Redis Cache")
        { op: 'addRelationship', source: 'Web App', destination: 'Redis Cache', description: 'Caches' },
      ],
    }
    const result = applyEditPlan(plan, actions, ws)
    expect(actions.addContainer).toHaveBeenCalledWith('shop', 'Redis Cache')
    expect(actions.addRelationship).toHaveBeenCalledWith('web', 'gen1', 'Caches', undefined)
    expect(result.appliedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
  })
})

describe('describeOps', () => {
  it('renders human-readable lines resolving ids to names', () => {
    const ws = makeWorkspace()
    const plan: EditPlan = {
      operations: [
        { op: 'addContainer', ref: 'cache', parent: 'shop', name: 'Redis', technology: 'Redis' },
        { op: 'addRelationship', source: 'web', destination: 'cache', description: 'Caches' },
        { op: 'deleteElement', id: 'db' },
      ],
    }
    const lines = describeOps(plan, ws)
    expect(lines[0]).toContain('Add container “Redis”')
    expect(lines[0]).toContain('to Shop')
    expect(lines[1]).toContain('Web App → Redis')
    expect(lines[2]).toBe('Delete Database')
  })
})
