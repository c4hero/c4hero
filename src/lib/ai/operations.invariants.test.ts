import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { storeEditActions } from '@/components/ai/aiHelpers'
import { applyEditPlan } from './operations'
import { toEditPlan } from './schema'
import { makeWorkspace } from './testFixture'
import { checkModelIntegrity } from '@/lib/modelIntegrity'
import type { EditOp } from './types'

// Adversarial/property suite for applyEditPlan, run against the REAL zustand
// store (not the fake EditActions used in operations.test.ts). Every plan —
// handcrafted or randomly generated — must, after being routed through the
// production sanitizer `toEditPlan` and applied to a real store, leave
// checkModelIntegrity reporting zero violations. This is the executable
// evidence for constitution items 4 (post-apply integrity), 5 (no ref
// shadowing) and 6 (no hierarchy escape via update).

function freshWorkspace() { return makeWorkspace() }

beforeEach(() => {
  useWorkspaceStore.getState().loadWorkspace(freshWorkspace())
})

function apply(operations: unknown[]) {
  const plan = toEditPlan({ operations })
  const ws = useWorkspaceStore.getState().workspace!
  const actions = storeEditActions()
  let result
  expect(() => { result = applyEditPlan(plan, actions, ws) }).not.toThrow()
  return { plan, result: result! }
}

