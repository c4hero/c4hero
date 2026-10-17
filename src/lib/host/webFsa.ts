import type { HostFile, HostFolder, HostFs } from './types'

const handles = new Map<string, FileSystemHandle>()
let sequence = 0

function remember(handle: FileSystemHandle): string {
  const uri = `browser-fsa://${++sequence}/${encodeURIComponent(handle.name)}`
  handles.set(uri, handle)
  return uri
}

async function readFile(handle: FileSystemFileHandle): Promise<string> {
  return (await handle.getFile()).text()
}

async function writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

function asHostFile(handle: FileSystemFileHandle): HostFile {
  const uri = remember(handle)
  return { uri, name: handle.name, read: () => readFile(handle), write: (content) => writeFile(handle, content) }
}

function asHostFolder(handle: FileSystemDirectoryHandle): HostFolder {
  const uri = remember(handle)
  return {
    uri,
    name: handle.name,
    async list() {
      const names: string[] = []
      for await (const [name] of handle.entries()) names.push(name)
      return names.sort()
    },
    async read(relativePath) {
      try { return await readFile(await handle.getFileHandle(relativePath)) } catch { return null }
    },
    async write(relativePath, content) {
      await writeFile(await handle.getFileHandle(relativePath, { create: true }), content)
    },
  }
}

export const webFsaHost: HostFs = {
  kind: 'browser',
  async openFile() {
    if (!('showOpenFilePicker' in window)) return null
    const [handle] = await window.showOpenFilePicker()
    return handle ? asHostFile(handle) : null
  },
  async openFolder() {
    if (!('showDirectoryPicker' in window)) return null
    return asHostFolder(await window.showDirectoryPicker({ mode: 'readwrite' }))
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
    if (!handle || handle.kind !== 'directory') return []
    return asHostFolder(handle as FileSystemDirectoryHandle).list()
  },
  watch(_uri, listener) {
    const onFocus = () => listener()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  },
  async persist() {},
  async restore() { return null },
}
