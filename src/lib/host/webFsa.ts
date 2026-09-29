import { readTextFileWithLimit } from './browserFileIO'
import { restoreDirHandle, setDirHandle } from './browserFolderIO'
import type { HostFile, HostFolder, HostFs } from './types'

const handles = new Map<string, FileSystemHandle>()
const uris = new WeakMap<FileSystemHandle, string>()
let sequence = 0
function remember(handle: FileSystemHandle): string {
  const previous = uris.get(handle)
  if (previous) return previous
  const uri = `browser-fsa://${++sequence}/${encodeURIComponent(handle.name)}`
  handles.set(uri, handle)
  uris.set(handle, uri)
  return uri
}
async function readFile(handle: FileSystemFileHandle): Promise<string> {
  return readTextFileWithLimit(await handle.getFile(), handle.name)
}
async function writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable()
  try { await writable.write(content); await writable.close() }
  catch (error) { await writable.abort().catch(() => {}); throw error }
}
function asHostFile(handle: FileSystemFileHandle): HostFile {
  return { uri: remember(handle), name: handle.name, read: () => readFile(handle), write: content => writeFile(handle, content) }
}
function relativeParts(path: string): string[] {
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('Expected a relative path within the selected folder')
  return parts
}
async function resolveFile(folder: FileSystemDirectoryHandle, path: string, create: boolean) {
  const parts = relativeParts(path)
  let dir = folder
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create })
  return dir.getFileHandle(parts.at(-1)!, { create })
}
function asHostFolder(handle: FileSystemDirectoryHandle): HostFolder {
  return {
    uri: remember(handle), name: handle.name,
    async list() {
      const names: string[] = []
      for await (const [name, entry] of handle.entries()) if (entry.kind === 'file') names.push(name)
      return names.sort()
    },
    async read(path) {
      try { return await readFile(await resolveFile(handle, path, false)) }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error }
    },
    async write(path, content) { await writeFile(await resolveFile(handle, path, true), content) },
  }
}
export const webFsaHost: HostFs = {
  kind: 'browser',
  async openFile() {
    if (!('showOpenFilePicker' in window)) return null
    try { const [handle] = await window.showOpenFilePicker(); return handle ? asHostFile(handle) : null }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error }
  },
  async openFolder() {
    if (!('showDirectoryPicker' in window)) return null
    try { return asHostFolder(await window.showDirectoryPicker({ mode: 'readwrite' })) }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error }
  },
  async read(uri) {
    const handle = handles.get(uri)
    return handle?.kind === 'file' ? readFile(handle as FileSystemFileHandle) : null
  },
  async write(uri, content) {
    const handle = handles.get(uri)
    if (!handle || handle.kind !== 'file') throw new Error(`Unknown file: ${uri}`)
    await writeFile(handle as FileSystemFileHandle, content)
  },
  async list(uri) {
    const handle = handles.get(uri)
    if (!handle || handle.kind !== 'directory') throw new Error(`Unknown folder: ${uri}`)
    return asHostFolder(handle as FileSystemDirectoryHandle).list()
  },
  watch(uri, listener) {
    let active = true
    let checking = false
    let previous: string | undefined
    const check = async () => {
      if (!active || checking) return
      checking = true
      try {
        const handle = handles.get(uri)
        const signature = handle?.kind === 'directory' ? JSON.stringify(await this.list(uri)) : await this.read(uri) ?? ''
        if (active && previous !== undefined && signature !== previous) listener()
        previous = signature
      } catch { /* Permission changes are reported by explicit reads. */ }
      finally { checking = false }
    }
    void check()
    const interval = window.setInterval(() => void check(), 1500)
    window.addEventListener('focus', check)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', check) }
  },
  async persist(uri) {
    const handle = handles.get(uri)
    if (!handle || handle.kind !== 'directory') throw new Error('Select a folder to persist filesystem permission')
    await setDirHandle(handle as FileSystemDirectoryHandle)
  },
  async restore() {
    const handle = await restoreDirHandle()
    return handle ? remember(handle) : null
  },
}
