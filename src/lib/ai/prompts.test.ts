import { describe, it, expect } from 'vitest'
import type { View, ViewType } from '@/types/model'
import type { AiProvider } from './types'
import { makeWorkspace } from './testFixture'
import { isEditOp } from './schema'
import { interviewBuildPlan } from './features'
import {
  generateSystem, generateUser, reviewSystem, reviewUser, describeSystem, describeUser,
  editSystem, editUser, adrSystem, adrUser, interviewSystem, interviewKickoff,
  interviewPlanSystem, interviewPlanUser,
} from './prompts'

const ws = makeWorkspace()
const view: View = { type: 'container', key: 'c1', elements: [{ id: 'web' }, { id: 'cart' }], relationships: [{ id: 'r1' }] }
const titled: View = { ...view, title: 'Orders' }

describe('isEditOp', () => {
  it('accepts every well-formed operation', () => {
    expect(isEditOp({ op: 'addPerson', ref: 'u', name: 'U' })).toBe(true)
    expect(isEditOp({ op: 'addSoftwareSystem', ref: 's', name: 'S' })).toBe(true)
    expect(isEditOp({ op: 'addContainer', ref: 'c', name: 'C', parent: 'S' })).toBe(true)
    expect(isEditOp({ op: 'addComponent', ref: 'k', name: 'K', parent: 'C' })).toBe(true)
    expect(isEditOp({ op: 'addRelationship', source: 'a', destination: 'b' })).toBe(true)
    expect(isEditOp({ op: 'updateElement', id: 'x' })).toBe(true)
    expect(isEditOp({ op: 'updateRelationship', id: 'r' })).toBe(true)
    expect(isEditOp({ op: 'deleteElement', id: 'x' })).toBe(true)
  })

  it('rejects malformed operations', () => {
    expect(isEditOp(null)).toBe(false)
    expect(isEditOp({})).toBe(false)
    expect(isEditOp({ op: 42 })).toBe(false)
    expect(isEditOp({ op: 'not-an-op' })).toBe(false)
    expect(isEditOp({ op: 'addPerson', ref: 'u' })).toBe(false) // missing name
    expect(isEditOp({ op: 'addContainer', ref: 'c', name: 'C' })).toBe(false) // missing parent
    expect(isEditOp({ op: 'addRelationship', source: 'a' })).toBe(false) // missing destination
    expect(isEditOp({ op: 'updateElement' })).toBe(false) // missing id
    expect(isEditOp({ op: 'addPerson', ref: 'u', name: 'U', description: 123 })).toBe(false)
    expect(isEditOp({ op: 'addSoftwareSystem', ref: 's', name: 'S', external: 'true' })).toBe(false)
    expect(isEditOp({ op: 'updateElement', id: 'x', technology: 42 })).toBe(false)
  })
})

describe('prompt builders', () => {
  it('produce non-empty prompts across the workspace/view/null variants', () => {
    expect(generateSystem()).toBeTruthy()
    expect(generateUser('an ordering system')).toContain('ordering system')
    expect(reviewSystem()).toBeTruthy()
    expect(reviewUser(ws)).toBeTruthy()
    expect(reviewUser(ws, view)).toBeTruthy()
    expect(reviewUser(ws, titled)).toContain('Orders')
    expect(describeSystem()).toBeTruthy()
    expect(describeUser(ws, ['web'], ['r1'])).toBeTruthy()
    expect(editSystem()).toBeTruthy()
    expect(editUser(ws, 'rename web to portal')).toContain('rename web')
    expect(adrSystem()).toBeTruthy()
    expect(adrUser(null, 'pick a datastore')).toContain('datastore')
    expect(adrUser(ws, 'pick a datastore')).toBeTruthy()
    expect(interviewSystem(ws, view)).toBeTruthy()
    expect(interviewPlanSystem(ws, view)).toBeTruthy()
    expect(interviewPlanUser()).toBeTruthy()
  })

  it('labels each view type, with and without a title', () => {
    for (const type of ['systemLandscape', 'systemContext', 'container', 'component'] as ViewType[]) {
      expect(interviewKickoff({ type, key: 'k', elements: [], relationships: [] })).toBeTruthy()
    }
    expect(interviewKickoff(titled)).toContain('Orders')
  })
})

describe('interview features', () => {
  const provider: AiProvider = {
    async complete() { return 'What datastore backs the cart?' },
    async completeJson<T>(): Promise<T> { return { operations: [{ op: 'updateElement', id: 'web', description: 'edge' }] } as T },
  }

  it('turns the transcript into a plan', async () => {
    const plan = await interviewBuildPlan(provider, ws, view, [{ role: 'user', content: 'cart writes to db' }])
    expect(plan.operations).toHaveLength(1)
  })
})
