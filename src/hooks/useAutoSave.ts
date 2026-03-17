import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveToLocalStorage, getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { serializeDSL } from '@/lib/dsl'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'

/** Auto-save workspace to localStorage on changes (debounced).
 *  Also writes to the current .dsl file handle and .c4hero.json sidecar if open. */
export function useAutoSave() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (!workspace) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Always save to localStorage for crash recovery
      saveToLocalStorage(workspace)

      // Also write to the current file handle if available
      if (getCurrentFileHandle()) {
        const dsl = serializeDSL(workspace)
        writeToCurrentHandle(dsl)

        // Write sidecar with app-specific metadata
        const sidecar = extractSidecar(workspace)
        if (sidecar) {
          writeSidecarToHandle(serializeSidecar(sidecar))
        }
      }
    }, 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [workspace])
}
