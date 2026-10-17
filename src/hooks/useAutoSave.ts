import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveToLocalStorage } from '@/lib/fileIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from '@/lib/workspaceSave'
import { createLogger } from '@/lib/logger'

const log = createLogger('useAutoSave')

const scheduleIdle = typeof requestIdleCallback === 'function'
  ? (cb: () => void) => requestIdleCallback(cb, { timeout: 1000 })
  : (cb: () => void) => setTimeout(cb, 50)

const cancelIdle = typeof cancelIdleCallback === 'function'
  ? cancelIdleCallback
  : clearTimeout

/** Auto-save workspace to localStorage on changes (debounced).
 *  Also writes to the current .dsl file handle and .c4hero.json sidecar if open. */
export function useAutoSave() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)
  const idleHandle = useRef<number>(0)

  useEffect(() => {
    if (!workspace) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Re-read state at fire time — the workspace may have been closed
      // (e.g. during a delete) between the timer being set and it firing.
      const current = useWorkspaceStore.getState()
      const currentWs = current.workspace
      if (!currentWs) return

      // The callback belongs to this exact snapshot and destination, even
      // when a newly opened workspace has the same name or filename.
      const debouncedFilename = current.activeWorkspaceFilename

      // Always save to localStorage for crash recovery (fast, synchronous)
      saveToLocalStorage(currentWs)

      // Prefer idle time, but bound the delay: a busy canvas can otherwise
      // leave a valid edit in crash recovery without ever saving it to disk.
      cancelIdle(idleHandle.current)
      idleHandle.current = scheduleIdle(() => {
        // Re-check at idle fire time too — closeWorkspace may have run
        // after the debounce but before this idle callback.
        const state = useWorkspaceStore.getState()
        if (state.workspace !== currentWs || state.activeWorkspaceFilename !== debouncedFilename) return

        // The same write the Save button and Ctrl+S perform. Only a linked
        // workspace is ever marked saved: an unlinked one must stay dirty so
        // the disk watcher still treats local edits as unsaved.
        if (!isWorkspaceLinked(state.activeWorkspaceFilename)) return
        const savedWorkspace = state.workspace
        const savedFilename = state.activeWorkspaceFilename
        const undoLength = state.undoStack.length
        writeLinkedWorkspace(savedWorkspace, savedFilename).then(
          (ok) => {
            const current = useWorkspaceStore.getState()
            if (current.workspace === savedWorkspace && current.activeWorkspaceFilename === savedFilename) {
              current.setFileSaveFailed(!ok)
              if (ok) current.setLastSavedUndoLength(undoLength)
            }
          },
          // Manual save/export surfaces the same actionable message. Avoid
          // turning an invalid legacy overlap into an unhandled idle-task
          // exception while still leaving the workspace marked unsaved.
          (error) => {
            const current = useWorkspaceStore.getState()
            if (current.workspace === savedWorkspace && current.activeWorkspaceFilename === savedFilename) {
              current.setFileSaveFailed(true)
            }
            log.warn('Automatic DSL save blocked', error)
          },
        )
      }) as unknown as number
    }, 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      cancelIdle(idleHandle.current)
    }
  }, [workspace, activeFilename])
}
