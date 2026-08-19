import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { makeWorkspace } from '@/lib/ai/testFixture'
import { applyPlanToStore } from './aiHelpers'
import { generateDiagramStream, reviewArchitectureStream } from '@/lib/ai/features'
import type { AiProvider } from '@/lib/ai/types'
import type { EditPlan } from '@/lib/ai'

describe('applyPlanToStore — transactional apply', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    // Undo/redo stacks aren't reset by loadWorkspace in every path this suite
    // cares about — start each test from a clean slate explicitly.
    useWorkspaceStore.setState({ undoStack: [], redoStack: [] })
  })

  it('rolls back the workspace and undo/redo stacks when a store action throws mid-apply', () => {
    const ws = useWorkspaceStore.getState().workspace!
    const preWsJson = JSON.stringify(ws)
    const preUndoLen = useWorkspaceStore.getState().undoStack.length
    const preRedoLen = useWorkspaceStore.getState().redoStack.length

    // Wrap the real addRelationship so the 2nd invocation throws — simulating a
    // defective store action mid-batch, without needing an adversarial plan.
    const orig = useWorkspaceStore.getState().addRelationship
    let calls = 0
    useWorkspaceStore.setState({
      addRelationship: (...args: Parameters<typeof orig>) => {
        calls++
        if (calls === 2) throw new Error('boom: simulated store failure')
        return orig(...args)
      },
    })

    const plan: EditPlan = {
      operations: [
        { op: 'addRelationship', source: 'admin', destination: 'web', description: 'Administers' },
        { op: 'addRelationship', source: 'admin', destination: 'db', description: 'Administers' },
      ],
    }

    try {
      expect(() => applyPlanToStore(plan, ws)).toThrow('boom: simulated store failure')
    } finally {
      useWorkspaceStore.setState({ addRelationship: orig })
    }

    const after = useWorkspaceStore.getState()
    expect(JSON.stringify(after.workspace)).toBe(preWsJson)
    expect(after.undoStack.length).toBe(preUndoLen)
    expect(after.redoStack.length).toBe(preRedoLen)
  })

  it('applying a multi-op plan grows undoStack by exactly 1, and one undo() fully reverts it', () => {
    const ws = useWorkspaceStore.getState().workspace!
    const preWsJson = JSON.stringify(ws)
    const preUndoLen = useWorkspaceStore.getState().undoStack.length

    const plan: EditPlan = {
      operations: [
        { op: 'addPerson', ref: 'p1', name: 'Support Agent' },
        { op: 'addSoftwareSystem', ref: 's1', name: 'Billing' },
        { op: 'addRelationship', source: 'p1', destination: 's1', description: 'Uses' },
        { op: 'updateElement', id: 'web', description: 'Storefront UI (updated)' },
      ],
    }
    const result = applyPlanToStore(plan, ws)
    expect(result.appliedCount).toBe(4)
    expect(result.skippedCount).toBe(0)

    expect(useWorkspaceStore.getState().undoStack.length).toBe(preUndoLen + 1)

    useWorkspaceStore.getState().undo()
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(preWsJson)
  })

  it('two sequential per-item applies grow undoStack by 2; one undo() reverts only the second', () => {
    const ws = useWorkspaceStore.getState().workspace!
    const preUndoLen = useWorkspaceStore.getState().undoStack.length

    const plan1: EditPlan = { operations: [{ op: 'addPerson', ref: 'p1', name: 'Auditor' }] }
    applyPlanToStore(plan1, ws)
    const afterFirst = useWorkspaceStore.getState().workspace!
    const afterFirstJson = JSON.stringify(afterFirst)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(preUndoLen + 1)

    const plan2: EditPlan = { operations: [{ op: 'addPerson', ref: 'p2', name: 'Support' }] }
    applyPlanToStore(plan2, afterFirst)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(preUndoLen + 2)

    useWorkspaceStore.getState().undo()
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(afterFirstJson)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(preUndoLen + 1)
  })
})

describe('streaming AI calls — abort safety', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.setState({ undoStack: [], redoStack: [] })
  })

  function abortError() {
    const e = new Error('aborted')
    e.name = 'AbortError'
    return e
  }

  it('reviewArchitectureStream never mutates the store when aborted mid-stream', async () => {
    const preJson = JSON.stringify(useWorkspaceStore.getState())
    const partial = '{"findings": [{"title": "Something"'
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) {
        req.onText(partial)
        throw abortError()
      },
    }
    const ws = useWorkspaceStore.getState().workspace!
    await expect(
      reviewArchitectureStream(provider, ws, null, () => {}),
    ).rejects.toThrow()
    expect(JSON.stringify(useWorkspaceStore.getState())).toBe(preJson)
  })

  it('generateDiagramStream never mutates the store when aborted mid-stream', async () => {
    const preJson = JSON.stringify(useWorkspaceStore.getState())
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) {
        req.onText('workspace "Shop" {\n')
        throw abortError()
      },
    }
    await expect(
      generateDiagramStream(provider, 'a shop', () => {}),
    ).rejects.toThrow()
    expect(JSON.stringify(useWorkspaceStore.getState())).toBe(preJson)
  })
})
