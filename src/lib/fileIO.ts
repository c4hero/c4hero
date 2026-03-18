import type { Workspace } from '@/types/model'

/** Max file size for DSL files: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** File handle for re-saving to the same file */
let currentFileHandle: FileSystemFileHandle | null = null
/** File handle for the sidecar .c4hero.json */
let currentSidecarHandle: FileSystemFileHandle | null = null

// ─── Recent Files ────────────────────────────────────────────────────

const RECENT_FILES_KEY = 'c4hero_recent_files'
const MAX_RECENT = 10

export interface RecentFile {
  name: string
  openedAt: string
}

export function getRecentFiles(): RecentFile[] {
  try {
    const data = localStorage.getItem(RECENT_FILES_KEY)
    if (!data) return []
    return JSON.parse(data) as RecentFile[]
  } catch {
    return []
  }
}

export function addRecentFile(name: string) {
  const recent = getRecentFiles().filter(f => f.name !== name)
  recent.unshift({ name, openedAt: new Date().toISOString() })
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  } catch {
    // localStorage full
  }
}

/** Get the current file handle for auto-save */
export function getCurrentFileHandle(): FileSystemFileHandle | null {
  return currentFileHandle
}

/** Write DSL content to the current file handle (for auto-save) */
export async function writeToCurrentHandle(content: string): Promise<boolean> {
  if (!currentFileHandle || !hasFileSystemAccess()) return false
  try {
    const writable = await currentFileHandle.createWritable()
    await writable.write(content)
    await writable.close()
    return true
  } catch {
    return false
  }
}

/** Write sidecar JSON to the .c4hero.json file alongside the DSL */
export async function writeSidecarToHandle(json: string): Promise<boolean> {
  if (!hasFileSystemAccess()) return false
  try {
    // If we have an existing sidecar handle, write to it
    if (currentSidecarHandle) {
      const writable = await currentSidecarHandle.createWritable()
      await writable.write(json)
      await writable.close()
      return true
    }
    // Otherwise try to create one in the same directory as the DSL file
    if (currentFileHandle) {
      const dirHandle = await currentFileHandle.getParent?.()
      if (dirHandle) {
        const dslFile = await currentFileHandle.getFile()
        const sidecarFileName = dslFile.name.replace(/\.dsl$/, '') + '.c4hero.json'
        currentSidecarHandle = await dirHandle.getFileHandle(sidecarFileName, { create: true })
        const writable = await currentSidecarHandle.createWritable()
        await writable.write(json)
        await writable.close()
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/** Check if File System Access API is available */
export function hasFileSystemAccess(): boolean {
  return 'showOpenFilePicker' in window
}

/** Open a .dsl file using File System Access API or fallback.
 *  Also attempts to load a .c4hero.json sidecar from the same directory. */
export async function openDSLFile(): Promise<{ content: string; name: string; sidecarJson?: string } | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Structurizr DSL',
            accept: { 'text/plain': ['.dsl'] },
          },
          {
            description: 'All files',
            accept: { 'text/plain': ['.txt', '.dsl'] },
          },
        ],
      })
      currentFileHandle = handle
      const file = await handle.getFile()
      if (file.size > MAX_FILE_SIZE) throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
      const content = await file.text()
      addRecentFile(file.name)

      // Try to load sidecar from same directory
      let sidecarJson: string | undefined
      try {
        const dirHandle = await handle.getParent?.()
        if (dirHandle) {
          const sidecarFileName = file.name.replace(/\.dsl$/, '') + '.c4hero.json'
          const sidecarFileHandle = await dirHandle.getFileHandle(sidecarFileName)
          currentSidecarHandle = sidecarFileHandle
          const sidecarFile = await sidecarFileHandle.getFile()
          sidecarJson = await sidecarFile.text()
        }
      } catch {
        // No sidecar found — that's fine
        currentSidecarHandle = null
      }

      return { content, name: file.name, sidecarJson }
    } catch {
      // User cancelled
      return null
    }
  }

  // Fallback: use file input
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.dsl,.txt'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const content = await file.text()
      addRecentFile(file.name)
      resolve({ content, name: file.name })
    }
    input.click()
  })
}

/** Save content to the current file handle or prompt for new file */
export async function saveDSLFile(content: string, suggestedName?: string): Promise<boolean> {
  if (hasFileSystemAccess()) {
    try {
      if (!currentFileHandle) {
        currentFileHandle = await window.showSaveFilePicker({
          suggestedName: suggestedName ?? 'workspace.dsl',
          types: [
            {
              description: 'Structurizr DSL',
              accept: { 'text/plain': ['.dsl'] },
            },
          ],
        })
      }
      const writable = await currentFileHandle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch {
      return false
    }
  }

  // Fallback: trigger download
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName ?? 'workspace.dsl'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

/** Max crash recovery size: 4MB (localStorage typically caps at 5-10MB) */
const MAX_CRASH_RECOVERY_BYTES = 4 * 1024 * 1024

/** Save workspace JSON to localStorage for crash recovery */
export function saveToLocalStorage(workspace: Workspace) {
  try {
    const json = JSON.stringify(workspace)
    if (json.length > MAX_CRASH_RECOVERY_BYTES) {
      console.warn(`Workspace too large for crash recovery (${(json.length / 1024 / 1024).toFixed(1)}MB). Skipping localStorage save.`)
      return
    }
    localStorage.setItem('c4hero_crash_recovery', json)
    localStorage.setItem('c4hero_crash_recovery_time', new Date().toISOString())
  } catch {
    // localStorage full or unavailable
  }
}

/** Basic shape check to validate parsed JSON looks like a Workspace */
function isWorkspaceShape(obj: unknown): obj is Workspace {
  if (!obj || typeof obj !== 'object') return false
  const w = obj as Record<string, unknown>
  if (!w.model || typeof w.model !== 'object') return false
  if (!w.views || typeof w.views !== 'object') return false
  const m = w.model as Record<string, unknown>
  if (!Array.isArray(m.people) || !Array.isArray(m.softwareSystems)) return false
  return true
}

/** Load workspace from localStorage crash recovery */
export function loadFromLocalStorage(): Workspace | null {
  try {
    const data = localStorage.getItem('c4hero_crash_recovery')
    if (!data) return null
    const parsed = JSON.parse(data)
    if (!isWorkspaceShape(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Clear crash recovery data */
export function clearLocalStorage() {
  localStorage.removeItem('c4hero_crash_recovery')
  localStorage.removeItem('c4hero_crash_recovery_time')
}

// ─── File System Access API type declarations ─────────────────────

declare global {
  interface Window {
    showOpenFilePicker: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }

  interface OpenFilePickerOptions {
    types?: FilePickerAcceptType[]
    multiple?: boolean
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  // Chrome-only extension: getParent() on FileSystemFileHandle
  interface FileSystemFileHandle {
    getParent?(): Promise<FileSystemDirectoryHandle>
  }
}
