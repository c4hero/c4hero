import { describe, it, expect, vi } from 'vitest'
import { applyEditPlan, describeOps, summarizeSkips, type EditActions } from './operations'
import type { EditPlan } from './types'
import { makeWorkspace } from './testFixture'
import { applyElementPatch } from '@/store/workspace-helpers'

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

  it('passes the external flag through when adding a software system', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    applyEditPlan({ operations: [
      { op: 'addSoftwareSystem', ref: 's1', name: 'Stripe', external: true },
      { op: 'addSoftwareSystem', ref: 's2', name: 'Orders Service' },
    ] }, actions, ws)
    expect(actions.addSoftwareSystem).toHaveBeenCalledWith('Stripe', true)
    expect(actions.addSoftwareSystem).toHaveBeenCalledWith('Orders Service', undefined)
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

  it('resolves refs defined by a LATER add op (plans are not pre-sorted)', () => {
    const ws = makeWorkspace()
    const plan: EditPlan = {
      operations: [
        // relationship emitted BEFORE the systems that define its endpoints
        { op: 'addRelationship', source: 'r1', destination: 'r2', description: 'Calls' },
        { op: 'addSoftwareSystem', ref: 'r1', name: 'API' },
        { op: 'addSoftwareSystem', ref: 'r2', name: 'DB' },
      ],
    }
    const lines = describeOps(plan, ws)
    expect(lines[0]).toContain('Connect API → DB')
  })
})

