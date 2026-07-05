import { useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import {
  aiErrorMessage, applyEditPlan, summarizeSkips, flattenElements,
  type EditActions, type ApplyResult, type EditPlan,
} from '@/lib/ai'
import type { Workspace } from '@/types/model'

// ─── run state (shared by every feature body) ───────────────────────

export function isAbortError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError'
}

export interface RunState {
  loading: boolean
  error: string | null
  /** Run `fn`, tracking loading/error. `fn` receives an AbortSignal it can pass
   *  to a streaming call so `cancel()` (or a superseding `go`) stops it. */
  go: <T>(fn: (signal: AbortSignal) => Promise<T>, onResult: (v: T) => void) => Promise<void>
  /** Abort the in-flight run. The result is discarded and no error is shown —
   *  it's a user action, not a failure. No-op when nothing is running. */
  cancel: () => void
  /** Re-run the last `go` — the retry for a failed call whose inputs (an
   *  interview answer, a kickoff) are captured in its closure and may no
   *  longer exist in state. No-op while loading or before any run. */
  retry: () => void
}
export function useAiRun(): RunState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastRun = useRef<(() => Promise<void>) | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  async function go<T>(fn: (signal: AbortSignal) => Promise<T>, onResult: (v: T) => void) {
    lastRun.current = () => go(fn, onResult)
    abortRef.current?.abort() // supersede any in-flight run
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true); setError(null)
    try {
      const v = await fn(ac.signal)
      if (!ac.signal.aborted) onResult(v)
    } catch (err) {
      // A user cancel (or a superseding run) surfaces as an AbortError — not a failure.
      if (!ac.signal.aborted && !isAbortError(err)) setError(aiErrorMessage(err))
    } finally {
      if (abortRef.current === ac) { abortRef.current = null; setLoading(false) }
    }
  }
  function cancel() { abortRef.current?.abort(); abortRef.current = null; setLoading(false) }
  function retry() { if (!loading) void lastRun.current?.() }
  return { loading, error, go, cancel, retry }
}

// ─── apply helpers ──────────────────────────────────────────────────

// EditActions bound to the live store — the seam applyEditPlan drives.
export function storeEditActions(): EditActions {
  const s = useWorkspaceStore.getState()
  return {
    addPerson: (name) => s.addPerson(name),
    addSoftwareSystem: (name, external) => s.addSoftwareSystem(name, undefined, external ? 'External' : undefined),
    addContainer: (systemId, name) => s.addContainer(systemId, name),
    addComponent: (containerId, name) => s.addComponent(containerId, name),
    addRelationship: (src, dst, desc, tech) => s.addRelationship(src, dst, desc, tech),
    updateElement: (id, patch) => s.updateElement(id, patch),
    updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    deleteElement: (id) => s.deleteElement(id),
    addView: (type, scopeId, title) => s.addView(type, scopeId, title),
  }
}

export function applyPlanToStore(plan: EditPlan, ws: Workspace, opts?: { batched?: boolean }): ApplyResult {
  const s = useWorkspaceStore.getState()
  // Apply in batch mode so the per-op addContainer/addComponent don't jump the
  // canvas to each created view; then navigate ONCE to where the new elements are.
  // Validate and diff against the LIVE store (not the possibly-stale `ws` prop
  // snapshot) so the applier doesn't skip edits to elements added since the panel
  // rendered, and the navigation target is accurate.
  // When `batched`, the CALLER already opened the undo batch (so post-apply view
  // mutations coalesce into the same single undo entry) — don't toggle it here.
  const liveBefore = s.workspace ?? ws
  const before = new Set(flattenElements(liveBefore).map((e) => e.id))
  const ownBatch = !opts?.batched
  if (ownBatch) s.setBatchApplying(true)
  let result: ApplyResult = { applied: [], appliedCount: 0, skippedCount: 0 }
  try {
    result = applyEditPlan(plan, storeEditActions(), liveBefore)
  } finally {
    if (ownBatch) s.setBatchApplying(false)
  }
  const updated = useWorkspaceStore.getState().workspace
  const newIds = updated ? flattenElements(updated).filter((e) => !before.has(e.id)).map((e) => e.id) : []
  if (newIds.length) useWorkspaceStore.getState().focusViewForElements(newIds)
  return result
}

/** Everything the post-apply summary needs. `plan` is retained so Undo can
 *  restore the preview card for a re-apply. */
export interface AppliedInfo {
  plan: EditPlan
  appliedCount: number
  skipText: string | null
  /** Workspace ref taken right after a committed apply. Undo is offered only
   *  while the live workspace is still this exact ref — any later edit (or the
   *  user's own ⌘Z) invalidates it, since a blind undo() would then revert the
   *  wrong thing. Null when the apply changed nothing (no undo entry exists). */
  undoTarget: Workspace | null
}

/** Apply a plan and package the outcome for an AppliedSummary card. */
export function runApply(plan: EditPlan, ws: Workspace): AppliedInfo {
  const before = useWorkspaceStore.getState().workspace
  const result = applyPlanToStore(plan, ws)
  const after = useWorkspaceStore.getState().workspace
  return {
    plan,
    appliedCount: result.appliedCount,
    skipText: summarizeSkips(result),
    undoTarget: after !== before ? after : null,
  }
}

export function plural(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}` }
