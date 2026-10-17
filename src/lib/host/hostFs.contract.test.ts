import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFs } from './types'
import type { HostFsOperation } from './protocol'
import { createVsCodeHostFs } from './vscodeHost'
import { webFsaHost } from './webFsa'

function hostContract(name: string, setup: () => Promise<{ host: HostFs; fileUri: string; folderUri: string }>) {
  describe(`${name} HostFs contract`, () => {
    it('reads, writes and lists through host-neutral URIs', async () => {
      const { host, fileUri, folderUri } = await setup()
      expect(await host.read(fileUri)).toBe('before')
      await host.write(fileUri, 'after')
      expect(await host.read(fileUri)).toBe('after')
      expect(await host.list(folderUri)).toContain('model.dsl')
    })
  })
}

const memory = new Map<string, string>([['vscode://workspace/model.dsl', 'before']])

hostContract('VS Code', async () => ({
  host: createVsCodeHostFs(async (operation: HostFsOperation) => {
    if (operation.kind === 'read') return memory.get(operation.uri) ?? null
    if (operation.kind === 'write') { memory.set(operation.uri, operation.content); return true }
    return [...memory.keys()].filter((uri) => uri.startsWith(`${operation.uri}/`)).map((uri) => uri.split('/').at(-1)!)
  }),
  fileUri: 'vscode://workspace/model.dsl',
  folderUri: 'vscode://workspace',
}))

let fileText = 'before'
const fileHandle = {
  kind: 'file', name: 'model.dsl',
  getFile: async () => ({ text: async () => fileText }),
  createWritable: async () => ({ write: async (content: string) => { fileText = content }, close: async () => {} }),
} as unknown as FileSystemFileHandle
const folderHandle = {
  kind: 'directory', name: 'workspace',
  async *entries() { yield ['model.dsl', fileHandle] as [string, FileSystemFileHandle] },
} as unknown as FileSystemDirectoryHandle

hostContract('browser FSA', async () => {
  const file = await webFsaHost.openFile()
  const folder = await webFsaHost.openFolder()
  if (!file || !folder) throw new Error('Mock pickers did not return handles')
  return { host: webFsaHost, fileUri: file.uri, folderUri: folder.uri }
})

beforeEach(() => {
  memory.set('vscode://workspace/model.dsl', 'before')
  fileText = 'before'
  vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [fileHandle]))
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => folderHandle))
})