describe('applyEditPlan — parent-type and existence guards', () => {
  it('skips addContainer when the parent is not a software system', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    // 'web' is a container, not a system.
    const result = applyEditPlan({ operations: [{ op: 'addContainer', ref: 'x', parent: 'web', name: 'Sub' }] }, actions, ws)
    expect(actions.addContainer).not.toHaveBeenCalled()
    expect(result.appliedCount).toBe(0)
    expect(result.applied[0]).toMatchObject({ ok: false, reason: 'parent is not a software system' })
  })

  it('does not register a ref for a skipped addContainer, so its children stay unresolved', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [
      { op: 'addContainer', ref: 'bad', parent: 'admin', name: 'Sub' }, // admin is a person
      { op: 'addRelationship', source: 'web', destination: 'bad' },       // 'bad' must not resolve
    ] }, actions, ws)
    expect(actions.addContainer).not.toHaveBeenCalled()
    expect(actions.addRelationship).not.toHaveBeenCalled()
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(2)
  })

  it('skips addContainer under an external software system (the UI forbids it)', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [
      { op: 'addSoftwareSystem', ref: 'ext', name: 'Stripe', external: true },
      { op: 'addContainer', ref: 'c', parent: 'ext', name: 'API' },
    ] }, actions, ws)
    expect(actions.addContainer).not.toHaveBeenCalled()
    expect(result.applied.find((a) => a.op.op === 'addContainer')).toMatchObject({ ok: false, reason: 'parent is an external system' })
  })

  it('skips addComponent when the parent is not a container', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [{ op: 'addComponent', ref: 'c', parent: 'shop', name: 'Comp' }] }, actions, ws)
    expect(actions.addComponent).not.toHaveBeenCalled()
    expect(result.applied[0]).toMatchObject({ ok: false, reason: 'parent is not a container' })
  })

  it('adds a component under a real container', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [{ op: 'addComponent', ref: 'c', parent: 'web', name: 'Comp' }] }, actions, ws)
    expect(actions.addComponent).toHaveBeenCalledWith('web', 'Comp')
    expect(result.appliedCount).toBe(1)
  })

  it('applies parents before children even when the plan emits them out of order', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [
      { op: 'addComponent', ref: 'svc', parent: 'api', name: 'Service' }, // child emitted first
      { op: 'addContainer', ref: 'api', parent: 'sys', name: 'API' },
      { op: 'addSoftwareSystem', ref: 'sys', name: 'Billing' },           // grandparent last
    ] }, actions, ws)
    expect(result.appliedCount).toBe(3)
    expect(result.skippedCount).toBe(0)
  })

  it('resolves children against elements created earlier in the same plan', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [
      { op: 'addSoftwareSystem', ref: 'sys', name: 'Billing' },
      { op: 'addContainer', ref: 'api', parent: 'sys', name: 'API' },     // parent = just-created system
      { op: 'addComponent', ref: 'svc', parent: 'api', name: 'Service' }, // parent = just-created container
    ] }, actions, ws)
    expect(result.appliedCount).toBe(3)
    expect(result.skippedCount).toBe(0)
  })

  it('a new element sharing a name does not hijack by-name resolution of the existing one', () => {
    const ws = makeWorkspace() // has a container named "Web App" (id 'web')
    const actions = fakeActions()
    applyEditPlan({ operations: [
      { op: 'addSoftwareSystem', ref: 'dup', name: 'Web App' }, // same name as existing 'web'
      { op: 'addRelationship', source: 'cust', destination: 'Web App' }, // by name → must be existing 'web'
    ] }, actions, ws)
    // The relationship resolves to the pre-existing 'web', not the new system's id.
    expect(actions.addRelationship).toHaveBeenCalledWith('cust', 'web', undefined, undefined)
  })

  it('forwards a valid updateElement location and drops a bogus one', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    applyEditPlan({ operations: [
      { op: 'updateElement', id: 'shop', location: 'External' },
      { op: 'updateElement', id: 'web', location: 'sideways' as 'External' },
    ] }, actions, ws)
    expect(actions.updateElement).toHaveBeenCalledWith('shop', expect.objectContaining({ location: 'External' }))
    expect(actions.updateElement).toHaveBeenCalledWith('web', expect.objectContaining({ location: undefined }))
  })

  it('an updateElement that only sets location does not touch name/description/technology', () => {
    // Guards against a real bug: the store's applyElementPatch treats a
    // present-but-undefined key as "clear this field" (so the UI can blank a
    // text box). If the applier always included name/description/technology
    // keys — even when the op didn't set them — a location-only op (e.g. "mark
    // this system external") would silently wipe the element's description.
    const ws = makeWorkspace()
    const actions = fakeActions()
    applyEditPlan({ operations: [{ op: 'updateElement', id: 'shop', location: 'External' }] }, actions, ws)
    const patch = vi.mocked(actions.updateElement).mock.calls[0][1]
    expect(patch).not.toHaveProperty('name')
    expect(patch).not.toHaveProperty('description')
    expect(patch).not.toHaveProperty('technology')
  })

  it('reproduces the reported bug end-to-end: marking a system external keeps its description', () => {
    const ws = makeWorkspace() // 'shop' has description 'The store'
    const actions: EditActions = {
      ...fakeActions(),
      updateElement: (id, patch) => { applyElementPatch(ws, id, patch) },
    }
    applyEditPlan({ operations: [{ op: 'updateElement', id: 'shop', location: 'External' }] }, actions, ws)
    const shop = ws.model.softwareSystems.find((s) => s.id === 'shop')!
    expect(shop.location).toBe('External')
    expect(shop.description).toBe('The store')
  })

  it('an updateRelationship that only sets description does not touch technology, and vice versa', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    applyEditPlan({ operations: [
      { op: 'updateRelationship', id: 'r1', description: 'Browses the catalog' },
      { op: 'updateRelationship', id: 'r2', technology: 'HTTPS/JSON' },
    ] }, actions, ws)
    const [, descPatch] = vi.mocked(actions.updateRelationship).mock.calls.find(([id]) => id === 'r1')!
    const [, techPatch] = vi.mocked(actions.updateRelationship).mock.calls.find(([id]) => id === 'r2')!
    expect(descPatch).not.toHaveProperty('technology')
    expect(techPatch).not.toHaveProperty('description')
  })

  it('skips updateRelationship for an unknown relationship id', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const result = applyEditPlan({ operations: [
      { op: 'updateRelationship', id: 'nope', description: 'x' },
      { op: 'updateRelationship', id: 'r1', description: 'updated' },
    ] }, actions, ws)
    expect(actions.updateRelationship).toHaveBeenCalledTimes(1)
    expect(actions.updateRelationship).toHaveBeenCalledWith('r1', { description: 'updated', technology: undefined })
    expect(result.appliedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
  })
})

