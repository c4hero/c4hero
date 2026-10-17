import type { Workspace } from '@/types/model'
import { downloadBlob } from '@/lib/exportUtils'
import { zipBlob } from '@/lib/zip'
import { notifyHandleChanges } from '@/lib/handleChanges'
import { createLogger } from '@/lib/logger'
import { isFiniteNumber, isNonEmptyString, isRecord, isStringArray, isStringRecord } from '@/lib/guards'
import { sidecarName } from '@/lib/sidecar'
import { safeSuggestedDslName } from '@/lib/filenames'
import { isElementStatusValue, normalizeElementStatus } from '@/lib/elementStatus'
import { forEachElementHelper } from '@/store/workspace-helpers'
import { readJSON, writeJSON, writeString, removeKey } from '@/lib/safeStorage'
import {
  captureSelfWrite,
  beginSelfWrite,
  recordSelfDslWrite,
  recordSelfSidecarWrite,
  withSelfWriteDestination,
  type SelfWriteToken,
} from '@/lib/saveCoordinator'
import type { WatchedSnapshot } from '@/lib/fileWatch'

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

/** Capture alongside the DSL handle before starting an asynchronous save. */
export function getCurrentSidecarHandle(): FileSystemFileHandle | null {
  return currentSidecarHandle
}

/** Read the open single file (and its sidecar, when one is linked) for the
 *  disk watcher. Resolves `null` when the file no longer exists; rethrows
 *  anything else so a transient failure isn't mistaken for a deletion. */
export async function readCurrentFile(
  fileHandle = currentFileHandle,
  sidecarHandle = currentSidecarHandle,
): Promise<WatchedSnapshot | null> {
  if (!fileHandle) return null
  let content: string
  try {
    const file = await fileHandle.getFile()
    content = await readTextFileWithLimit(file, 'DSL file')
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    throw err
  }
  let sidecarJson: string | undefined
  if (sidecarHandle) {
    try {
      const sidecarFile = await sidecarHandle.getFile()
      sidecarJson = await readTextFileWithLimit(sidecarFile, 'Sidecar file')
    } catch {
      // Sidecar gone or unreadable: treat as "no sidecar" rather than "file gone".
    }
  }
  return { content, sidecarJson }
}

/**
 * True when the file already holds exactly the UTF-8 bytes of this text.
 *
 * Writing bytes that are already on disk is never necessary and is not free.
 * It bumps mtime, wakes every watcher on the folder, and — because the whole
 * workspace is serialised on any change to it — turns "open a diagram" into an
 * edit of the file that diagram came from. Comparing first costs one read.
 *
 * Bytes, not decoded text: decoding maps malformed UTF-8 to U+FFFD, so a
 * decoded comparison can call two different files equal.
 *
 * Size-capped like every other read in this module: a file past the limit
 * throws rather than being pulled into memory, and the throw lands in the
 * catch below.
 *
 * Any failure reading falls through to writing. Never skip a write because a
 * check went wrong — a redundant write costs an mtime, a wrongly skipped one
 * costs the edit.
 */
export async function fileAlreadyHas(handle: FileSystemFileHandle, content: string): Promise<boolean> {
  try {
    const existing = await handle.getFile()
    // Cheap reject before reading: a different byte length cannot be the same
    // bytes. Most real comparisons end here. `content.length` counts UTF-16
    // code units, not bytes, so it would never match any non-ASCII workspace;
    // saveRoundTrip.test.ts guards this.
    const expected = new TextEncoder().encode(content)
    if (existing.size !== expected.byteLength) return false
    assertFileSize(existing, 'Existing file')
    const actual = new Uint8Array(await existing.arrayBuffer())
    for (let i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) return false
    return true
  } catch {
    return false
  }
}

/** Every handle lookup and check-then-write runs through this one queue.
 *  A File System Access write only lands on close(), so a comparison that overlapped an earlier,
 *  still-open write would read the bytes that write is about to replace —
 *  and could skip a save that was needed (autosave overlapping Ctrl+S, or an
 *  included fragment write overlapping a direct save). */
let writeQueue: Promise<unknown> = Promise.resolve()

