import type { Workspace } from '@/types/model'
import { getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile, writeSidecarFile, writeDSLFileAt } from '@/lib/folderIO'
import { serializeRoot, planIncludedWrites } from '@/lib/includeWriteback'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { createLogger } from '@/lib/logger'

const log = createLogger('workspaceSave')

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

/** Last fragment written per included path, so unchanged files aren't
 *  rewritten. Scoped to one root file: switching folder or workspace must
 *  not let a memo from another workspace suppress a needed write. */
const lastIncludedWrites = new Map<string, string>()
let lastIncludedWritesFor: string | null = null

/** Write the workspace's DSL (plus its layout sidecar and any writable
 *  `!include`d fragments) to the file it is linked to. Resolves `false` when
 *  the workspace is not linked or the write failed. Throws when the
 *  workspace cannot be serialized — callers decide how loud to be. */
export async function writeLinkedWorkspace(workspace: Workspace, activeFilename: string | null): Promise<boolean> {
  const hasSingleFile = !!getCurrentFileHandle()
  const dirHandle = getCurrentDirHandle()
  if (!hasSingleFile && !(dirHandle && activeFilename)) return false

  const dsl = serializeRoot(workspace)
  const sidecar = extractSidecar(workspace)
  let ok = true

  if (hasSingleFile) {
    ok = (await writeToCurrentHandle(dsl)) && ok
    if (sidecar) await writeSidecarToHandle(serializeSidecar(sidecar))
  }

  if (dirHandle && activeFilename) {
    ok = (await writeDSLFile(activeFilename, dsl)) && ok
    if (sidecar) await writeSidecarFile(activeFilename, serializeSidecar(sidecar))
    // Write-back: each writable !include'd file gets its own fragment,
    // only when it actually changed (TEA-325).
    const scope = `${dirHandle.name}/${activeFilename}`
    if (lastIncludedWritesFor !== scope) { lastIncludedWrites.clear(); lastIncludedWritesFor = scope }
    for (const w of planIncludedWrites(workspace)) {
      if (lastIncludedWrites.get(w.path) === w.content) continue
      lastIncludedWrites.set(w.path, w.content)
      void writeDSLFileAt(w.path, w.content).then((wrote) => {
        if (!wrote) log.warn('Included file write-back failed', w.path)
      })
    }
  }

  return ok
}
