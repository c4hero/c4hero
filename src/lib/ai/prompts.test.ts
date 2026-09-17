import { describe, it, expect } from 'vitest'
import type { View, ViewType } from '@/types/model'
import type { AiProvider } from './types'
import { makeWorkspace } from './testFixture'
import { isEditOp } from './schema'
import { interviewBuildPlan } from './features'
import {
  generateSystem, generateUser, reviewSystem, reviewUser, describeSystem, describeUser,
  editSystem, editUser, adrSystem, adrUser, interviewSystem, interviewKickoff, qaSystem, qaUser,
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

  // TEA-43: the Review tab can hand an advisory finding to the ADR drafter.
  it('frames a review finding as the problem to decide on, not as the decision', () => {
    const background = 'A review of the architecture model raised this: **No contract**'
    const prompt = adrUser(ws, 'No contract', null, background)
    expect(prompt).toContain('raised by a review of the model')
    expect(prompt).toContain('problem to decide on, not as the decision')
    // An ADR that only restates the finding has not recorded a decision.
    expect(prompt).toContain('accept the current design as it stands')
    expect(prompt).toContain(background)
  })

  it('leaves a hand-typed ADR topic exactly as it was', () => {
    for (const bg of [undefined, null, '', '   ']) {
      expect(adrUser(ws, 'pick a datastore', null, bg)).not.toContain('raised by a review')
    }
  })

  it('labels each view type, with and without a title', () => {
    for (const type of ['systemLandscape', 'systemContext', 'container', 'component'] as ViewType[]) {
      expect(interviewKickoff({ type, key: 'k', elements: [], relationships: [] })).toBeTruthy()
    }
    expect(interviewKickoff(titled)).toContain('Orders')
  })
})

describe('documentation grounding', () => {
  const docs = {
    text: 'DOCUMENTATION (1 of 1 documents)\n\n=== decisions/0002-services | Decision | Accepted | Services\nSplit it.',
    conceptIds: new Set(['decisions/0002-services']),
    titles: new Map([['decisions/0002-services', 'Services']]),
    included: 1,
    omitted: 0,
  }

  it('the review asks for citations only when documentation is attached', () => {
    expect(reviewSystem()).not.toContain('citations')
    expect(reviewSystem(true)).toContain('citations')
    expect(reviewUser(ws, null, docs)).toContain('=== decisions/0002-services')
    expect(reviewUser(ws, view, docs)).toContain('=== decisions/0002-services')
    expect(reviewUser(ws, view)).not.toContain('DOCUMENTATION')
  })

  it('Q&A, the interview and the ADR drafter carry the documentation when given', () => {
    expect(qaUser(ws, null, 'why?', docs)).toContain('=== decisions/0002-services')
    expect(qaUser(ws, null, 'why?', docs).endsWith('Question: why?')).toBe(true)
    expect(qaSystem()).toContain('DOCUMENTATION')
    expect(interviewSystem(ws, view, docs)).toContain('=== decisions/0002-services')
    expect(interviewSystem(ws, view, docs)).toContain('disagree')
    expect(interviewSystem(ws, view)).not.toContain('DOCUMENTATION')
    expect(adrUser(ws, 'pick a datastore', docs)).toContain('=== decisions/0002-services')
    expect(adrUser(ws, 'pick a datastore', docs)).toContain('accepted decision')
    expect(adrUser(null, 'x', docs)).toContain('=== decisions/0002-services')
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
