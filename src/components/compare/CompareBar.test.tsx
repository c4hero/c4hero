import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CompareBar from './CompareBar'
import { useWorkspaceStore } from '@/store/workspace'
import { makeWorkspace } from '@/lib/ai/testFixture'

function state() {
  return useWorkspaceStore.getState()
}

describe('CompareBar', () => {
  beforeEach(() => {
    state().loadWorkspace(makeWorkspace())
  })

  it('stays out of the way when no comparison is running', () => {
    const { container } = render(<CompareBar />)
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden while the compare panel itself is open', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    const { container } = render(<CompareBar />)
    expect(container.firstChild).toBeNull()
  })

  it('names the revision and summarizes the diff once the panel closes', () => {
    const base = makeWorkspace()
    state().startComparison(base, 'v1.dsl')
    state().setComparisonPanelOpen(false)
    state().addPerson('Ops Engineer')

    render(<CompareBar />)
    expect(screen.getByText('vs v1.dsl')).toBeTruthy()
    expect(screen.getByText('1 added')).toBeTruthy()
  })

  it('reopens the panel when the summary is clicked', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().setComparisonPanelOpen(false)
    render(<CompareBar />)

    fireEvent.click(screen.getByText('vs v1.dsl'))
    expect(state().comparisonPanelOpen).toBe(true)
  })

  it('clears the comparison from the dismiss button', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().setComparisonPanelOpen(false)
    render(<CompareBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing revisions' }))
    expect(state().comparisonBase).toBeNull()
  })

  it('reserves top chrome space so zoom-to-fit does not tuck the diagram behind it', () => {
    state().startComparison(makeWorkspace(), 'v1.dsl')
    state().setComparisonPanelOpen(false)
    const { container } = render(<CompareBar />)
    expect((container.firstChild as HTMLElement).getAttribute('data-canvas-fit-chrome')).toBe('top')
  })
})
