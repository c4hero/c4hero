/** Messages exchanged between the webview and the extension. */
export type SecretProvider = 'anthropic' | 'openai' | 'gemini'
export interface DocumentSnapshot {
  content: string
  sidecarJson?: string
  includes: Record<string, string>
}
export interface VsCodeInitPayload extends DocumentSnapshot {
  uri: string
  folderUri: string
  name: string
  revision: number
  dirty: boolean
  apiKeys: Record<SecretProvider, string>
}
export type HostFsOperation =
  | { kind: 'read'; uri: string }
  | { kind: 'write'; uri: string; content: string }
  | { kind: 'list'; uri: string }
export type HostOperation =
  | { kind: 'edit'; snapshot: DocumentSnapshot; revision: number }
  | { kind: 'save' }
  | { kind: 'undo' | 'redo' }
  | { kind: 'open'; uri?: string }
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'flushed'; id: number; error?: string }
  | { type: 'mounted'; nodeCount: number }
  | { type: 'request'; id: number; operation: HostOperation }
  | { type: 'fsRequest'; id: number; operation: HostFsOperation }
  | { type: 'setSecret'; provider: SecretProvider; value: string }
export type HostToWebviewMessage =
  | { type: 'init'; payload: VsCodeInitPayload }
  | { type: 'flush'; id: number }
  | { type: 'documentChanged'; snapshot: DocumentSnapshot; revision: number; dirty: boolean }
  | { type: 'saved'; dirty: boolean }
  | { type: 'fsResponse'; id: number; value?: string | string[] | boolean | number | null; error?: string }
  | { type: 'secretChanged'; provider: SecretProvider; value: string }
