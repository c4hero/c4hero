import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { getCurrentFileHandle, readCurrentFile } from '@/lib/fileIO'
import { getCurrentDirHandle, readDSLFileForWatch } from '@/lib/folderIO'
import { createFileWatcher, type SnapshotHashes, type WatchedSnapshot } from '@/lib/fileWatch'
import { isSelfWrite, resetSaveCoordinator } from '@/lib/saveCoordinator'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { announce } from '@/lib/announce'
import { createLogger } from '@/lib/logger'
import { getTestFileSource, subscribeTestFileSource } from '@/lib/testFileSource'

const log = createLogger('useDiskWatch')

export const DISK_WATCH_INTERVAL_MS = 2000

/** Is there anything on disk to watch for the current workspace? */
export function isDiskWatchable(activeFilename: string | null): boolean {
  if (getTestFileSource()) return true
  if (getCurrentFileHandle()) return true
  return !!(getCurrentDirHandle() && activeFilename)
}

function currentFilename(activeFilename: string | null, workspaceName: string | undefined): string {
  return getTestFileSource()?.filename
    ?? activeFilename
    ?? `${workspaceName ?? 'workspace'}.dsl`
}

/** The workspace store's dirty signal, plus the code pane's own buffer. */
function hasUnsavedLocalEdits(): boolean {
  const s = useWorkspaceStore.getState()
  return s.undoStack.length !== s.lastSavedUndoLength || s.codePaneDirty
}

/** Parse what's on disk and swap it in. Returns false (and raises a conflict)
 *  when the text can't be applied safely. */
export function applyDiskSnapshot(filename: string, snapshot: WatchedSnapshot, hashes: SnapshotHashes): boolean {
  const store = useWorkspaceStore.getState()
  const current = store.workspace
  const { workspace, errors } = parseWorkspaceDocument({
    content: snapshot.content,
    fallbackName: filename.replace(/\.dsl$/, ''),
    sidecarJson: snapshot.sidecarJson,
  })
  if (errors.length > 0) {
    store.setDiskConflict({
      filename, snapshot, hashes, reason: 'unparseable',
      detail: `${errors.length} parse ${errors.length === 1 ? 'error' : 'errors'}`,
    })
    return false
  }
  // Same guard as the code pane: a file that parses to nothing (mid-write,
  // truncated, or genuinely emptied) must not silently wipe a populated canvas.
  const parsedEmpty = workspace.model.people.length === 0
    && workspace.model.softwareSystems.length === 0
    && workspace.model.deploymentEnvironments.length === 0
  const currentNonEmpty = !!current && (
    current.model.people.length > 0
    || current.model.softwareSystems.length > 0
    || current.model.deploymentEnvironments.length > 0
  )
  if (parsedEmpty && currentNonEmpty) {
    store.setDiskConflict({ filename, snapshot, hashes, reason: 'unparseable', detail: 'parses to an empty model' })
    return false
  }
  store.reloadWorkspaceFromDisk(workspace)
  announce(`${filename} changed on disk — reloaded`)
  return true
}

/**
 * Watch the open workspace's file(s) and reload on external change.
 * Mounted once beside useAutoSave. Does nothing without a handle or a test
 * source, and nothing at all when the user has watch mode off.
 */
export function useDiskWatch() {
  const watchDisk = useWorkspaceStore((s) => s.watchDisk)
  const workspaceName = useWorkspaceStore((s) => s.workspace?.name)
  const hasWorkspace = useWorkspaceStore((s) => !!s.workspace)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const testSource = useSyncExternalStore(subscribeTestFileSource, getTestFileSource, getTestFileSource)
  const watcherRef = useRef<ReturnType<typeof createFileWatcher> | null>(null)

  useEffect(() => {
    if (!watchDisk || !hasWorkspace || !isDiskWatchable(activeFilename)) return

    const filename = currentFilename(activeFilename, workspaceName)
    const read = (): Promise<WatchedSnapshot | null> => {
      const test = getTestFileSource()
      if (test) return test.read()
      if (getCurrentFileHandle()) return readCurrentFile()
      if (getCurrentDirHandle() && activeFilename) return readDSLFileForWatch(activeFilename)
      return Promise.resolve(null)
    }

    // A fresh watch target means the remembered self-writes belong to the
    // previous file. Start clean so an old hash can't mask a real edit here.
    resetSaveCoordinator()

    const watcher = createFileWatcher({
      read,
      intervalMs: DISK_WATCH_INTERVAL_MS,
      isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
      subscribeWake: (cb) => {
        document.addEventListener('visibilitychange', cb)
        window.addEventListener('focus', cb)
        return () => {
          document.removeEventListener('visibilitychange', cb)
          window.removeEventListener('focus', cb)
        }
      },
      isSelfWrite,
      onMissing: () => {
        useWorkspaceStore.getState().setDiskFileMissing(true)
        announce(`${filename} is no longer on disk`)
      },
      onChange: (snapshot, hashes) => {
        const store = useWorkspaceStore.getState()
        if (store.diskFileMissing) store.setDiskFileMissing(false)
        if (hasUnsavedLocalEdits()) {
          store.setDiskConflict({ filename, snapshot, hashes, reason: 'dirty' })
          announce(`${filename} changed on disk — you have unsaved changes`)
          return
        }
        applyDiskSnapshot(filename, snapshot, hashes)
      },
    })
    watcherRef.current = watcher
    watcher.start().catch((err) => log.warn('Disk watch failed to start', err))

    return () => {
      watcher.dispose()
      if (watcherRef.current === watcher) watcherRef.current = null
      const s = useWorkspaceStore.getState()
      if (s.diskConflict) s.setDiskConflict(null)
      if (s.diskFileMissing) s.setDiskFileMissing(false)
    }
    // Re-key on the watched file's identity, not on the workspace ref — a
    // reload swaps the ref but not the file.
  }, [watchDisk, hasWorkspace, workspaceName, activeFilename, testSource])
}
