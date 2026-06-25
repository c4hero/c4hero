import { describe, it, expect } from 'vitest'
import { classifyScope } from './planScope'
import { makeWorkspace } from './testFixture'
import type { View } from '@/types/model'

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
})
