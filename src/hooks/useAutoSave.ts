import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveToLocalStorage, getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile, writeSidecarFile } from '@/lib/folderIO'
import { serializeDSL } from '@/lib/dsl'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'

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

        const hasSingleFile = !!getCurrentFileHandle()
        const dirHandle = getCurrentDirHandle()
        const filename = state.activeWorkspaceFilename

        if (hasSingleFile || (dirHandle && filename)) {
          const dsl = serializeDSL(state.workspace)
          const sidecar = extractSidecar(state.workspace)

          if (hasSingleFile) {
            writeToCurrentHandle(dsl)
            if (sidecar) writeSidecarToHandle(serializeSidecar(sidecar))
          }

          if (dirHandle && filename) {
            writeDSLFile(filename, dsl)
            if (sidecar) writeSidecarFile(filename, serializeSidecar(sidecar))
          }

          useWorkspaceStore.getState().setLastSavedUndoLength(state.undoStack.length)
        }
      }) as unknown as number
    }, 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      cancelIdle(idleHandle.current)
    }
  }, [workspace])
}
