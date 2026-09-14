import type { Workspace } from '@/types/model'
import { exportWorkspaceAsOkf, okfBundleName, isOkfBundleIndex, OKF_SECTION_DIRS } from '@/lib/okfExport'
import { hasDirectoryAccess } from '@/lib/fileIO'
import { listFilesIn, readFileIn, removeFilesIn, writeFilesInto } from '@/lib/folderIO'
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
    const stale = await staleBundleFiles(dir, files)
    await writeFilesInto(dir, files)
    const removed = await removeFilesIn(dir, stale)
    log.info('OKF bundle written', { files: files.length, removed: removed.length, dir: dir.name })
    const tidied = removed.length > 0 ? `, ${removed.length} stale ${removed.length === 1 ? 'file' : 'files'} removed` : ''
    return `Exported ${files.length} files to ${dir.name}/${tidied}`
  }

  const files = exportWorkspaceAsOkf(workspace, { generator })
  downloadBlob(zipBlob(files), `${okfBundleName(workspace)}.zip`)
  return `Exported OKF bundle (${files.length} files)`
}

/**
 * Bundle files already in the folder that this export no longer produces —
 * the concepts for elements that have since been renamed or deleted.
 *
 * Left behind they are worse than clutter: the bundle exists to be indexed
 * and cited, so a stale concept keeps being retrieved as architecture that
 * is still true. Only a folder holding a bundle this exporter wrote is
 * pruned, and only inside the directories a bundle owns — picking the wrong
 * folder must never cost the user a file.
 */
async function staleBundleFiles(
  dir: FileSystemDirectoryHandle,
  files: ReadonlyArray<{ path: string }>,
): Promise<string[]> {
  try {
    const index = await readFileIn(dir, 'index.md')
    if (index === null || !isOkfBundleIndex(index)) return []
    const writing = new Set(files.map((f) => f.path))
    const existing = await listFilesIn(dir, OKF_SECTION_DIRS)
    // Section directories only: a `README.md` someone dropped next to the
    // bundle is theirs, and the root index is rewritten anyway.
    return existing.filter((path) =>
      path.endsWith('.md') &&
      OKF_SECTION_DIRS.some((section) => path.startsWith(`${section}/`)) &&
      !writing.has(path))
  } catch (err) {
    // Tidying up is a courtesy; never fail an export over it.
    log.warn('Could not check the folder for stale bundle files', err)
    return []
  }
}

/** The picker rejects with a DOMException named AbortError when the user
 *  dismisses it. Checked by name, not `instanceof`, because the exception
 *  may come from another realm. */
function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}
