import type { Workspace } from '@/types/model'
import { enqueueFileWrites, getCurrentFileHandle, getCurrentSidecarHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, readDSLFileAt, writeDSLFile, writeSidecarFile, writeDSLFileAt } from '@/lib/folderIO'
import { serializeRoot, planIncludedWrites } from '@/lib/includeWriteback'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { captureSelfWrite } from '@/lib/saveCoordinator'
import { createLogger } from '@/lib/logger'

const log = createLogger('workspaceSave')

// Included files are not independently watched. Compare them with their
// loaded or last confirmed bytes before overwriting an external edit. Keep
// the loaded text as well so reopening a changed fragment establishes a new
// baseline rather than retaining the previous document's save history.
let confirmedIncludes = new WeakMap<FileSystemDirectoryHandle, Map<string, Map<string, {
  loaded: string | undefined
  content: string
}>>>()

/** Loading/reloading accepts a new disk baseline, even when an external
 * restoration returns exactly the text originally loaded in this session. */
export function resetIncludedSaveHistory(): void {
  confirmedIncludes = new WeakMap()
}

/**
 * Writing a workspace back to where it came from. One routine shared by
 * autosave, the Save button and Ctrl+S, so every path agrees on what
 * "linked" means: either a single-file handle from the file picker, or a
 * folder collection plus the active filename inside it. Only when neither
 * applies does a save need to ask where the file should go.
 */

/** The workspace is linked to a file if EITHER:
 *  - A single-file handle is open (file-picker mode), OR
 *  - A folder handle is open AND an active filename is set (collection mode). */
export function isWorkspaceLinked(activeFilename: string | null): boolean {
  if (getCurrentFileHandle() !== null) return true
  if (getCurrentDirHandle() !== null && activeFilename) return true
  return false
}

/** Write the workspace's DSL (plus its layout sidecar and any writable
 *  `!include`d fragments) to the file it is linked to. Resolves `false` when
 *  the workspace is not linked or the write failed. Throws when the
 *  workspace cannot be serialized — callers decide how loud to be. */
export async function writeLinkedWorkspace(workspace: Workspace, activeFilename: string | null): Promise<boolean> {
  // Capture every destination and serialized fragment before yielding. Later
  // stages must not resolve their target from a newly selected workspace.
  const fileHandle = getCurrentFileHandle()
  const sidecarHandle = fileHandle ? getCurrentSidecarHandle() : null
  const dirHandle = getCurrentDirHandle()
  if (!fileHandle && !(dirHandle && activeFilename)) return false

  const dsl = serializeRoot(workspace)
  // Always write the projection, even when empty: a prior save in this same
  // session may have written positions which the user has since reset.
  const sidecarData = extractSidecar(workspace) ?? { version: 1 as const, views: {} }
  const sidecar = serializeSidecar(sidecarData)
  const included = dirHandle && activeFilename ? planIncludedWrites(workspace).map(fragment => ({
    ...fragment,
    loaded: workspace.includedFiles?.find(file => file.path === fragment.path)?.text,
  })) : []
  // Old queued saves retain their own history across a close/reopen.
  const includeHistory = confirmedIncludes
  const token = captureSelfWrite()

  // Reserve the entire save at invocation, so later palette/export writes
  // cannot overtake a queued root and its dependent files. The supplied
  // writer performs writes inside this task without enqueueing recursively.
  return enqueueFileWrites(async write => {
    // Each root stands on its own: failure suppresses its dependent writes,
    // while the other destination can still persist its own copy.
    let ok = true

    if (fileHandle) {
      if (await writeToCurrentHandle(dsl, fileHandle, token, write)) {
        // Native file-picker handles cannot expose their parent directory.
        // With no existing sidecar and no layout to persist, a DSL-only save
        // is complete. Material layout still requires a successful sidecar.
        const needsSidecar = sidecarHandle || typeof fileHandle.getParent === 'function'
          || Object.keys(sidecarData.views ?? {}).length > 0
        if (needsSidecar && !await writeSidecarToHandle(sidecar, fileHandle, sidecarHandle, token, write)) ok = false
      } else ok = false
    }

    if (dirHandle && activeFilename) {
      if (await writeDSLFile(activeFilename, dsl, dirHandle, token, write)) {
        if (!await writeSidecarFile(activeFilename, sidecar, dirHandle, token, write)) ok = false
        let roots = includeHistory.get(dirHandle)
        if (!roots) includeHistory.set(dirHandle, roots = new Map())
        let confirmed = roots.get(activeFilename)
        if (!confirmed) roots.set(activeFilename, confirmed = new Map())
        for (const fragment of included) {
          try {
            const prior = confirmed.get(fragment.path)
            const baseline = prior?.loaded === fragment.loaded ? prior?.content : fragment.loaded
            const current = await readDSLFileAt(fragment.path, dirHandle)
            if (current === null || (current !== baseline && current !== fragment.content)) {
              log.warn('Included file changed on disk; reopen the workspace before saving', { path: fragment.path })
              ok = false
              continue
            }
            if (await writeDSLFileAt(fragment.path, fragment.content, dirHandle, write)) {
              confirmed.set(fragment.path, { loaded: fragment.loaded, content: fragment.content })
            } else ok = false
          } catch (err) {
            log.error('Failed to save included file', { path: fragment.path, err })
            ok = false
          }
        }
      } else {
        ok = false
      }
    }

    return ok
  })
}
