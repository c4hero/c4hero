import type { Workspace } from '@/types/model'
import { exportWorkspaceAsOkf, okfBundleName } from '@/lib/okfExport'
import { hasDirectoryAccess } from '@/lib/fileIO'
import { writeFilesInto } from '@/lib/folderIO'
import { downloadBlob } from '@/lib/exportUtils'
import { zipBlob } from '@/lib/zip'
import { createLogger } from '@/lib/logger'

const log = createLogger('okfExport')

export type OkfExportTarget = 'folder' | 'zip'

/**
 * Run the OKF bundle export end to end: serialize, then either write the
 * files into a folder the user picks (Chromium, via the File System Access
 * API) or download them as a `.zip` (everywhere). `folder` silently falls
 * back to `zip` where the directory picker does not exist.
 *
 * Resolves to a message for the toast, or `null` when the user cancelled the
 * picker — that is not an error and gets no toast. Any other failure throws
 * so the caller can surface it the way it surfaces every other export error.
 */
export async function runOkfExport(
  workspace: Workspace,
  target: OkfExportTarget,
  generator?: string,
): Promise<string | null> {
  if (target === 'folder' && hasDirectoryAccess()) {
    let dir: FileSystemDirectoryHandle
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' })
    } catch (err) {
      if (isAbort(err)) return null
      throw err
    }
    // Serialized after the picker so a cancelled dialog costs nothing.
    const files = exportWorkspaceAsOkf(workspace, { generator })
    await writeFilesInto(dir, files)
    log.info('OKF bundle written', { files: files.length, dir: dir.name })
    return `Exported ${files.length} files to ${dir.name}/`
  }

  const files = exportWorkspaceAsOkf(workspace, { generator })
  downloadBlob(zipBlob(files), `${okfBundleName(workspace)}.zip`)
  return `Exported OKF bundle (${files.length} files)`
}

/** The picker rejects with a DOMException named AbortError when the user
 *  dismisses it. Checked by name, not `instanceof`, because the exception
 *  may come from another realm. */
function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}
