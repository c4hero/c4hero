import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { checkModelIntegrity } from '@/lib/modelIntegrity'
import type { Workspace } from '@/types/model'

/** A workspace exercising every reference kind the ID cascade must rewrite:
 *  relationship endpoints, group membership, view membership + scope, dynamic
 *  steps, deployment instances, and an auto-view key embedding the ID.
 *  Elements carry no idIsAuto — they model an imported (pinned) workspace. */
function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{
        id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
        containers: [{ id: 'web', type: 'container', name: 'Web App', tags: ['Element', 'Container'], properties: {}, components: [] }],
      }],
      relationships: [
        { id: 'rel1', sourceId: 'alice', destinationId: 'api', description: 'Uses', tags: [], properties: {} },
      ],
      groups: [{ id: 'g1', name: 'Team', elementIds: ['alice', 'api'] }],
      deploymentEnvironments: [{
        id: 'prod', name: 'Production',
        deploymentNodes: [{
          id: 'node1', type: 'deploymentNode', name: 'Server', tags: [], properties: {},
          children: [], infrastructureNodes: [],
          containerInstances: [{ id: 'ci1', type: 'containerInstance', containerId: 'web', tags: [], properties: {} }],
          softwareSystemInstances: [{ id: 'si1', type: 'softwareSystemInstance', softwareSystemId: 'api', tags: [], properties: {} }],
        }],
      }],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [{
        type: 'systemContext', key: 'SystemContext-api', autoKey: true, autoView: true,
        softwareSystemId: 'api',
        elements: [{ id: 'api', x: 1, y: 2, pinned: true }, { id: 'alice' }],
        relationships: [{ id: 'rel1' }],
      }],
      containerViews: [],
      componentViews: [],
      dynamicViews: [{
        type: 'dynamic', key: 'dyn1',
        elements: [{ id: 'alice' }, { id: 'api' }],
        relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'api', order: '1' }],
      }],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
})

const ws = () => useWorkspaceStore.getState().workspace!

describe('derived IDs on creation', () => {
  it('derives a camelCase ID from the name and marks it auto', () => {
    const id = useWorkspaceStore.getState().addPerson('Payment Clerk')
    expect(id).toBe('paymentClerk')
    const person = ws().model.people.find(p => p.id === id)!
    expect(person.idIsAuto).toBe(true)
  })

  it('dedupes derived IDs numerically', () => {
    // "Alice" the person exists with id "alice" already.
    const id = useWorkspaceStore.getState().addSoftwareSystem('Alice')
    expect(id).toBe('alice2')
  })

  it('never mints a relationship-colliding or group-colliding ID', () => {
    // Group g1 and relationship rel1 share the identifier namespace.
    const id = useWorkspaceStore.getState().addPerson('G1')
    expect(id).toBe('g12')
  })
})

describe('rename re-derivation (auto IDs only)', () => {
  it('re-derives the ID when an auto-ID element is renamed', () => {
    const id = useWorkspaceStore.getState().addPerson('Payment Clerk')
    useWorkspaceStore.getState().updateElement(id, { name: 'Billing Clerk' })
    const person = ws().model.people.find(p => p.name === 'Billing Clerk')!
    expect(person.id).toBe('billingClerk')
    expect(person.idIsAuto).toBe(true)
  })

  it('does NOT touch the ID of an imported (pinned) element on rename', () => {
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Cooper' })
    const person = ws().model.people[0]
    expect(person.name).toBe('Alice Cooper')
    expect(person.id).toBe('alice')
  })
})

