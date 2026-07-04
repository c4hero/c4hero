import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueueOverview } from './AiPanel'
import type { Step, FixStep, FindingStep, StepStatus } from './wizardSteps'
import type { GapKind, ReviewSeverity } from '@/lib/ai'

// The wizard's all-steps screen: chips, filtering, jump-to-step, per-item
// opt-out, and what the bulk actions are handed. Model mutation itself is the
// panel's job (bulkApplyFixes) — here the callbacks' arguments are the contract.

function fix(kind: GapKind, id: string, label = id): FixStep {
  return {
    type: 'fix', key: `${kind}:${id}`, cat: 'missing',
    gap: { key: `${kind}:${id}`, kind, targetId: id, targetKind: kind === 'rel' ? 'relationship' : 'element', label },
  }
}

function finding(severity: ReviewSeverity, i: number, title: string): FindingStep {
  return {
    type: 'finding', key: `f:${i}`, cat: 'review',
    finding: {
      title, detail: 'd', category: 'naming', severity, elementIds: ['web'], suggestion: 's',
      operations: [{ op: 'updateElement', id: 'web', description: 'x' }],
    },
  }
}

// desc:a + desc:b drafted, tech:c undrafted, one high finding.
const queue: Step[] = [
  fix('desc', 'a', 'Web App'), fix('desc', 'b', 'Database'), fix('tech', 'c', 'API'),
  finding('high', 0, 'Orphaned element'),
]
const drafts = { 'desc:a': 'Serves the storefront', 'desc:b': 'Holds orders' }

function renderOverview(over: Partial<React.ComponentProps<typeof QueueOverview>> = {}) {
  const props: React.ComponentProps<typeof QueueOverview> = {
    queue, curIdx: 0, decisions: {}, appliedKeys: new Set<string>(),
    drafts, draftsLoading: false, reviewLoading: false, optOut: {},
    onToggleOptOut: vi.fn(), onJump: vi.fn(), onBulkApply: vi.fn(), onBulkSkip: vi.fn(), onClose: vi.fn(),
    ...over,
  }
  return { ...render(<QueueOverview {...props} />), props }
}

describe('QueueOverview', () => {
  it('shows the queue composition as filter chips with counts', () => {
    renderOverview()
    expect(screen.getByRole('button', { name: 'All 4' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descriptions 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tech 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'High 1' })).toBeTruthy()
    expect(screen.getByText('0 of 4 done')).toBeTruthy()
  })

  it('filters the list by a chip', () => {
    renderOverview()
    fireEvent.click(screen.getByRole('button', { name: 'Tech 1' }))
    expect(screen.getByText('API')).toBeTruthy()
    expect(screen.queryByText('Web App')).toBeNull()
    expect(screen.queryByText('Orphaned element')).toBeNull()
  })

  it('jumps to a step with its queue index', () => {
    const { props } = renderOverview()
    fireEvent.click(screen.getByText('Orphaned element'))
    expect(props.onJump).toHaveBeenCalledWith(3)
  })

  it('hands bulk apply exactly the pending drafted fixes', () => {
    const { props } = renderOverview()
    fireEvent.click(screen.getByRole('button', { name: /Apply 2 suggested/ }))
    expect(props.onBulkApply).toHaveBeenCalledTimes(1)
    const steps = vi.mocked(props.onBulkApply).mock.calls[0][0]
    expect(steps.map((s) => s.key)).toEqual(['desc:a', 'desc:b'])
  })

  it('reports an opt-out toggle and drops opted-out fixes from the count', () => {
    const { props } = renderOverview({ optOut: { 'desc:a': true } })
    expect(screen.getByRole('button', { name: /Apply 1 suggested/ })).toBeTruthy()
    const box = screen.getByRole('checkbox', { name: 'Include "Web App" in bulk apply' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(box)
    expect(props.onToggleOptOut).toHaveBeenCalledWith('desc:a')
  })

  it('offers no checkbox for findings or undrafted fixes', () => {
    renderOverview()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2) // only the drafted desc fixes
  })

  it('hands bulk skip everything pending under the filter', () => {
    const { props } = renderOverview()
    fireEvent.click(screen.getByRole('button', { name: 'High 1' }))
    fireEvent.click(screen.getByRole('button', { name: /Skip 1 shown/ }))
    const steps = vi.mocked(props.onBulkSkip).mock.calls[0][0]
    expect(steps.map((s) => s.key)).toEqual(['f:0'])
  })

  it('hides bulk apply when no pending fix is in view, and shows the findings note', () => {
    renderOverview({ decisions: {}, appliedKeys: new Set(['desc:a', 'desc:b', 'tech:c']) })
    expect(screen.queryByRole('button', { name: /suggested/ })).toBeNull()
    expect(screen.getByText(/aren’t bulk-applied/)).toBeTruthy()
    expect(screen.getByText('3 of 4 done')).toBeTruthy()
  })

  it('reflects applied and skipped state on rows', () => {
    const decisions: Record<string, StepStatus> = { 'desc:b': 'skip' }
    renderOverview({ decisions, appliedKeys: new Set(['desc:a']) })
    expect(screen.getByLabelText('Applied')).toBeTruthy()
    expect(screen.getByText('Skipped')).toBeTruthy()
    // Neither decided fix is bulk-applicable any more.
    expect(screen.getByRole('button', { name: /Apply 0 suggested/ })).toBeTruthy()
  })

  it('closes back to the stepper', () => {
    const { props } = renderOverview()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the current step' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
