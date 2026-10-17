import type { HostFs } from './types'
import type {
  HostFsOperation, HostToWebviewMessage, SecretProvider, VsCodeInitPayload, WebviewToHostMessage,
} from './protocol'

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null
let requestId = 0
let initPayload: VsCodeInitPayload | null = null
const messageListeners = new Set<(message: HostToWebviewMessage) => void>()
const pending = new Map<number, { resolve: (value: string | string[] | boolean | null | undefined) => void; reject: (error: Error) => void }>()

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
    const message = event.data
    if (!message || typeof message !== 'object' || !('type' in message)) return
    if (message.type === 'init') initPayload = message.payload
    if (message.type === 'fsResponse') {
      const waiter = pending.get(message.id)
      if (waiter) {
        pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error))
        else waiter.resolve(message.value)
      }
    }
    for (const listener of messageListeners) listener(message)
  })
}

export function isVsCodeHost(): boolean {
  return __VSCODE_HOST__
}

export function postHostMessage(message: WebviewToHostMessage): void {
  vscode?.postMessage(message)
}

export function subscribeHostMessages(listener: (message: HostToWebviewMessage) => void): () => void {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}

export function requestVsCodeInit(): Promise<VsCodeInitPayload> {
  if (initPayload) return Promise.resolve(initPayload)
  return new Promise((resolve) => {
    const dispose = subscribeHostMessages((message) => {
      if (message.type !== 'init') return
      dispose()
      resolve(message.payload)
    })
    postHostMessage({ type: 'ready' })
  })
}

export function replaceVsCodeDocument(content: string, sidecarJson?: string): void {
  postHostMessage({ type: 'replaceDocument', content, sidecarJson })
}

export function saveVsCodeDocument(): void { postHostMessage({ type: 'save' }) }
export function runVsCodeHistoryCommand(command: 'undo' | 'redo'): void { postHostMessage({ type: command }) }
export function setVsCodeSecret(provider: SecretProvider, value: string): void {
  postHostMessage({ type: 'setSecret', provider, value })
}

function fsRequest(operation: HostFsOperation): Promise<string | string[] | boolean | null | undefined> {
  const id = ++requestId
  postHostMessage({ type: 'fsRequest', id, operation })
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

export function createVsCodeHostFs(
  request: (operation: HostFsOperation) => Promise<string | string[] | boolean | null | undefined> = fsRequest,
): HostFs {
  const relativeUri = (folderUri: string, relativePath: string) => new URL(
    relativePath,
    folderUri.endsWith('/') ? folderUri : `${folderUri}/`,
  ).toString()
  const host: HostFs = {
    kind: 'vscode',
    async openFile() {
      if (!initPayload) return null
      const { uri, name } = initPayload
      return { uri, name, read: async () => await host.read(uri) ?? '', write: (content) => host.write(uri, content) }
    },
    async openFolder() {
      if (!initPayload) return null
      const { folderUri } = initPayload
      const pathname = new URL(folderUri).pathname.replace(/\/$/, '')
      const name = decodeURIComponent(pathname.split('/').at(-1) || 'workspace')
      return {
        uri: folderUri,
        name,
        list: () => host.list(folderUri),
        read: (path) => host.read(relativeUri(folderUri, path)),
        write: (path, content) => host.write(relativeUri(folderUri, path), content),
      }
    },
    async read(uri) {
      const value = await request({ kind: 'read', uri })
      return typeof value === 'string' ? value : null
    },
    async write(uri, content) { await request({ kind: 'write', uri, content }) },
    async list(uri) {
      const value = await request({ kind: 'list', uri })
      return Array.isArray(value) ? value : []
    },
    watch(_uri, listener) {
      return subscribeHostMessages((message) => {
        if (message.type === 'documentChanged') listener()
      })
    },
    async persist() {},
    async restore() { return initPayload?.folderUri ?? null },
  }
  return host
}

export const vscodeHost = createVsCodeHostFs()
