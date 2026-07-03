import { describe, it, expect } from 'vitest'
import { stepElementIds, stepRelationshipId, type Step } from './wizardSteps'
import { makeWorkspace } from '@/lib/ai/testFixture'

// makeWorkspace() relationships: r1 = cust -> web ('Browses'), r2 = web -> db (no description).

function relGapStep(targetId: string): Step {
  return { type: 'fix', key: `rel:${targetId}`, cat: 'missing', gap: { key: `rel:${targetId}`, kind: 'rel', targetId, targetKind: 'relationship', label: 'x' } }
}

function findingStep(elementIds: string[]): Step {
  return {
    type: 'finding', key: 'f:0', cat: 'review',
    finding: { title: 't', detail: 'd', category: 'missing-relationship', severity: 'medium', elementIds, suggestion: 's' },
  }
}

describe('stepElementIds', () => {
  it('resolves a rel-gap fix step to its two endpoints', () => {
    const ws = makeWorkspace()
    expect(stepElementIds(relGapStep('r2'), ws)).toEqual(['web', 'db'])
  })

  it('passes through a finding whose elementIds are already real elements', () => {
    const ws = makeWorkspace()
    expect(stepElementIds(findingStep(['web', 'db']), ws)).toEqual(['web', 'db'])
  })

  it('resolves a finding whose elementIds echoes a relationship id to its endpoints', () => {
    // Reproduces the reported bug: a review finding about a relationship can
    // put the relationship's OWN id in elementIds instead of its endpoints
    // (the review prompt is ambiguous here). That id never appears in any
    // view's element list, so "Show in diagram" silently found nothing.
    const ws = makeWorkspace()
    expect(stepElementIds(findingStep(['r2']), ws)).toEqual(['web', 'db'])
  })
})

describe('stepRelationshipId', () => {
  it('returns the target id for a rel-gap fix step', () => {
    const ws = makeWorkspace()
    expect(stepRelationshipId(relGapStep('r2'), ws)).toBe('r2')
  })

  it('returns null for a finding with only element ids', () => {
    const ws = makeWorkspace()
    expect(stepRelationshipId(findingStep(['web', 'db']), ws)).toBeNull()
  })

  it('returns the relationship id when a finding echoes it in elementIds', () => {
    const ws = makeWorkspace()
    expect(stepRelationshipId(findingStep(['r2']), ws)).toBe('r2')
  })
})
