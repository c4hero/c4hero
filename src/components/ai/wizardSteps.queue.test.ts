import { describe, it, expect } from 'vitest'
import {
  stepState, stepMatchesFilter, queueFilterChips, bulkApplyTargets, bulkSkipTargets, nextUndecidedIndex,
  type Step, type FixStep, type FindingStep, type StepStatus,
} from './wizardSteps'
import type { GapKind, ReviewSeverity } from '@/lib/ai'

// Pure logic behind the wizard's queue overview: per-step display state,
// filter chips, and the target sets of the bulk actions.

function fix(kind: GapKind, id: string): FixStep {
  return {
    type: 'fix', key: `${kind}:${id}`, cat: 'missing',
    gap: { key: `${kind}:${id}`, kind, targetId: id, targetKind: kind === 'rel' ? 'relationship' : 'element', label: id },
  }
}

function finding(severity: ReviewSeverity, i: number): FindingStep {
  return {
    type: 'finding', key: `f:${i}`, cat: 'review',
    finding: {
      title: `Finding ${i}`, detail: 'd', category: 'naming', severity, elementIds: ['web'], suggestion: 's',
      operations: [{ op: 'updateElement', id: 'web', description: 'x' }],
    },
  }
}

const none: ReadonlySet<string> = new Set()
const noDecisions: Record<string, StepStatus> = {}

// desc:a, desc:b, tech:c, rel:r, f:0 (high), f:1 (low)
function makeQueue(): Step[] {
  return [fix('desc', 'a'), fix('desc', 'b'), fix('tech', 'c'), fix('rel', 'r'), finding('high', 0), finding('low', 1)]
}

describe('queueFilterChips', () => {
  it('summarizes the queue: All plus one chip per gap kind / severity present', () => {
    expect(queueFilterChips(makeQueue())).toEqual([
      { id: 'all', label: 'All', count: 6 },
      { id: 'desc', label: 'Descriptions', count: 2 },
      { id: 'tech', label: 'Tech', count: 1 },
      { id: 'rel', label: 'Links', count: 1 },
      { id: 'high', label: 'High', count: 1 },
      { id: 'low', label: 'Low', count: 1 },
    ])
  })

  it('omits chips for kinds/severities not in the queue', () => {
    const ids = queueFilterChips([fix('desc', 'a')]).map((c) => c.id)
    expect(ids).toEqual(['all', 'desc'])
  })
})

describe('stepMatchesFilter', () => {
  const q = makeQueue()
  it('matches everything under "all"', () => {
    expect(q.every((s) => stepMatchesFilter(s, 'all'))).toBe(true)
  })
  it('matches fixes by gap kind only', () => {
    expect(q.filter((s) => stepMatchesFilter(s, 'desc')).map((s) => s.key)).toEqual(['desc:a', 'desc:b'])
  })
  it('matches findings by severity only', () => {
    expect(q.filter((s) => stepMatchesFilter(s, 'high')).map((s) => s.key)).toEqual(['f:0'])
  })
})

describe('stepState', () => {
  const step = fix('desc', 'a')
  it('is pending without a decision or ledger entry', () => {
    expect(stepState(step, noDecisions, none)).toBe('pending')
  })
  it('is applied when the ledger has the key', () => {
    expect(stepState(step, noDecisions, new Set(['desc:a']))).toBe('applied')
  })
  it('is applied on an "apply" decision even without a ledger entry', () => {
    // applyStep can decide 'apply' with nothing to record (no ops produced).
    expect(stepState(step, { 'desc:a': 'apply' }, none)).toBe('applied')
  })
  it('is skipped on skip and dismiss decisions', () => {
    expect(stepState(step, { 'desc:a': 'skip' }, none)).toBe('skipped')
    expect(stepState(step, { 'desc:a': 'dismiss' }, none)).toBe('skipped')
  })
})

describe('bulkApplyTargets', () => {
  const q = makeQueue()
  const drafts = { 'desc:a': 'Serves users', 'desc:b': 'Stores data', 'tech:c': 'PostgreSQL', 'rel:r': '   ' }

  it('collects pending drafted fixes and never findings', () => {
    const keys = bulkApplyTargets(q, 'all', noDecisions, none, drafts, {}).map((s) => s.key)
    expect(keys).toEqual(['desc:a', 'desc:b', 'tech:c']) // rel:r draft is whitespace-only
  })

  it('excludes decided, already-applied and opted-out fixes', () => {
    const keys = bulkApplyTargets(q, 'all', { 'desc:a': 'skip' }, new Set(['desc:b']), drafts, { 'tech:c': true }).map((s) => s.key)
    expect(keys).toEqual([])
  })

  it('respects the active filter', () => {
    const keys = bulkApplyTargets(q, 'desc', noDecisions, none, drafts, {}).map((s) => s.key)
    expect(keys).toEqual(['desc:a', 'desc:b'])
  })

  it('treats a false opt-out entry (re-ticked) as included', () => {
    const keys = bulkApplyTargets(q, 'tech', noDecisions, none, drafts, { 'tech:c': false }).map((s) => s.key)
    expect(keys).toEqual(['tech:c'])
  })
})

describe('bulkSkipTargets', () => {
  const q = makeQueue()
  it('collects everything pending under the filter, findings included', () => {
    expect(bulkSkipTargets(q, 'all', noDecisions, none).map((s) => s.key)).toEqual(['desc:a', 'desc:b', 'tech:c', 'rel:r', 'f:0', 'f:1'])
    expect(bulkSkipTargets(q, 'tech', noDecisions, none).map((s) => s.key)).toEqual(['tech:c'])
    expect(bulkSkipTargets(q, 'low', noDecisions, none).map((s) => s.key)).toEqual(['f:1'])
  })
  it('excludes decided and applied steps', () => {
    const keys = bulkSkipTargets(q, 'all', { 'desc:a': 'skip', 'f:0': 'dismiss' }, new Set(['desc:b'])).map((s) => s.key)
    expect(keys).toEqual(['tech:c', 'rel:r', 'f:1'])
  })
})

describe('nextUndecidedIndex', () => {
  const q = makeQueue()
  it('stays put when the step at `from` is undecided', () => {
    expect(nextUndecidedIndex(q, 0, noDecisions)).toBe(0)
  })
  it('walks past a run of decided steps', () => {
    expect(nextUndecidedIndex(q, 0, { 'desc:a': 'apply', 'desc:b': 'skip' })).toBe(2)
  })
  it('returns queue.length when everything from `from` on is decided', () => {
    const all: Record<string, StepStatus> = Object.fromEntries(q.map((s) => [s.key, 'apply' as StepStatus]))
    expect(nextUndecidedIndex(q, 0, all)).toBe(q.length)
  })
  it('clamps a negative start to 0', () => {
    expect(nextUndecidedIndex(q, -3, noDecisions)).toBe(0)
  })
})
