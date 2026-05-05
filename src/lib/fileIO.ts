import type { Workspace } from '@/types/model'
import { downloadBlob } from '@/lib/exportUtils'
import { createLogger } from '@/lib/logger'
import { isFiniteNumber, isNonEmptyString, isRecord, isStringArray, isStringRecord } from '@/lib/guards'
import { sidecarName } from '@/lib/sidecar'
import { safeSuggestedDslName } from '@/lib/filenames'
import { readJSON, writeJSON, writeString, removeKey } from '@/lib/safeStorage'

const log = createLogger('fileIO')

/** Max file size for user-imported workspace files: 10MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

export function assertFileSize(file: File, label = 'File'): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${label} too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
  }
}

export async function readTextFileWithLimit(file: File, label = 'File'): Promise<string> {
  assertFileSize(file, label)
  return file.text()
}

/** File handle for re-saving to the same file */
let currentFileHandle: FileSystemFileHandle | null = null
/** File handle for the sidecar .c4hero.json */
let currentSidecarHandle: FileSystemFileHandle | null = null

// ─── Recent Files ────────────────────────────────────────────────────

const RECENT_FILES_KEY = 'c4hero_recent_files'
const RECENT_FOLDERS_KEY = 'c4hero_recent_folders'
const MAX_RECENT = 10

export interface RecentFile {
  name: string
  openedAt: string
}

export interface RecentFolder {
  name: string        // slug (folder name on disk)
  path: string        // same as name for now
  displayName?: string // friendly name from .c4hero/settings.json
  openedAt: string
}

function normalizeRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): RecentFile[] => {
    if (!isRecord(item) || !isNonEmptyString(item.name) || typeof item.openedAt !== 'string') return []
    return [{ name: item.name, openedAt: item.openedAt }]
  })
}

function normalizeRecentFolders(value: unknown): RecentFolder[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): RecentFolder[] => {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isNonEmptyString(item.path) || typeof item.openedAt !== 'string') return []
    return [{
      name: item.name,
      path: item.path,
      displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
      openedAt: item.openedAt,
    }]
  })
}

export function getRecentFiles(): RecentFile[] {
  const raw = readJSON<unknown>(RECENT_FILES_KEY, (v): v is unknown => v !== undefined && v !== null)
  return raw === null ? [] : normalizeRecentFiles(raw)
}

export function addRecentFile(name: string) {
  const trimmedName = name.trim()
  if (!trimmedName) return
  const recent = getRecentFiles().filter(f => f.name !== trimmedName)
  recent.unshift({ name: trimmedName, openedAt: new Date().toISOString() })
  writeJSON(RECENT_FILES_KEY, recent.slice(0, MAX_RECENT))
}

export function getRecentFolders(): RecentFolder[] {
  const raw = readJSON<unknown>(RECENT_FOLDERS_KEY, (v): v is unknown => v !== undefined && v !== null)
  return raw === null ? [] : normalizeRecentFolders(raw)
}

export function removeRecentFolder(name: string): void {
  writeJSON(RECENT_FOLDERS_KEY, getRecentFolders().filter(f => f.name !== name))
}

export function pruneRecentFolders(validNames: string[]): void {
  const validSet = new Set(validNames)
  writeJSON(RECENT_FOLDERS_KEY, getRecentFolders().filter(f => validSet.has(f.name)))
}

export function addRecentFolder({ name, path, displayName }: { name: string; path: string; displayName?: string }) {
  const trimmedName = name.trim()
  const trimmedPath = path.trim()
  if (!trimmedName || !trimmedPath) return
  const recent = getRecentFolders().filter(f => f.path !== trimmedPath)
  recent.unshift({ name: trimmedName, path: trimmedPath, displayName: displayName?.trim() || undefined, openedAt: new Date().toISOString() })
  writeJSON(RECENT_FOLDERS_KEY, recent.slice(0, MAX_RECENT))
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
  } catch (err) {
    log.error('Failed to write to current file handle', err)
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
        const sidecarFileName = sidecarName(dslFile.name)
        currentSidecarHandle = await dirHandle.getFileHandle(sidecarFileName, { create: true })
        const writable = await currentSidecarHandle.createWritable()
        await writable.write(json)
        await writable.close()
        return true
      }
    }
    return false
  } catch (err) {
    log.error('Failed to write sidecar file', err)
    return false
  }
}

/** Check if File System Access API is available */
export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

/** Check if the directory picker (showDirectoryPicker) is available */
export function hasDirectoryAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Open a .dsl file using File System Access API or fallback.
 *  Also attempts to load a .c4hero.json sidecar from the same directory. */