describe('applyEditPlan — handcrafted adversarial cases (real store)', () => {
  it('ref shadowing an existing id: the existing element is untouched and later ops addressing the id hit the original', () => {
    // 'shop' already exists (a software system). A malicious/careless plan
    // reuses it as a `ref` for a brand-new person, then tries to rename "shop"
    // via that ref. The rename must land on nothing new — it must resolve back
    // to the ORIGINAL 'shop' system, not the new person.
    const before = useWorkspaceStore.getState().workspace!
    const shopBefore = before.model.softwareSystems.find((s) => s.id === 'shop')!
    const { result } = apply([
      { op: 'addPerson', ref: 'shop', name: 'Shadow Person' },
      { op: 'updateElement', id: 'shop', name: 'Renamed Shop' },
    ] satisfies EditOp[])
    const after = useWorkspaceStore.getState().workspace!
    const shopAfter = after.model.softwareSystems.find((s) => s.id === 'shop')!
    // The update landed on the original software system (renamed), not a
    // shadow — proving 'shop' the token still resolves to the pre-existing id.
    expect(shopAfter.name).toBe('Renamed Shop')
    expect(shopAfter.id).toBe(shopBefore.id)
    // The new person was still created (just under its OWN real id, since the
    // 'shop' ref binding was refused).
    const people = after.model.people.map((p) => p.name)
    expect(people).toContain('Shadow Person')
    expect(result.appliedCount).toBe(2)
    expect(checkModelIntegrity(after)).toEqual([])
  })

  it('duplicate refs in one plan: first registration wins', () => {
    const { result } = apply([
      { op: 'addSoftwareSystem', ref: 'dup', name: 'First Sys' },
      { op: 'addSoftwareSystem', ref: 'dup', name: 'Second Sys' },
      // Targets the 'dup' ref — must resolve to the FIRST system.
      { op: 'updateElement', id: 'dup', description: 'Targets first' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    const first = ws.model.softwareSystems.find((s) => s.name === 'First Sys')!
    const second = ws.model.softwareSystems.find((s) => s.name === 'Second Sys')!
    expect(first.description).toBe('Targets first')
    expect(second.description).not.toBe('Targets first')
    expect(result.appliedCount).toBe(3)
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('deleting an element also referenced by a same-plan relationship does not corrupt the model', () => {
    const { result } = apply([
      { op: 'addSoftwareSystem', ref: 'ephemeral', name: 'Ephemeral' },
      { op: 'addRelationship', source: 'web', destination: 'ephemeral', description: 'Calls' },
      { op: 'deleteElement', id: 'ephemeral' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    // deleteElement is ranked last, so the relationship was created first, then
    // cascade-deleted along with its endpoint — no dangling relationship left.
    expect(ws.model.relationships.some((r) => r.destinationId === 'ephemeral')).toBe(false)
    expect(result.appliedCount).toBe(3)
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('External flip is blocked when the system has pre-existing containers', () => {
    const { result } = apply([
      { op: 'updateElement', id: 'shop', location: 'External' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    const shop = ws.model.softwareSystems.find((s) => s.id === 'shop')!
    expect(shop.location).not.toBe('External')
    expect(result.appliedCount).toBe(0)
    expect(result.applied[0]).toMatchObject({ ok: false, reason: 'system has containers' })
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('External flip is blocked when the containers were added earlier in the SAME plan', () => {
    const { result } = apply([
      { op: 'addSoftwareSystem', ref: 'sys', name: 'Freshly Made' },
      { op: 'addContainer', ref: 'c1', parent: 'sys', name: 'API' },
      { op: 'updateElement', id: 'sys', location: 'External' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find((s) => s.name === 'Freshly Made')!
    expect(sys.location).not.toBe('External')
    expect(sys.containers.length).toBe(1)
    expect(result.appliedCount).toBe(2) // add + addContainer applied, updateElement skipped
    expect(result.skippedCount).toBe(1)
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('External flip is ALLOWED for a container-less system', () => {
    const { result } = apply([
      { op: 'addSoftwareSystem', ref: 'sys', name: 'Empty Sys' },
      { op: 'updateElement', id: 'sys', location: 'External' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find((s) => s.name === 'Empty Sys')!
    expect(sys.location).toBe('External')
    expect(result.appliedCount).toBe(2)
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('addView with a wrong-kind scope is skipped, not applied', () => {
    const { result } = apply([
      // component view scoped to a software system, not a container — wrong kind
      { op: 'addView', viewType: 'component', scope: 'shop' },
    ] satisfies EditOp[])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.componentViews.length).toBe(0)
    expect(result.appliedCount).toBe(0)
    expect(checkModelIntegrity(ws)).toEqual([])
  })

  it('op fields using __proto__/constructor as ref/name tokens cause no prototype pollution', () => {
    const { result } = apply([
      { op: 'addSoftwareSystem', ref: '__proto__', name: 'constructor' },
      { op: 'addPerson', ref: 'constructor', name: '__proto__' },
      { op: 'updateElement', id: '__proto__', description: 'x' },
      { op: 'addRelationship', source: '__proto__', destination: 'constructor' },
    ] satisfies EditOp[])
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
    const ws = useWorkspaceStore.getState().workspace!
    expect(checkModelIntegrity(ws)).toEqual([])
    // Just asserting no throw / no pollution; the tokens are still treated as
    // ordinary (if odd) strings so some ops may legitimately apply.
    expect(result.appliedCount + result.skippedCount).toBe(4)
  })

  it('a plan of 250+ mixed ops applies without throwing and counts add up', () => {
    const ops: EditOp[] = []
    for (let i = 0; i < 60; i++) {
      ops.push({ op: 'addSoftwareSystem', ref: `sys${i}`, name: `Sys ${i}` })
      ops.push({ op: 'addContainer', ref: `c${i}`, parent: `sys${i}`, name: `Container ${i}` })
      ops.push({ op: 'addRelationship', source: `sys${i}`, destination: `c${i}` })
      ops.push({ op: 'updateElement', id: `sys${i}`, description: `Desc ${i}` })
    }
    expect(ops.length).toBeGreaterThanOrEqual(240)
    const { result } = apply(ops)
    expect(result.appliedCount + result.skippedCount).toBe(ops.length)
    const ws = useWorkspaceStore.getState().workspace!
    expect(checkModelIntegrity(ws)).toEqual([])
  })
})

// ─── Seeded property/fuzz section ──────────────────────────────────────
//
// Deterministic mulberry32 PRNG with a fixed literal seed — never Math.random()
// or Date.now(), so failures are 100% reproducible.

function mulberry32(seed: number) {
  let a = seed
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 0xC4_4E_20_26 // fixed literal seed — deterministic, reproducible
const rand = mulberry32(SEED)

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

const EXISTING_IDS = ['shop', 'web', 'db', 'cart', 'cust', 'r1']
const EXISTING_NAMES = ['Shop', 'Web App', 'Database', 'Cart', 'Customer']

const TOKEN_POOL = (): string[] => [
  ...EXISTING_IDS,
  'freshRefA', 'freshRefB', 'freshRefC',
  'shop', // colliding ref again
  '',
  'x'.repeat(10000), // very long string
  'unicode-🐙-Ω- -name', // unicode + embedded control char
  'control-heavy',
  ...EXISTING_NAMES, // name collisions
  '__proto__', 'constructor', 'prototype',
]

function randomToken(): string { return pick(TOKEN_POOL()) }

const VIEW_TYPES = ['systemLandscape', 'systemContext', 'container', 'component'] as const

function randomOp(): unknown {
  const kind = pick([
    'addPerson', 'addSoftwareSystem', 'addContainer', 'addComponent',
    'addRelationship', 'updateElement', 'updateRelationship', 'deleteElement',
    'addView', 'garbage',
  ])
  switch (kind) {
    case 'addPerson':
      return { op: 'addPerson', ref: randomToken(), name: randomToken(), description: randomToken() }
    case 'addSoftwareSystem':
      return { op: 'addSoftwareSystem', ref: randomToken(), name: randomToken(), external: pick([true, false, undefined]) }
    case 'addContainer':
      return { op: 'addContainer', ref: randomToken(), parent: randomToken(), name: randomToken(), technology: randomToken() }
    case 'addComponent':
      return { op: 'addComponent', ref: randomToken(), parent: randomToken(), name: randomToken() }
    case 'addRelationship': {
      // sometimes deliberately self-referencing
      const src = randomToken()
      const dst = pick([randomToken(), src])
      return { op: 'addRelationship', source: src, destination: dst, description: randomToken() }
    }
    case 'updateElement':
      return {
        op: 'updateElement',
        id: randomToken(),
        name: pick([randomToken(), undefined]),
        location: pick(['Internal', 'External', 'sideways', undefined]),
        tags: pick([[randomToken(), randomToken()], undefined, 'not-an-array']),
        status: pick(['Live', 'Planned', 'Deprecated', 'Removed', 'Bogus', undefined]),
        owner: pick([randomToken(), undefined]),
      }
    case 'updateRelationship':
      return { op: 'updateRelationship', id: randomToken(), description: randomToken() }
    case 'deleteElement':
      return { op: 'deleteElement', id: randomToken() }
    case 'addView':
      return { op: 'addView', viewType: pick(VIEW_TYPES), scope: randomToken(), title: randomToken() }
    default:
      // Deliberately malformed / unknown-shape garbage that must be dropped by
      // toEditPlan (or, if it slips through, must not crash the applier).
      return pick([
        { op: 'unknownOp', ref: 'x' },
        { notAnOp: true },
        null,
        42,
        'a string, not an object',
        { op: 'updateElement' }, // missing id
        { op: 'addPerson', ref: 'r' }, // missing name
      ])
  }
}

function randomPlanOps(n: number): unknown[] {
  const count = 1 + Math.floor(rand() * n)
  return Array.from({ length: count }, () => randomOp())
}

describe('applyEditPlan — seeded property/fuzz suite (real store)', () => {
  const ROUNDS = 320

  for (let i = 0; i < ROUNDS; i++) {
    it(`fuzz round ${i}: toEditPlan → applyEditPlan preserves model integrity`, () => {
      useWorkspaceStore.getState().loadWorkspace(freshWorkspace())
      const rawOps = randomPlanOps(40)
      const plan = toEditPlan({ operations: rawOps })
      const ws = useWorkspaceStore.getState().workspace!
      const actions = storeEditActions()

      let result
      expect(() => { result = applyEditPlan(plan, actions, ws) }).not.toThrow()

      const after = useWorkspaceStore.getState().workspace!
      expect(checkModelIntegrity(after)).toEqual([])
      expect(result!.appliedCount + result!.skippedCount).toBe(plan.operations.length)
    })
  }
})
