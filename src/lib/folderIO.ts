import { sidecarName } from '@/lib/sidecar'
import { createLogger } from '@/lib/logger'

const log = createLogger('folderIO')

// ─── Module-level state ───────────────────────────────────────────────

let currentDirHandle: FileSystemDirectoryHandle | null = null

// ─── IndexedDB helpers ────────────────────────────────────────────────

const DB_NAME = 'c4hero'
const STORE_NAME = 'handles'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Public API ───────────────────────────────────────────────────────

/** Check if the File System Access API directory picker is available */
export function hasFolderAccess(): boolean {
  return 'showDirectoryPicker' in window
}

/** Get the currently active directory handle */
export function getCurrentDirHandle(): FileSystemDirectoryHandle | null {
  return currentDirHandle
}

export async function setDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  currentDirHandle = handle
  await persistDirHandle()
}

/** Open a folder via showDirectoryPicker, list .dsl files within it */
export async function openFolder(): Promise<{ dirHandle: FileSystemDirectoryHandle; dslFiles: string[] } | null> {
  if (!hasFolderAccess()) return null
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
    currentDirHandle = dirHandle
    const dslFiles = await listDSLFilesIn(dirHandle)
    await persistDirHandle()
    return { dirHandle, dslFiles }
  } catch (err) {
    // User cancelled (AbortError) or permission denied — not an error
    log.warn('openFolder cancelled or failed', err)
    return null
  }
}

/** Read a .dsl file and its matching .c4hero.json sidecar from the current directory */
export async function readDSLFile(filename: string): Promise<{ content: string; sidecarJson?: string } | null> {
  if (!currentDirHandle) return null
  try {
    const fileHandle = await currentDirHandle.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const content = await file.text()

    let sidecarJson: string | undefined
    try {
      const sidecarFilename = sidecarName(filename)
      const sidecarHandle = await currentDirHandle.getFileHandle(sidecarFilename)
      const sidecarFile = await sidecarHandle.getFile()
      sidecarJson = await sidecarFile.text()
    } catch {
      // No sidecar — expected for new workspaces
    }

    return { content, sidecarJson }
  } catch (err) {
    log.warn('readDSLFile failed', err)
    return null
  }
}

/** Write DSL content to a file in the current directory (creates if not present) */
export async function writeDSLFile(filename: string, content: string): Promise<boolean> {
  if (!currentDirHandle) return false
  try {
    const fileHandle = await currentDirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
    return true
  } catch (err) {
    log.error('writeDSLFile failed', err)
    return false
  }
}

/** Write sidecar JSON to the matching .c4hero.json file in the current directory */
export async function writeSidecarFile(dslFilename: string, json: string): Promise<boolean> {
  if (!currentDirHandle) return false
  try {
    const filename = sidecarName(dslFilename)
    const fileHandle = await currentDirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(json)
    await writable.close()
    return true
  } catch (err) {
    log.error('writeSidecarFile failed', err)
    return false
  }
}

/** List all .dsl files in the current directory */
export async function listDSLFiles(): Promise<string[]> {
  if (!currentDirHandle) return []
  return listDSLFilesIn(currentDirHandle)
}

/** Persist a directory handle to IndexedDB keyed by folder name */
export async function persistDirHandle(): Promise<void> {
  if (!currentDirHandle) return
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    // Always update the "last" handle for quick restore on startup
    store.put(currentDirHandle, 'dirHandle')
    // Also key by folder name so recents can be restored without re-prompting
    store.put(currentDirHandle, `folder:${currentDirHandle.name}`)
  } catch (err) {
    log.warn('persistDirHandle failed', err)
  }
}

/** Try to restore a handle by folder name (for recents). Returns null if permission not granted. */
export async function restoreDirHandleByName(name: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const handle: FileSystemDirectoryHandle = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(`folder:${name}`)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle)
      req.onerror = () => reject(req.error)
    })
    if (!handle) return null
    const perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') {
      currentDirHandle = handle
      return handle
    }
    // Permission not granted — need to re-prompt (browser security requirement)
    return null
  } catch {
    return null
  }
}

/** Restore directory handle from IndexedDB if permission is still granted */
export async function restoreDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const handle: FileSystemDirectoryHandle = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get('dirHandle')
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle)
      req.onerror = () => reject(req.error)
    })
    if (!handle) return null
    const perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') {
      currentDirHandle = handle
      return handle
    }
    return null
  } catch {
    return null
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────

async function listDSLFilesIn(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
  const files: string[] = []
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && name.endsWith('.dsl')) {
      files.push(name)
    }
  }
  return files.sort()
}
