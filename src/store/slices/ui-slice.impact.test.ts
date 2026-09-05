import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import { makeWorkspace } from '@/lib/ai/testFixture'

function state() {
  return useWorkspaceStore.getState()
}

describe('impact panel state', () => {
  beforeEach(() => {
    state().loadWorkspace(makeWorkspace())
  })

  it('starts closed', () => {
    expect(state().impactTargetIds).toBeNull()
  })

  it('opens with a snapshot of the ids it was given', () => {
    const ids = ['web', 'db']
    state().openImpactPanel(ids)
    expect(state().impactTargetIds).toEqual(['web', 'db'])
    // A copy, so mutating the caller's array can't rewrite the question.
    ids.push('cart')
    expect(state().impactTargetIds).toEqual(['web', 'db'])
  })

  it('closes the command palette so the two do not stack', () => {
    state().setCommandPaletteOpen(true)
    state().openImpactPanel(['web'])
    expect(state().commandPaletteOpen).toBe(false)
  })

  it('closes on request', () => {
    state().openImpactPanel(['web'])
    state().closeImpactPanel()
    expect(state().impactTargetIds).toBeNull()
  })

  it('does not follow the canvas selection once open', () => {
    state().openImpactPanel(['web'])
    state().selectElements(['db'])
    expect(state().impactTargetIds).toEqual(['web'])
  })

  it('closes when another workspace is loaded', () => {
    state().openImpactPanel(['web'])
    state().loadWorkspace(makeWorkspace())
    expect(state().impactTargetIds).toBeNull()
  })

  it('closes when the workspace is closed', () => {
    state().openImpactPanel(['web'])
    state().closeWorkspace()
    expect(state().impactTargetIds).toBeNull()
  })
})
