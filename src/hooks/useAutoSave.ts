import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveToLocalStorage } from '@/lib/fileIO'
import { writeLinkedWorkspace } from '@/lib/workspaceSave'
import { createLogger } from '@/lib/logger'

const log = createLogger('useAutoSave')

const scheduleIdle = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (cb: () => void) => setTimeout(cb, 50)

const cancelIdle = typeof cancelIdleCallback === 'function'
  ? cancelIdleCallback
  : clearTimeout

/** Auto-save workspace to localStorage on changes (debounced).
 *  Also writes to the current .dsl file handle and .c4hero.json sidecar if open. */
export function useAutoSave() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)
  const idleHandle = useRef<number>(0)

  useEffect(() => {
    if (!workspace) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Re-read state at fire time — the workspace may have been closed
      // (e.g. during a delete) between the timer being set and it firing.
      const currentWs = useWorkspaceStore.getState().workspace
      if (!currentWs) return

      // Capture workspace identity so the idle callback can verify it hasn't changed.
      // If the user switches workspaces between debounce fire and idle fire, we skip
      // file I/O — the localStorage save below already captured the correct state.
      const savedName = currentWs.name

      // Always save to localStorage for crash recovery (fast, synchronous)
      saveToLocalStorage(currentWs)

      // Defer file I/O to idle time so it doesn't block interaction
      cancelIdle(idleHandle.current)
      idleHandle.current = scheduleIdle(() => {
        // Re-check at idle fire time too — closeWorkspace may have run
        // after the debounce but before this idle callback.
        const state = useWorkspaceStore.getState()
        if (!state.workspace || state.workspace.name !== savedName) return

        try {
          // The same write the Save button and Ctrl+S perform; a no-op
          // (false) when the workspace is not linked to any file.
          void writeLinkedWorkspace(state.workspace, state.activeWorkspaceFilename)
          useWorkspaceStore.getState().setLastSavedUndoLength(state.undoStack.length)
        } catch (error) {
          // Manual save/export surfaces the same actionable message. Avoid
          // turning an invalid legacy overlap into an unhandled idle-task
          // exception while still leaving the workspace marked unsaved.
          log.warn('Automatic DSL save blocked', error)
        }
      }) as unknown as number
    }, 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      cancelIdle(idleHandle.current)
    }
  }, [workspace])
}
