// The finding → ADR handoff (TEA-43).
//
// A deep-review finding with no `operations` is advisory: there is nothing to
// apply, and the useful next step is usually to decide something. These tests
// cover the whole path — the row's action, the seed built from the finding,
// the prompt it produces, and the drafter picking it up — because the value is
// precisely that no step of it is manual copy/paste.

import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { adrSeedFromFinding, type AdrSeed, type AiProvider, type ReviewFinding } from '@/lib/ai'
import { parseDSL } from '@/lib/dsl'
import { bundleKey, parseDocsBundle } from '@/lib/docs/bundle'
import { buildDocsContext } from '@/lib/ai/docsContext'
import { useDocsStore } from '@/store/docs'
import type { Workspace } from '@/types/model'
import { ReviewBody } from './ReviewBody'
import { AdrBody } from './AdrBody'
import { clearAiSession } from './sessionCache'

function finding(over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    title: 'Payments talks to the ledger without a contract',
    detail: 'Two services exchange data with no documented interface.',
    category: 'boundary',
    severity: 'high',
    elementIds: ['payments', 'ledger'],
    suggestion: 'Agree an interface and record it.',
    ...over,
  }
}

const WS: Workspace = {
  name: 'T',
  model: {
    people: [],
    softwareSystems: [{
      id: 'payments', type: 'softwareSystem', name: 'Payments',
      tags: ['Element', 'Software System'], properties: {}, containers: [],
    }],
    relationships: [], groups: [], deploymentEnvironments: [],
  },
  views: {
    systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
    dynamicViews: [], deploymentViews: [],
    configuration: { styles: { elements: [], relationships: [] } },
  },
}

function reviewProps(over: Record<string, unknown> = {}) {
  return {
    workspace: WS,
    scope: 'model' as const,
    onToggleScope: () => {},
    counts: { filled: 1, total: 1, pct: 100 },
    thingsCount: 1,
    gaps: [],
    drafts: {},
    draftsLoading: false,
    findings: [],
    reviewRan: true,
    reviewLoading: false,
    reviewError: null,
    onRunReview: () => {},
    onStopReview: () => {},
    openId: 'f1',
    onToggleRow: () => {},
    onApplyGap: () => {},
    onApplyFinding: () => {},
    onSkip: () => {},
    onDraftAdr: () => {},
    applyAllCount: 0,
    onApplyAll: () => {},
    appliedCount: 0,
    canUndoLast: false,
    undoStale: false,
    onUndoLast: () => {},
    skipNotice: null,
    error: null,
    ...over,
  }
}

afterEach(() => {
  cleanup()
  clearAiSession()
  useDocsStore.setState({ bundles: {}, loaded: false })
})

describe('adrSeedFromFinding', () => {
  it('uses the finding title as the topic — what the user saw and chose', () => {
    const seed = adrSeedFromFinding('f1', finding())
    expect(seed.topic).toBe('Payments talks to the ledger without a contract')
    expect(seed.sourceKey).toBe('f1')
  })

  it('carries the detail, suggestion, elements, category and severity as background', () => {
    const { background } = adrSeedFromFinding('f1', finding())
    expect(background).toContain('Two services exchange data with no documented interface.')
    expect(background).toContain('Agree an interface and record it.')
    expect(background).toContain('payments, ledger')
    expect(background).toContain('Category: boundary. Severity: high.')
  })

  it('omits the optional lines a finding did not supply', () => {
    const { background, citations } = adrSeedFromFinding('f1', finding({ suggestion: '', elementIds: [] }))
    expect(background).not.toContain('What the review suggested')
    expect(background).not.toContain('Elements involved')
    expect(citations).toBeUndefined()
  })

  it('carries the documents the finding cited', () => {
    const seed = adrSeedFromFinding('f1', finding({ citations: ['adrs/0003-use-kafka.md'] }))
    expect(seed.citations).toEqual(['adrs/0003-use-kafka.md'])
  })
})