export async function openDSLFile(): Promise<{ content: string; name: string; sidecarJson?: string } | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Structurizr DSL or text',
            accept: { 'text/plain': ['.dsl', '.txt'] },
          },
        ],
        excludeAcceptAllOption: false,
      })
      currentFileHandle = handle
      const file = await handle.getFile()
      const content = await readTextFileWithLimit(file, 'DSL file')
      addRecentFile(file.name)

      // Try to load sidecar from same directory
      let sidecarJson: string | undefined
      try {
        const dirHandle = await handle.getParent?.()
        if (dirHandle) {
          const sidecarFileName = sidecarName(file.name)
          const sidecarFileHandle = await dirHandle.getFileHandle(sidecarFileName)
          currentSidecarHandle = sidecarFileHandle
          const sidecarFile = await sidecarFileHandle.getFile()
          sidecarJson = await readTextFileWithLimit(sidecarFile, 'Workspace sidecar file')
        }
      } catch {
        // No sidecar file found — expected for new workspaces
        currentSidecarHandle = null
      }

      return { content, name: file.name, sidecarJson }
    } catch {
      // User cancelled the file picker — not an error
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
      try {
        const content = await readTextFileWithLimit(file, 'DSL file')
        addRecentFile(file.name)
        resolve({ content, name: file.name })
      } catch (err) {
        log.warn('Failed to open DSL file', err)
        resolve(null)
      }
    }
    input.click()
  })
}

/** Save content to the current file handle or prompt for new file */
export async function saveDSLFile(content: string, suggestedName?: string): Promise<boolean> {
  const safeSuggestedName = safeSuggestedDslName(suggestedName)
  if (hasFileSystemAccess()) {
    try {
      if (!currentFileHandle) {
        currentFileHandle = await window.showSaveFilePicker({
          suggestedName: safeSuggestedName,
          types: [
            {
              description: 'Structurizr DSL (.dsl)',
              accept: { 'text/plain': ['.dsl'], 'application/octet-stream': ['.dsl'] },
            },
          ],
          excludeAcceptAllOption: false,
        })
      }
      const writable = await currentFileHandle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch {
      // User cancelled save picker — not an error
      return false
    }
  }

  // Fallback: trigger download
  downloadBlob(new Blob([content], { type: 'text/plain' }), safeSuggestedName)
  return true
}

/** Max crash recovery size: 4MB (localStorage typically caps at 5-10MB) */
const MAX_CRASH_RECOVERY_BYTES = 4 * 1024 * 1024

/** Save workspace JSON to localStorage for crash recovery */
export function saveToLocalStorage(workspace: Workspace) {
  let json: string
  try {
    json = JSON.stringify(workspace)
  } catch (err) {
    log.warn('Failed to serialize workspace for crash recovery', err)
    return
  }
  const sizeBytes = new TextEncoder().encode(json).length
  if (sizeBytes > MAX_CRASH_RECOVERY_BYTES) {
    log.warn(`Workspace too large for crash recovery (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Skipping localStorage save.`)
    return
  }
  writeString('c4hero_crash_recovery', json)
  writeString('c4hero_crash_recovery_time', new Date().toISOString())
}

function isBaseElementShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false
  if (!isStringArray(value.tags)) return false
  if (!isStringRecord(value.properties)) return false
  if ('description' in value && value.description !== undefined && typeof value.description !== 'string') return false
  if ('url' in value && value.url !== undefined && typeof value.url !== 'string') return false
  if ('status' in value && value.status !== undefined && !['Live', 'Planned', 'Deprecated', 'Removed'].includes(String(value.status))) return false
  if ('owner' in value && value.owner !== undefined && typeof value.owner !== 'string') return false
  return true
}

function isComponentShape(value: unknown): boolean {
  if (!isBaseElementShape(value)) return false
  if (value.type !== 'component') return false
  return !('technology' in value) || value.technology === undefined || typeof value.technology === 'string'
}

function isContainerShape(value: unknown): boolean {
  if (!isBaseElementShape(value)) return false
  if (value.type !== 'container') return false
  if (!Array.isArray(value.components) || !value.components.every(isComponentShape)) return false
  return !('technology' in value) || value.technology === undefined || typeof value.technology === 'string'
}

function isPersonShape(value: unknown): boolean {
  if (!isBaseElementShape(value)) return false
  if (value.type !== 'person') return false
  return !('location' in value) || value.location === undefined || ['Internal', 'External', 'Unspecified'].includes(String(value.location))
}

function isSoftwareSystemShape(value: unknown): boolean {
  if (!isBaseElementShape(value)) return false
  if (value.type !== 'softwareSystem') return false
  if (!Array.isArray(value.containers) || !value.containers.every(isContainerShape)) return false
  return !('location' in value) || value.location === undefined || ['Internal', 'External', 'Unspecified'].includes(String(value.location))
}

function isRelationshipShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.sourceId !== 'string' || typeof value.destinationId !== 'string') return false
  if (!isStringArray(value.tags) || !isStringRecord(value.properties)) return false
  if ('description' in value && value.description !== undefined && typeof value.description !== 'string') return false
  if ('technology' in value && value.technology !== undefined && typeof value.technology !== 'string') return false
  if ('url' in value && value.url !== undefined && typeof value.url !== 'string') return false
  if ('interactionStyle' in value && value.interactionStyle !== undefined && !['Synchronous', 'Asynchronous'].includes(String(value.interactionStyle))) return false
  if ('lineStyle' in value && value.lineStyle !== undefined && !['Curved', 'Straight', 'Orthogonal'].includes(String(value.lineStyle))) return false
  return true
}

function isViewElementShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false
  if ('x' in value && value.x !== undefined && !isFiniteNumber(value.x)) return false
  if ('y' in value && value.y !== undefined && !isFiniteNumber(value.y)) return false
  if ('pinned' in value && value.pinned !== undefined && typeof value.pinned !== 'boolean') return false
  return true
}

function isViewRelationshipShape(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string'
}

function isViewShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!['systemLandscape', 'systemContext', 'container', 'component'].includes(String(value.type))) return false
  if (typeof value.key !== 'string') return false
  if (!Array.isArray(value.elements) || !value.elements.every(isViewElementShape)) return false
  if (!Array.isArray(value.relationships) || !value.relationships.every(isViewRelationshipShape)) return false
  if ('title' in value && value.title !== undefined && typeof value.title !== 'string') return false
  if ('description' in value && value.description !== undefined && typeof value.description !== 'string') return false
  if ('softwareSystemId' in value && value.softwareSystemId !== undefined && typeof value.softwareSystemId !== 'string') return false
  if ('containerId' in value && value.containerId !== undefined && typeof value.containerId !== 'string') return false
  if ('autoLayout' in value && value.autoLayout !== undefined) {
    if (!isRecord(value.autoLayout)) return false
    if (!['TB', 'BT', 'LR', 'RL'].includes(String(value.autoLayout.direction))) return false
    if ('rankSeparation' in value.autoLayout && value.autoLayout.rankSeparation !== undefined && !isFiniteNumber(value.autoLayout.rankSeparation)) return false
    if ('nodeSeparation' in value.autoLayout && value.autoLayout.nodeSeparation !== undefined && !isFiniteNumber(value.autoLayout.nodeSeparation)) return false
  }
  return true
}

function isElementStyleShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value.tag !== 'string') return false
  return Object.entries(value).every(([key, item]) => {
    if (key === 'tag' || key === 'background' || key === 'color' || key === 'shape' || key === 'border' || key === 'icon' || key === 'stroke') {
      return typeof item === 'string'
    }
    if (key === 'fontSize' || key === 'opacity' || key === 'strokeWidth') return isFiniteNumber(item)
    return true
  })
}

function isRelationshipStyleShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value.tag !== 'string') return false
  return Object.entries(value).every(([key, item]) => {
    if (key === 'tag' || key === 'color') return typeof item === 'string'
    if (key === 'thickness' || key === 'fontSize' || key === 'opacity') return isFiniteNumber(item)
    if (key === 'dashed') return typeof item === 'boolean'
    return true
  })
}

/** Runtime schema check for imported workspace JSON. */
export function isWorkspaceShape(obj: unknown): obj is Workspace {
  if (!isRecord(obj)) return false
  if ('name' in obj && obj.name !== undefined && typeof obj.name !== 'string') return false
  if ('description' in obj && obj.description !== undefined && typeof obj.description !== 'string') return false
  if ('scope' in obj && obj.scope !== undefined && !['softwaresystem', 'landscape', 'none'].includes(String(obj.scope))) return false

  const { model, views } = obj
  if (!isRecord(model) || !isRecord(views)) return false
  if (!Array.isArray(model.people) || !model.people.every(isPersonShape)) return false
  if (!Array.isArray(model.softwareSystems) || !model.softwareSystems.every(isSoftwareSystemShape)) return false
  if (!Array.isArray(model.relationships) || !model.relationships.every(isRelationshipShape)) return false
  if (!Array.isArray(model.groups) || !model.groups.every(group =>
    isRecord(group) && typeof group.id === 'string' && typeof group.name === 'string' && isStringArray(group.elementIds)
  )) return false

  if (!Array.isArray(views.systemLandscapeViews) || !views.systemLandscapeViews.every(isViewShape)) return false
  if (!Array.isArray(views.systemContextViews) || !views.systemContextViews.every(isViewShape)) return false
  if (!Array.isArray(views.containerViews) || !views.containerViews.every(isViewShape)) return false
  if (!Array.isArray(views.componentViews) || !views.componentViews.every(isViewShape)) return false
  if (!isRecord(views.configuration) || !isRecord(views.configuration.styles)) return false
  const styles = views.configuration.styles
  if (!Array.isArray(styles.elements) || !styles.elements.every(isElementStyleShape)) return false
  if (!Array.isArray(styles.relationships) || !styles.relationships.every(isRelationshipStyleShape)) return false
  if ('themes' in views.configuration && views.configuration.themes !== undefined && !isStringArray(views.configuration.themes)) return false

  return true
}

/** Load workspace from localStorage crash recovery */
export function loadFromLocalStorage(): Workspace | null {
  return readJSON<Workspace>('c4hero_crash_recovery', isWorkspaceShape)
}

/** Clear crash recovery data */
export function clearLocalStorage() {
  removeKey('c4hero_crash_recovery')
  removeKey('c4hero_crash_recovery_time')
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
    excludeAcceptAllOption?: boolean
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  // Chrome-only extension: getParent() on FileSystemFileHandle
  interface FileSystemFileHandle {
    getParent?(): Promise<FileSystemDirectoryHandle>
  }

  interface Window {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
    queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  }
}
