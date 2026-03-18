import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveToLocalStorage, getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
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
      // Always save to localStorage for crash recovery (fast, synchronous)
      saveToLocalStorage(workspace)

      // Defer file I/O to idle time so it doesn't block interaction
      cancelIdle(idleHandle.current)
      idleHandle.current = scheduleIdle(() => {
        if (getCurrentFileHandle()) {
          const dsl = serializeDSL(workspace)
          writeToCurrentHandle(dsl)

          const sidecar = extractSidecar(workspace)
          if (sidecar) writeSidecarToHandle(serializeSidecar(sidecar))

          const undoLength = useWorkspaceStore.getState().undoStack.length
          useWorkspaceStore.getState().setLastSavedUndoLength(undoLength)
        }
      }) as unknown as number
    }, 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      cancelIdle(idleHandle.current)
    }
  }, [workspace])
}