describe('updateElementId', () => {
  it('renames and rewrites every reference, leaving the model integral', () => {
    const err = useWorkspaceStore.getState().updateElementId('api', 'paymentApi')
    expect(err).toBeNull()
    const w = ws()
    expect(w.model.softwareSystems[0].id).toBe('paymentApi')
    expect(w.model.relationships[0].destinationId).toBe('paymentApi')
    expect(w.model.groups[0].elementIds).toContain('paymentApi')
    const ctx = w.views.systemContextViews[0]
    expect(ctx.softwareSystemId).toBe('paymentApi')
    expect(ctx.elements.map(e => e.id)).toContain('paymentApi')
    // Hand-placed layout data travels with the renamed entry.
    expect(ctx.elements.find(e => e.id === 'paymentApi')).toMatchObject({ x: 1, y: 2, pinned: true })
    const dyn = w.views.dynamicViews[0]
    expect(dyn.elements.map(e => e.id)).toContain('paymentApi')
    expect(dyn.relationships[0].destinationId).toBe('paymentApi')
    expect(w.model.deploymentEnvironments[0].deploymentNodes[0].softwareSystemInstances[0].softwareSystemId).toBe('paymentApi')
    expect(checkModelIntegrity(w)).toEqual([])
  })

  it('rewrites container references in deployment instances', () => {
    expect(useWorkspaceStore.getState().updateElementId('web', 'webApp')).toBeNull()
    expect(ws().model.deploymentEnvironments[0].deploymentNodes[0].containerInstances[0].containerId).toBe('webApp')
  })

  it('re-derives auto-view keys that embed the old ID and follows activeViewKey', () => {
    useWorkspaceStore.setState({ activeViewKey: 'SystemContext-api', viewHistory: ['SystemContext-api'] })
    useWorkspaceStore.getState().updateElementId('api', 'paymentApi')
    expect(ws().views.systemContextViews[0].key).toBe('SystemContext-paymentApi')
    expect(useWorkspaceStore.getState().activeViewKey).toBe('SystemContext-paymentApi')
    expect(useWorkspaceStore.getState().viewHistory).toEqual(['SystemContext-paymentApi'])
  })

  it('pins the ID: later renames stop re-deriving', () => {
    const id = useWorkspaceStore.getState().addPerson('Payment Clerk')
    expect(useWorkspaceStore.getState().updateElementId(id, 'clerk')).toBeNull()
    useWorkspaceStore.getState().updateElement('clerk', { name: 'Billing Clerk' })
    const person = ws().model.people.find(p => p.name === 'Billing Clerk')!
    expect(person.id).toBe('clerk')
    expect(person.idIsAuto).toBeUndefined()
  })

  it('keeps selection on the renamed element', () => {
    useWorkspaceStore.getState().selectElements(['api'])
    useWorkspaceStore.getState().updateElementId('api', 'paymentApi')
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['paymentApi'])
  })

  it('rejects malformed, reserved, and taken IDs without mutating', () => {
    const s = useWorkspaceStore.getState()
    expect(s.updateElementId('api', 'has space')).toBeTruthy()
    expect(s.updateElementId('api', 'person')).toBeTruthy()
    expect(s.updateElementId('api', 'alice')).toBeTruthy()
    expect(s.updateElementId('api', 'rel1')).toBeTruthy()
    expect(ws().model.softwareSystems[0].id).toBe('api')
  })

  it('treats a same-ID commit as a silent no-op that does not pin', () => {
    const id = useWorkspaceStore.getState().addPerson('Payment Clerk')
    expect(useWorkspaceStore.getState().updateElementId(id, id)).toBeNull()
    expect(ws().model.people.find(p => p.id === id)!.idIsAuto).toBe(true)
  })

  it('is a single undo step', () => {
    const before = ws()
    useWorkspaceStore.getState().updateElementId('api', 'paymentApi')
    useWorkspaceStore.getState().undo()
    expect(ws().model.softwareSystems[0].id).toBe('api')
    expect(ws().model.relationships[0].destinationId).toBe('api')
    expect(before.model.softwareSystems[0].id).toBe('api')
  })
})

describe('resyncElementId', () => {
  it('re-derives from the name and marks the ID auto again', () => {
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Cooper' })
    useWorkspaceStore.getState().resyncElementId('alice')
    const person = ws().model.people[0]
    expect(person.id).toBe('aliceCooper')
    expect(person.idIsAuto).toBe(true)
    expect(ws().model.relationships[0].sourceId).toBe('aliceCooper')
    expect(checkModelIntegrity(ws())).toEqual([])
  })
})

describe('duplicateElements', () => {
  it('derives clone IDs from the copy names', () => {
    useWorkspaceStore.setState({ activeViewKey: 'SystemContext-api' })
    const [cloneId] = useWorkspaceStore.getState().duplicateElements(['api'])
    expect(cloneId).toBe('apiCopy')
    const clone = ws().model.softwareSystems.find(s => s.id === cloneId)!
    expect(clone.idIsAuto).toBe(true)
    // Nested containers derive from their (unchanged) names, deduped against the original.
    expect(clone.containers[0].id).toBe('webApp')
    expect(checkModelIntegrity(ws())).toEqual([])
  })
})
