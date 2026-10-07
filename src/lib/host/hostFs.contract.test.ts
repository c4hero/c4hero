import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFs } from './types'
import { createVsCodeHostFs } from './vscodeHost'
import { webFsaHost } from './webFsa'

const memory = new Map<string, string>()
let failWrites = false
function hostContract(name: string, setup: () => Promise<{ host: HostFs; fileUri: string; folderUri: string }>) {
  describe(`${name} HostFs contract`, () => {
    it('reads, writes and lists through host-neutral URIs', async () => {
      const { host, fileUri, folderUri } = await setup()
      expect(await host.read(fileUri)).toBe('before')
      await host.write(fileUri, 'after')
      expect(await host.read(fileUri)).toBe('after')
      expect(await host.list(folderUri)).toEqual(['model.dsl'])
    })
    it('resolves nested folder files and preserves spaces in names', async () => {
      const { host } = await setup()
      const folder = await host.openFolder()
      expect(folder).not.toBeNull()
      await folder!.write('parts/a b.dsl', 'fragment')
      expect(await folder!.read('parts/a b.dsl')).toBe('fragment')
      expect(await folder!.read('missing.dsl')).toBeNull()
    })
    it('surfaces write failures without reporting success', async () => {
      const { host, fileUri } = await setup()
      failWrites = true
      await expect(host.write(fileUri, 'lost')).rejects.toThrow('Permission denied')
      expect(await host.read(fileUri)).toBe('before')
    })
  })
}

hostContract('VS Code', async () => {
  const folderUri = 'vscode-remote://ssh-remote+test/project'
  const fileUri = `${folderUri}/model.dsl`
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', payload: { folderUri, uri: fileUri, name: 'model.dsl' } } }))
  return {
    host: createVsCodeHostFs(async operation => {
      const relative = decodeURIComponent(new URL(operation.uri).pathname.slice('/project/'.length))
      if (operation.kind === 'read') return memory.get(relative) ?? null
      if (operation.kind === 'write') {
        if (failWrites) throw new Error('Permission denied')
        memory.set(relative, operation.content); return true
      }
      return [...memory.keys()].filter(path => !path.includes('/')).sort()
    }), fileUri, folderUri,
  }
})

function fileHandle(path: string): FileSystemFileHandle {
  return {
    kind: 'file', name: path.split('/').at(-1)!,
    getFile: async () => new File([memory.get(path) ?? ''], path),
    createWritable: async () => ({
      write: async (content: string) => { if (failWrites) throw new Error('Permission denied'); memory.set(path, content) },
      close: async () => {}, abort: async () => {},
    }),
  } as unknown as FileSystemFileHandle
}
function directory(prefix = ''): FileSystemDirectoryHandle {
  return {
    kind: 'directory', name: prefix || 'project',
    async *entries() {
      for (const path of memory.keys()) if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) yield [path.slice(prefix.length), fileHandle(path)]
    },
    getDirectoryHandle: async (path: string) => directory(`${prefix}${path}/`),
    getFileHandle: async (path: string, options?: { create: boolean }) => {
      if (!memory.has(`${prefix}${path}`) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
      return fileHandle(`${prefix}${path}`)
    },
  } as unknown as FileSystemDirectoryHandle
}
hostContract('browser FSA', async () => {
  const file = await webFsaHost.openFile()
  const folder = await webFsaHost.openFolder()
  if (!file || !folder) throw new Error('Mock pickers did not return handles')
  return { host: webFsaHost, fileUri: file.uri, folderUri: folder.uri }
})
beforeEach(() => {
  memory.clear(); memory.set('model.dsl', 'before'); failWrites = false
  vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [fileHandle('model.dsl')]))
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => directory()))
})
