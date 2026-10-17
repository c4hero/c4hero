import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { getCurrentFileHandle, getCurrentSidecarHandle, readCurrentFile } from '@/lib/fileIO'
import { getCurrentDirHandle, readDSLFileForWatch, readDSLFileAt } from '@/lib/folderIO'
import { createFileWatcher, type SnapshotHashes, type WatchedSnapshot } from '@/lib/fileWatch'
import { getSelfWriteRevision, isSelfWrite, isSelfWritePending, resetSaveCoordinator, startWatchingDestination, type SaveDestination } from '@/lib/saveCoordinator'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { announce } from '@/lib/announce'
import { createLogger } from '@/lib/logger'
import { getTestFileSource, subscribeTestFileSource } from '@/lib/testFileSource'
import { getHandleRevision, subscribeHandleChanges } from '@/lib/handleChanges'

const log = createLogger('useDiskWatch')

export const DISK_WATCH_INTERVAL_MS = 2000

/** Is there anything on disk to watch for the current workspace? */
export function isDiskWatchable(activeFilename: string | null): boolean {
  if (getTestFileSource()) return true
  if (getCurrentFileHandle()) return true
  return !!(getCurrentDirHandle() && activeFilename)
}

/** The workspace store's dirty signal, plus the code pane's own buffer. */
function hasUnsavedLocalEdits(): boolean {
  const s = useWorkspaceStore.getState()
  return s.undoStack.length !== s.lastSavedUndoLength || s.codePaneDirty || s.fileSaveFailed
}

/** Parse what's on disk and swap it in. Returns false (and raises a conflict)
 *  when the text can't be applied safely. */
export async function applyDiskSnapshot(
  filename: string,
  snapshot: WatchedSnapshot,
  hashes: SnapshotHashes,
  canApply: () => boolean = () => true,
): Promise<boolean> {
  const store = useWorkspaceStore.getState()
  const current = store.workspace
  const currentFilename = store.activeWorkspaceFilename
  const currentFile = getCurrentFileHandle()
  const currentDir = getCurrentDirHandle()
  const { workspace, errors } = await loadWorkspaceDocument({
    content: snapshot.content,
    fallbackName: filename.replace(/\.dsl$/, ''),
    sidecarJson: snapshot.sidecarJson,
    readInclude: currentDir ? (path) => readDSLFileAt(path, currentDir) : undefined,
  })
  // Parsing includes can await disk. Neither a workspace switch nor a local
  // edit during that read may be overwritten by the old snapshot.
  const latest = useWorkspaceStore.getState()
  if (!canApply() || !latest.workspace
    || latest.activeWorkspaceFilename !== currentFilename
    || getCurrentFileHandle() !== currentFile || getCurrentDirHandle() !== currentDir) return false
  if (latest.workspace !== current) {
    latest.setDiskConflict({ filename, snapshot, hashes, reason: 'dirty' })
    return false
  }
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
  const workspace = useWorkspaceStore((s) => s.workspace)
  const workspaceName = workspace?.name
  const hasWorkspace = !!workspace
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const testSource = useSyncExternalStore(subscribeTestFileSource, getTestFileSource, getTestFileSource)
  // Linking a file changes a module handle without changing the workspace.
  // Subscribe to that identity change so watching starts immediately.
  useSyncExternalStore(subscribeHandleChanges, getHandleRevision, getHandleRevision)
  const watcherRef = useRef<ReturnType<typeof createFileWatcher> | null>(null)
  const fileHandle = getCurrentFileHandle()
  const dirHandle = getCurrentDirHandle()
  const watchedFilename = testSource?.filename ?? fileHandle?.name ?? activeFilename ?? `${workspaceName ?? 'workspace'}.dsl`

  useEffect(() => {
    if (!watchDisk || !hasWorkspace || !isDiskWatchable(activeFilename)) return

    let disposed = false
    const filename = watchedFilename
    const destination: SaveDestination | null = fileHandle
      ? { kind: 'file', handle: fileHandle }
      : dirHandle && activeFilename ? { kind: 'folder', handle: dirHandle, filename: activeFilename } : null
    const initialSidecar = getCurrentSidecarHandle()
    const isCurrentTarget = () => !disposed
      && getCurrentFileHandle() === fileHandle && getCurrentDirHandle() === dirHandle
      && getTestFileSource() === testSource
      && !!useWorkspaceStore.getState().workspace
      && useWorkspaceStore.getState().activeWorkspaceFilename === activeFilename
    const read = (): Promise<WatchedSnapshot | null> => {
      if (testSource) return testSource.read()
      if (fileHandle) {
        // A first save may create the sidecar after watching starts. Capture
        // that handle for each read, but never borrow another file's sidecar.
        const sidecar = getCurrentFileHandle() === fileHandle ? getCurrentSidecarHandle() : initialSidecar
        return readCurrentFile(fileHandle, sidecar)
      }
      if (dirHandle && activeFilename) return readDSLFileForWatch(activeFilename, dirHandle)
      return Promise.resolve(null)
    }

    // Clear old hashes, while preserving a newly linked file's active save.
    // Cleanup has already invalidated tokens belonging to a previous target.
    startWatchingDestination(destination)

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
      isSelfWrite: (hashes, previous) => !isCurrentTarget() || isSelfWrite(hashes, previous),
      shouldDefer: isSelfWritePending,
      readVersion: getSelfWriteRevision,
      onMissing: () => {
        if (!isCurrentTarget()) return
        resetSaveCoordinator(destination)
        useWorkspaceStore.getState().setDiskFileMissing(true)
        announce(`${filename} is no longer on disk`)
      },
      onChange: (snapshot, hashes) => {
        if (!isCurrentTarget()) return
        const store = useWorkspaceStore.getState()
        if (store.diskFileMissing) store.setDiskFileMissing(false)
        if (hasUnsavedLocalEdits()) {
          store.setDiskConflict({ filename, snapshot, hashes, reason: 'dirty' })
          announce(`${filename} changed on disk — you have unsaved changes`)
          return
        }
        void applyDiskSnapshot(filename, snapshot, hashes, isCurrentTarget)
      },
    })
    watcherRef.current = watcher
    watcher.start().catch((err) => log.warn('Disk watch failed to start', err))

    return () => {
      disposed = true
      watcher.dispose()
      resetSaveCoordinator()
      if (watcherRef.current === watcher) watcherRef.current = null
      const s = useWorkspaceStore.getState()
      if (s.diskConflict) s.setDiskConflict(null)
      if (s.diskFileMissing) s.setDiskFileMissing(false)
    }
    // Re-key on the watched file's identity, not on the workspace ref — a
    // reload swaps the ref but not the file.
  }, [watchDisk, hasWorkspace, watchedFilename, activeFilename, testSource, fileHandle, dirHandle])
}