export type FileWriter = (
  destination: FileSystemFileHandle | (() => Promise<FileSystemFileHandle | null>),
  content: string,
  onConfirmed?: () => void,
  whileWriting?: () => (() => void),
) => Promise<boolean>

const writeConfirmedFile: FileWriter = async (destination, content, onConfirmed, whileWriting) => {
  const handle = typeof destination === 'function' ? await destination() : destination
  if (!handle) return false
  if (await fileAlreadyHas(handle, content)) {
    onConfirmed?.()
    return true
  }
  const finish = whileWriting?.()
  try {
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    onConfirmed?.()
    return true
  } finally {
    finish?.()
  }
}

/** Enqueue one file or a complete workspace save at invocation time. A batch
 *  must await the provided writer rather than enqueue another task behind
 *  itself. Sharing this queue also orders bundles with direct file saves. */
export function enqueueFileWrites<T>(operation: (write: FileWriter) => Promise<T>): Promise<T> {
  const run = writeQueue.then(() => operation(writeConfirmedFile))
  writeQueue = run.catch(() => {})
  return run
}

/** Enqueue before resolving a destination, so an earlier slow lookup cannot
 *  make an older save overwrite a newer request. Returns false only when the
 *  destination resolver finds no file. `onConfirmed` runs after an unchanged
 *  file was verified or a changed file was successfully closed. */
export const writeFileIfChanged: FileWriter = (destination, content, onConfirmed, whileWriting) => (
  enqueueFileWrites((write) => write(destination, content, onConfirmed, whileWriting))
)

/** Write DSL content to the current file handle (for auto-save) */
export async function writeToCurrentHandle(
  content: string,
  fileHandle = currentFileHandle,
  token: SelfWriteToken = captureSelfWrite(),
  write: FileWriter = writeFileIfChanged,
): Promise<boolean> {
  if (!fileHandle || !hasFileSystemAccess()) return false
  const destination = { kind: 'file' as const, handle: fileHandle }
  const selfWrite = withSelfWriteDestination(token, destination)
  try {
    return await write(fileHandle, content, () => recordSelfDslWrite(content, selfWrite), () => beginSelfWrite(selfWrite))
  } catch (err) {
    log.error('Failed to write to current file handle', err)
    return false
  }
}

