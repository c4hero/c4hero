import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import { makeWorkspace } from '@/lib/ai/testFixture'

function state() {
  return useWorkspaceStore.getState()
}

describe('compare slice', () => {
  beforeEach(() => {
    state().loadWorkspace(makeWorkspace())
  })

  it('starts with no comparison and the overlay armed', () => {
    expect(state().comparisonBase).toBeNull()
    expect(state().comparisonLabel).toBeNull()
    expect(state().comparisonPanelOpen).toBe(false)
    expect(state().comparisonOverlay).toBe(true)
  })

  it('startComparison stores the base revision and opens the panel', () => {
    const base = makeWorkspace()
    state().startComparison(base, 'v1.dsl')
    expect(state().comparisonBase).toBe(base)
    expect(state().comparisonLabel).toBe('v1.dsl')
    expect(state().comparisonPanelOpen).toBe(true)
    expect(state().comparisonOverlay).toBe(true)
  })

  it('keeps the base revision as a plain object, not an immer draft or frozen copy', () => {
    // The base is a read-only snapshot parsed from another file — deep-freezing
    // it would be wasted work, and drafting it would tie it to the store.
    const base = makeWorkspace()
    state().startComparison(base, 'v1.dsl')
    expect(Object.isFrozen(state().comparisonBase)).toBe(false)
    expect(state().comparisonBase).toBe(base)
  })

  it('startComparison closes the command palette so the two do not stack', () => {
    state().setCommandPaletteOpen(true)
    state().startComparison(makeWorkspace(), 'v1.dsl')
    expect(state().commandPaletteOpen).toBe(false)
  })

  it('clearComparison drops the base, the label and the panel', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().clearComparison()
    expect(state().comparisonBase).toBeNull()
    expect(state().comparisonLabel).toBeNull()
    expect(state().comparisonPanelOpen).toBe(false)
    expect(state().comparisonOverlay).toBe(true)
  })

  it('toggles the canvas overlay without dropping the comparison', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().setComparisonOverlay(false)
    expect(state().comparisonOverlay).toBe(false)
    expect(state().comparisonBase).not.toBeNull()
  })

  it('reopens the panel for an already-running comparison', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().setComparisonPanelOpen(false)
    expect(state().comparisonPanelOpen).toBe(false)
    state().setComparisonPanelOpen(true)
    expect(state().comparisonPanelOpen).toBe(true)
    expect(state().comparisonLabel).toBe('v1.dsl')
  })

  it('drops the comparison when another workspace is loaded', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().loadWorkspace(makeWorkspace())
    expect(state().comparisonBase).toBeNull()
    expect(state().comparisonPanelOpen).toBe(false)
  })

  it('drops the comparison when the workspace is closed', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().closeWorkspace()
    expect(state().comparisonBase).toBeNull()
    expect(state().comparisonLabel).toBeNull()
    expect(state().comparisonPanelOpen).toBe(false)
  })

  it('survives edits to the open workspace — the base is never mutated', () => {
    const base = makeWorkspace()
    state().startComparison(base, 'v1.dsl')
    state().addPerson('Ops Engineer')
    expect(state().comparisonBase!.model.people).toHaveLength(base.model.people.length)
    expect(state().workspace!.model.people.length).toBe(base.model.people.length + 1)
  })
})
