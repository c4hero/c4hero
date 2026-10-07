import { describe, it, expect } from 'vitest'
import { classifyPlanScopes } from './planScope'
import { makeWorkspace } from './testFixture'
import type { View } from '@/types/model'
import type { EditPlan } from './types'
import { parseDSL } from '@/lib/dsl'

const ws = makeWorkspace()
// Container view of "Shop" showing web + db.
const containerView: View = {
  type: 'container', key: 'cont', softwareSystemId: 'shop',
  elements: [{ id: 'web' }, { id: 'db' }], relationships: [{ id: 'r2' }],
}

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

describe('classifyPlanScopes (implied arrows, #230)', () => {
  it('tags an update to a relationship an include * view draws as an implied arrow as on-view', () => {
    const { workspace } = parseDSL(`workspace {
      model {
        user = person "User"
        a = softwareSystem "System A" {
          web = container "Web" {
            ctrl = component "Controller"
          }
        }
        user -> ctrl "Uses"
      }
      views {
        systemContext a "ContextA" {
          include *
        }
      }
    }`)
    const view = workspace.views.systemContextViews[0]
    const plan: EditPlan = {
      operations: [{ op: 'updateRelationship', id: workspace.model.relationships[0].id, description: 'Signs in to' }],
    }
    // The context view lists no relationship, but draws `user -> ctrl` as
    // User -> System A, labelled with its description.
    expect(view.relationships).toEqual([])
    expect(classifyPlanScopes(plan, workspace, view)).toEqual(['view'])
  })
})