/** Write sidecar JSON to the .c4hero.json file alongside the DSL */
export async function writeSidecarToHandle(
  json: string,
  fileHandle = currentFileHandle,
  sidecarHandle = currentSidecarHandle,
  token: SelfWriteToken = captureSelfWrite(),
  write: FileWriter = writeFileIfChanged,
): Promise<boolean> {
  if (!hasFileSystemAccess()) return false
  const destination = fileHandle ? { kind: 'file' as const, handle: fileHandle } : undefined
  const selfWrite = destination ? withSelfWriteDestination(token, destination) : token
  try {
    return await write(async () => {
      if (sidecarHandle) return sidecarHandle
      if (fileHandle) {
        const dirHandle = await fileHandle.getParent?.()
        if (!dirHandle) return null
        const dslFile = await fileHandle.getFile()
        const sidecarFileName = sidecarName(dslFile.name)
        const resolved = await dirHandle.getFileHandle(sidecarFileName, { create: true })
        // A delayed save of an old file must not replace the new file's cache.
        if (currentFileHandle === fileHandle) currentSidecarHandle = resolved
        return resolved
      }
      return null
    }, json, () => recordSelfSidecarWrite(json, selfWrite), () => beginSelfWrite(selfWrite))
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
      const file = await handle.getFile()
      const content = await readTextFileWithLimit(file, 'DSL file')
      addRecentFile(file.name)

      // Try to load sidecar from same directory
      let sidecarJson: string | undefined
      let linkedSidecar: FileSystemFileHandle | null = null
      try {
        const dirHandle = await handle.getParent?.()
        if (dirHandle) {
          const sidecarFileName = sidecarName(file.name)
          const sidecarFileHandle = await dirHandle.getFileHandle(sidecarFileName)
          const sidecarFile = await sidecarFileHandle.getFile()
          sidecarJson = await readTextFileWithLimit(sidecarFile, 'Workspace sidecar file')
          linkedSidecar = sidecarFileHandle
        }
      } catch {
        // No sidecar file found — expected for new workspaces
        linkedSidecar = null
      }

      // A rejected file must leave the existing workspace's save targets
      // intact. Install the pair only once the new DSL was read successfully.
      const changed = currentFileHandle !== handle
      currentFileHandle = handle
      currentSidecarHandle = linkedSidecar
      if (changed) notifyHandleChanges()
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

/** A missing sidecar destination is harmless only when it has no data. */
export function isEmptySidecarJson(json: string): boolean {
  try {
    const data: unknown = JSON.parse(json)
    if (!isRecord(data) || data.version !== 1) return false
    return Object.entries(data).every(([key, value]) => key === 'version'
      || (['views', 'elements', 'relationships'].includes(key) && isRecord(value) && Object.keys(value).length === 0))
  } catch {
    return false
  }
}

/** Save DSL and optional layout together to the captured file or a new file. */
export async function saveDSLFile(content: string, suggestedName?: string, sidecarJson?: string): Promise<boolean> {
  const safeSuggestedName = safeSuggestedDslName(suggestedName)
  if (hasFileSystemAccess()) {
    const fileHandle = currentFileHandle
    const sidecarHandle = fileHandle ? currentSidecarHandle : null
    const selfWrite = captureSelfWrite()
    let installedHandle: FileSystemFileHandle | null = null
    try {
      // Open the chooser during the caller's user activation. Waiting behind
      // an earlier disk write first could let that activation expire.
      const destination = fileHandle ? Promise.resolve(fileHandle) : window.showSaveFilePicker({
          suggestedName: safeSuggestedName,
          types: [
            {
              description: 'Structurizr DSL (.dsl)',
              accept: { 'text/plain': ['.dsl'], 'application/octet-stream': ['.dsl'] },
            },
          ],
          excludeAcceptAllOption: false,
      })
      // A cancelled picker can reject while an earlier save still owns the
      // queue. Observe it immediately; the queued await still reports failure.
      void destination.catch(() => {})
      return await enqueueFileWrites(async (write) => {
        const selected = await destination
        if (!currentFileHandle) {
          currentFileHandle = selected
          installedHandle = selected
        }
        const selectedToken = withSelfWriteDestination(selfWrite, { kind: 'file', handle: selected })
        if (!await write(selected, content, () => recordSelfDslWrite(content, selectedToken), () => beginSelfWrite(selectedToken))) return false
        if (sidecarJson === undefined) return true
        const selectedSidecar = selected === fileHandle ? sidecarHandle : null
        if (!selectedSidecar && typeof selected.getParent !== 'function') return isEmptySidecarJson(sidecarJson)
        return writeSidecarToHandle(sidecarJson, selected, selectedSidecar, selectedToken, write)
      })
    } catch {
      // User cancelled save picker — not an error
      return false
    } finally {
      // Start a newly linked watcher from the completed on-disk save, rather
      // than reset its coordinator while this first write is still active.
      if (installedHandle && currentFileHandle === installedHandle) notifyHandleChanges()
    }
  }

  // A second automatic download can be blocked independently of the DSL.
  // Keep meaningful layout in the same download so success covers both files.
  try {
    if (sidecarJson !== undefined && !isEmptySidecarJson(sidecarJson)) {
      downloadBlob(zipBlob([
        { path: safeSuggestedName, content },
        { path: sidecarName(safeSuggestedName), content: sidecarJson },
      ]), safeSuggestedName.replace(/\.dsl$/i, '.zip'))
    } else {
      downloadBlob(new Blob([content], { type: 'text/plain' }), safeSuggestedName)
    }
    return true
  } catch (error) {
    log.error('Failed to download workspace', error)
    return false
  }
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
  if ('status' in value && value.status !== undefined && !isElementStatusValue(value.status)) return false
  if ('owner' in value && value.owner !== undefined && typeof value.owner !== 'string') return false
  return isPropertyLayoutShape(value)
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
  return isPropertyLayoutShape(value)
}

function isViewElementShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false
  if ('x' in value && value.x !== undefined && !isFiniteNumber(value.x)) return false
  if ('y' in value && value.y !== undefined && !isFiniteNumber(value.y)) return false
  if ('pinned' in value && value.pinned !== undefined && typeof value.pinned !== 'boolean') return false
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
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

function isPropertyDeclarationsShape(decls: unknown): boolean {
  return Array.isArray(decls) && decls.every(d =>
    isRecord(d) && typeof d.key === 'string' && typeof d.value === 'string'
    && Number.isInteger(d.slot) && Number(d.slot) >= 0
    && (d.sourcePath === undefined || typeof d.sourcePath === 'string')
    && (d.sourceLine === undefined || (Number.isInteger(d.sourceLine) && Number(d.sourceLine) > 0))
    && (d.sourceColumn === undefined || (Number.isInteger(d.sourceColumn) && Number(d.sourceColumn) > 0))
  )
}

/** Workspace- or model-level `properties` plus their line provenance. */
function isScopedPropertiesShape(holder: Record<string, unknown>): boolean {
  if (holder.properties !== undefined && !isStringRecord(holder.properties)) return false
  return holder.propertyDeclarations === undefined || isPropertyDeclarationsShape(holder.propertyDeclarations)
}

/** An element's or relationship's optional PropertyLayout. */
function isPropertyLayoutShape(value: Record<string, unknown>): boolean {
  const layout = value.propertyLayout
  if (layout === undefined) return true
  return isRecord(layout) && isPropertyDeclarationsShape(layout.declarations)
    && Array.isArray(layout.directives) && layout.directives.every(d =>
      isRecord(d) && typeof d.raw === 'string' && (d.sourcePath === undefined || typeof d.sourcePath === 'string'))
}

/** Runtime schema check for imported workspace JSON. */
export function isWorkspaceShape(obj: unknown): obj is Workspace {
  if (!isRecord(obj)) return false
  if ('name' in obj && obj.name !== undefined && typeof obj.name !== 'string') return false
  if ('description' in obj && obj.description !== undefined && typeof obj.description !== 'string') return false
  if (!isScopedPropertiesShape(obj)) return false
  if ('scope' in obj && obj.scope !== undefined && !['softwaresystem', 'landscape', 'none'].includes(String(obj.scope))) return false

  if ('directives' in obj && obj.directives !== undefined && (!Array.isArray(obj.directives) || !obj.directives.every(d =>
    isRecord(d) && typeof d.raw === 'string' && ['workspace', 'workspaceProperties', 'model', 'modelProperties', 'views'].includes(String(d.scope))
  ))) return false

  if ('includedFiles' in obj && obj.includedFiles !== undefined && (!Array.isArray(obj.includedFiles) || !obj.includedFiles.every(f =>
    isRecord(f) && typeof f.path === 'string' && typeof f.writable === 'boolean' && (f.text === undefined || typeof f.text === 'string')
  ))) return false

  const { model, views } = obj
  if (!isRecord(model) || !isRecord(views)) return false
  if (!isScopedPropertiesShape(model)) return false
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
  // Dynamic / deployment view arrays are validated only when present, so
  // sidecars written before these view types existed still load.
  if ('dynamicViews' in views && views.dynamicViews !== undefined && (!Array.isArray(views.dynamicViews) || !views.dynamicViews.every(isViewShape))) return false
  if ('deploymentViews' in views && views.deploymentViews !== undefined && (!Array.isArray(views.deploymentViews) || !views.deploymentViews.every(isViewShape))) return false
  if (!isRecord(views.configuration) || !isRecord(views.configuration.styles)) return false
  const styles = views.configuration.styles
  if (!Array.isArray(styles.elements) || !styles.elements.every(isElementStyleShape)) return false
  if (!Array.isArray(styles.relationships) || !styles.relationships.every(isRelationshipStyleShape)) return false
  if ('themes' in views.configuration && views.configuration.themes !== undefined && !isStringArray(views.configuration.themes)) return false

  return true
}

/** Load workspace from localStorage crash recovery */
export function loadFromLocalStorage(): Workspace | null {
  const workspace = readJSON<Workspace>('c4hero_crash_recovery', isWorkspaceShape)
  if (workspace) {
    forEachElementHelper(workspace, (element) => {
      if (element.status !== undefined) element.status = normalizeElementStatus(element.status)
    })
  }
  return workspace
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