describe('describeOps — every op kind', () => {
  it('produces a readable line for each operation', () => {
    const ws = makeWorkspace()
    const lines = describeOps({ operations: [
      { op: 'addPerson', ref: 'p', name: 'New User' },
      { op: 'addSoftwareSystem', ref: 's', name: 'New Sys' },
      { op: 'addComponent', ref: 'c', parent: 'web', name: 'Worker', technology: 'Go' },
      { op: 'updateElement', id: 'web', name: 'Portal', description: 'd', technology: 'Vue' },
      { op: 'updateRelationship', id: 'r1', description: 'reads from' },
    ] }, ws)
    expect(lines[0]).toContain('Add person “New User”')
    expect(lines[1]).toContain('Add software system “New Sys”')
    expect(lines[2]).toContain('Worker')
    expect(lines[2]).toContain('Go')
    expect(lines[3]).toContain('rename “Portal”')
    expect(lines[4]).toContain('relationship')
  })
})

describe('applyEditPlan — malformed optional fields are dropped, not fatal', () => {
  it('does not throw when an optional string field is a non-string, and skips it', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    // isEditOp only validates the id for updates, so a non-string `description`
    // can reach the applier. It must not crash the whole apply at `.trim()`.
    const plan = { operations: [
      { op: 'updateElement', id: 'web', description: 5, name: 'Renamed' },
      { op: 'updateElement', id: 'cart', description: 'real description' },
    ] } as unknown as EditPlan
    expect(() => applyEditPlan(plan, actions, ws)).not.toThrow()
    // The bad field is dropped but the valid one (name) still applies. It must
    // not even be present as an `undefined` key — the store treats key presence
    // as "clear this field" (see the updateElement/updateRelationship tests below).
    expect(actions.updateElement).toHaveBeenCalledWith('web', expect.objectContaining({ name: 'Renamed' }))
    expect(vi.mocked(actions.updateElement).mock.calls[0][1]).not.toHaveProperty('description')
    expect(actions.updateElement).toHaveBeenCalledWith('cart', expect.objectContaining({ description: 'real description' }))
  })

  it('does not throw when an add op carries a non-string description', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan = { operations: [
      { op: 'addSoftwareSystem', ref: 's', name: 'New Sys', description: { nope: true } },
    ] } as unknown as EditPlan
    expect(() => applyEditPlan(plan, actions, ws)).not.toThrow()
    expect(actions.addSoftwareSystem).toHaveBeenCalledWith('New Sys', undefined)
    // No description update fired (the bad value was dropped).
    expect(actions.updateElement).not.toHaveBeenCalled()
  })

  it('does not throw when addRelationship carries a non-string description', () => {
    const ws = makeWorkspace()
    const actions = fakeActions()
    const plan = { operations: [
      { op: 'addRelationship', source: 'cust', destination: 'web', description: 7 },
    ] } as unknown as EditPlan
    expect(() => applyEditPlan(plan, actions, ws)).not.toThrow()
    // Created, with the bad description coerced to undefined.
    expect(actions.addRelationship).toHaveBeenCalledWith('cust', 'web', undefined, undefined)
  })
})

describe('summarizeSkips', () => {
  it('returns null when nothing was skipped', () => {
    const ws = makeWorkspace()
    const result = applyEditPlan({ operations: [
      { op: 'updateElement', id: 'web', description: 'Serves the storefront' },
    ] }, fakeActions(), ws)
    expect(summarizeSkips(result)).toBeNull()
  })

  it('summarizes a single skip with its reason', () => {
    const ws = makeWorkspace()
    const result = applyEditPlan({ operations: [
      { op: 'updateElement', id: 'web', description: 'ok' },
      { op: 'deleteElement', id: 'ghost' },
    ] }, fakeActions(), ws)
    expect(summarizeSkips(result)).toBe('Skipped 1 of 2 changes — element not found.')
  })

  it('groups repeated reasons with a count, most frequent first', () => {
    const ws = makeWorkspace()
    const result = applyEditPlan({ operations: [
      { op: 'addContainer', ref: 'a', parent: 'ghost', name: 'A' },
      { op: 'addContainer', ref: 'b', parent: 'ghost', name: 'B' },
      { op: 'deleteElement', id: 'ghost' },
    ] }, fakeActions(), ws)
    expect(summarizeSkips(result)).toBe('Skipped 3 of 3 changes — unknown parent system (2), element not found.')
  })

  it('uses singular "change" when the plan had one op', () => {
    const ws = makeWorkspace()
    const result = applyEditPlan({ operations: [
      { op: 'deleteElement', id: 'ghost' },
    ] }, fakeActions(), ws)
    expect(summarizeSkips(result)).toBe('Skipped 1 of 1 change — element not found.')
  })
})
