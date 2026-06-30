import { describe, it, expect } from 'vitest'
import { classifyScope, classifyPlanScopes } from './planScope'
import { makeWorkspace } from './testFixture'
import type { View } from '@/types/model'
import type { EditPlan } from './types'

const ws = makeWorkspace()
// Container view of "Shop" showing web + db.
const containerView: View = {
  type: 'container', key: 'cont', softwareSystemId: 'shop',
  elements: [{ id: 'web' }, { id: 'db' }], relationships: [{ id: 'r2' }],
}

describe('classifyScope (on a container view)', () => {
  it('tags a new container as on-view', () => {
    expect(classifyScope({ op: 'addContainer', ref: 'c', parent: 'shop', name: 'Redis' }, ws, containerView)).toBe('view')
  })
  it('tags a new component as belonging to a component view', () => {
    expect(classifyScope({ op: 'addComponent', ref: 'c', parent: 'web', name: 'Cache' }, ws, containerView)).toBe('component')
  })
  it('tags a new person/system as belonging to context', () => {
    expect(classifyScope({ op: 'addPerson', ref: 'p', name: 'Auditor' }, ws, containerView)).toBe('context')
  })
  it('tags a relationship between on-view elements as on-view, otherwise model-only', () => {
    expect(classifyScope({ op: 'addRelationship', source: 'web', destination: 'db' }, ws, containerView)).toBe('view')
    expect(classifyScope({ op: 'addRelationship', source: 'web', destination: 'cart' }, ws, containerView)).toBe('model')
  })
  it('tags updates by whether the element is on-view', () => {
    expect(classifyScope({ op: 'updateElement', id: 'web', technology: 'React' }, ws, containerView)).toBe('view')
    expect(classifyScope({ op: 'updateElement', id: 'cust', description: 'x' }, ws, containerView)).toBe('model')
  })
  it('resolves relationship endpoints by name too', () => {
    expect(classifyScope({ op: 'addRelationship', source: 'Web App', destination: 'Database' }, ws, containerView)).toBe('view')
  })
  it('tags a container added to a DIFFERENT system as model-only, not on-view', () => {
    expect(classifyScope({ op: 'addContainer', ref: 'c', parent: 'other-system', name: 'X' }, ws, containerView)).toBe('model')
  })
})

describe('classifyPlanScopes (in-plan refs)', () => {
  it('tags a relationship to an in-plan new container (on this view) as on-view', () => {
    const plan: EditPlan = {
      operations: [
        { op: 'addContainer', ref: 'foo', parent: 'shop', name: 'Foo' }, // lands on this container view
        { op: 'addRelationship', source: 'foo', destination: 'web' },     // foo (new) ↔ web (on-view)
      ],
    }
    expect(classifyPlanScopes(plan, ws, containerView)).toEqual(['view', 'view'])
  })
  it('does not promote a relationship to a new container in another system', () => {
    const plan: EditPlan = {
      operations: [
        { op: 'addContainer', ref: 'bar', parent: 'other-system', name: 'Bar' }, // not on this view
        { op: 'addRelationship', source: 'bar', destination: 'web' },
      ],
    }
    expect(classifyPlanScopes(plan, ws, containerView)).toEqual(['model', 'model'])
  })
})
