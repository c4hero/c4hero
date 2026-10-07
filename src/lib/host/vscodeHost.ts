import type { HostFs } from './types'
import { useHostStatus } from './status'
import type {
  DocumentSnapshot, HostFsOperation, HostOperation, HostToWebviewMessage, SecretProvider, VsCodeInitPayload, WebviewToHostMessage,
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
const pending = new Map<number, { resolve: (value: string | string[] | boolean | number | null | undefined) => void; reject: (error: Error) => void }>()

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

let flushDocument: (() => Promise<void>) | undefined
export function setDocumentFlusher(flush?: () => Promise<void>): void { flushDocument = flush }

function request(type: 'request' | 'fsRequest', operation: HostOperation | HostFsOperation): Promise<string | string[] | boolean | number | null | undefined> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    if (!vscode) { reject(new Error('VS Code host is unavailable')); return }
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('VS Code did not respond; please retry')); }, 30000)
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
    // Register the waiter before posting, including for synchronous test hosts.
    postHostMessage(type === 'request'
      ? { type, id, operation: operation as HostOperation }
      : { type, id, operation: operation as HostFsOperation })
  })
}
export async function replaceVsCodeDocument(snapshot: DocumentSnapshot, revision: number): Promise<number> {
  const result = await request('request', { kind: 'edit', snapshot, revision })
  if (typeof result !== 'number') throw new Error('Invalid edit acknowledgement from VS Code')
  useHostStatus.setState({ dirty: true })
  return result
}
export async function saveVsCodeDocument(): Promise<void> {
  await flushDocument?.()
  await request('request', { kind: 'save' })
}
export async function runVsCodeHistoryCommand(command: 'undo' | 'redo'): Promise<void> {
  await flushDocument?.()
  await request('request', { kind: command })
}
export async function openVsCodeDocument(uri?: string): Promise<void> {
  await request('request', { kind: 'open', uri })
}
export function setVsCodeSecret(provider: SecretProvider, value: string): void {
  postHostMessage({ type: 'setSecret', provider, value })
}
function fsRequest(operation: HostFsOperation) { return request('fsRequest', operation) }

export function createVsCodeHostFs(
  request: (operation: HostFsOperation) => Promise<string | string[] | boolean | number | null | undefined> = fsRequest,
): HostFs {
  const relativeUri = (folderUri: string, relativePath: string) => new URL(
    relativePath.split('/').map(encodeURIComponent).join('/'),
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