describe('the Review row', () => {
  it('offers to draft an ADR on an advisory finding', () => {
    const onDraftAdr = vi.fn()
    render(<ReviewBody {...reviewProps({
      findings: [{ key: 'f1', scope: 'model', finding: finding() }],
      onDraftAdr,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /draft an adr about this/i }))
    expect(onDraftAdr).toHaveBeenCalledTimes(1)
    expect(onDraftAdr.mock.calls[0][0].key).toBe('f1')
  })

  it('still offers Mark done and Dismiss alongside it', () => {
    render(<ReviewBody {...reviewProps({ findings: [{ key: 'f1', scope: 'model', finding: finding() }] })} />)
    expect(screen.getByRole('button', { name: /mark done/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy()
  })

  it('does not offer it on a finding that carries a fix — Apply is the next step there', () => {
    const actionable = finding({
      operations: [{ op: 'setDescription', id: 'payments', description: 'x' }],
    })
    render(<ReviewBody {...reviewProps({ findings: [{ key: 'f1', scope: 'model', finding: actionable }] })} />)
    expect(screen.queryByRole('button', { name: /draft an adr about this/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeTruthy()
  })
})

describe('the drafter picking the finding up', () => {
  let complete: ReturnType<typeof vi.fn>
  let provider: AiProvider

  beforeEach(() => {
    complete = vi.fn().mockResolvedValue('# Decision\n\n**Status** Proposed')
    provider = { complete } as unknown as AiProvider
  })

  const seed: AdrSeed = adrSeedFromFinding('f1', finding())

  it('fills the topic and drafts it without the user typing anything', async () => {
    render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue(seed.topic)).toBeTruthy()
    expect(complete.mock.calls[0][0].user).toContain('Two services exchange data with no documented interface.')
    await screen.findByText(/Decision/)
  })

  it('says the draft is grounded in the finding', async () => {
    render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalled())
    expect(screen.getByText(/grounded in the review finding/i)).toBeTruthy()
  })

  it('does not re-draft the same finding when the tab is revisited', async () => {
    const first = render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    first.unmount()
    render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    // A re-mount restores the persisted draft rather than spending again.
    await waitFor(() => expect(screen.getByDisplayValue(seed.topic)).toBeTruthy())
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('drafts again when a different finding is handed over', async () => {
    const { rerender } = render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    const second = adrSeedFromFinding('f2', finding({ title: 'The ledger has no owner' }))
    rerender(<AdrBody provider={provider} workspace={WS} seed={second} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(screen.getByDisplayValue('The ledger has no owner')).toBeTruthy()
  })

  // The panel gives every click its own sourceKey, so handing the SAME finding
  // over a second time — after a failed draft, or after typing over the topic —
  // is a real re-draft and not a silent no-op.
  it('drafts again when the same finding is handed over a second time', async () => {
    const first = render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    first.unmount()

    const again = adrSeedFromFinding('f1#2', finding())
    render(<AdrBody provider={provider} workspace={WS} seed={again} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(screen.getByDisplayValue(again.topic)).toBeTruthy()
  })

  it('drops the finding context once the user edits the topic themselves', async () => {
    render(<AdrBody provider={provider} workspace={WS} seed={seed} />)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))

    const field = screen.getByDisplayValue(seed.topic)
    act(() => { fireEvent.change(field, { target: { value: 'Adopt event sourcing' } }) })
    expect(screen.queryByText(/grounded in the review finding/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /draft adr/i }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(complete.mock.calls[1][0].user).not.toContain('raised by a review')
  })

  it('retains a view review’s cited evidence across drafting and revisits, until the topic is edited', async () => {
    const workspace = parseDSL(`workspace "T" {
      model {
        unrelated = softwareSystem "Unrelated" {
          !docs docs/unrelated
        }
        target = softwareSystem "Target" {
          !adrs adrs/target
        }
      }
      views {
        systemContext target "Target" { include * }
      }
    }`).workspace
    const evidence = 'Storage constraint: retain audit records for seven years.'
    const bundles = {
      [bundleKey('docs', 'docs/unrelated')]: parseDocsBundle('docs', 'docs/unrelated', Array.from({ length: 6 }, (_, i) => ({
        name: `${i}.md`, text: `# General ${i}\n\n${'General guidance.\n'.repeat(140)}`,
      }))),
      [bundleKey('adrs', 'adrs/target')]: parseDocsBundle('adrs', 'adrs/target', [{
        name: 'storage.md', text: `# Storage\n\n## Status\n\nAccepted\n\n## Decision\n\n${evidence}`,
      }]),
    }
    const citedId = 'adrs/target/storage'
    // The review saw this document, but whole-model retrieval crowds it out.
    expect(buildDocsContext(bundles, workspace, workspace.views.systemContextViews[0])!.conceptIds.has(citedId)).toBe(true)
    expect(buildDocsContext(bundles, workspace)!.conceptIds.has(citedId)).toBe(false)
    useDocsStore.setState({ bundles, loaded: true })
    const citedSeed = adrSeedFromFinding('cited', finding({ citations: [citedId] }))
    const first = render(<AdrBody provider={provider} workspace={workspace} seed={citedSeed} />)
    await screen.findByText(/Decision/)
    expect(complete.mock.calls[0][0].user).toContain(evidence)
    first.unmount()

    // Citation priority survives with the draft's persisted background, even
    // when the handoff prop is no longer present on the next visit.
    render(<AdrBody provider={provider} workspace={workspace} />)
    expect(complete).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /draft adr/i }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(complete.mock.calls[1][0].user).toContain(evidence)
    await waitFor(() => expect((screen.getByRole('button', { name: /draft adr/i }) as HTMLButtonElement).disabled).toBe(false))

    fireEvent.change(screen.getByDisplayValue(citedSeed.topic), { target: { value: 'An unrelated decision' } })
    fireEvent.click(screen.getByRole('button', { name: /draft adr/i }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(3))
    expect(complete.mock.calls[2][0].user).not.toContain(evidence)
    expect(complete.mock.calls[2][0].user).not.toContain('raised by a review')
  })

  it('leaves a hand-typed draft alone when there is no seed', async () => {
    render(<AdrBody provider={provider} workspace={WS} seed={null} />)
    expect(complete).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText(/adopt event-driven/i), { target: { value: 'Use Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: /draft adr/i }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(complete.mock.calls[0][0].user).not.toContain('raised by a review')
  })
})
