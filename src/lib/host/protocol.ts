/** Messages exchanged between the c4hero webview and the VS Code extension. */
export type SecretProvider = 'anthropic' | 'openai' | 'gemini'

export interface VsCodeInitPayload {
  uri: string
  folderUri: string
  name: string
  content: string
  sidecarJson?: string
  apiKeys: Record<SecretProvider, string>
}

export type HostFsOperation =
  | { kind: 'read'; uri: string }
  | { kind: 'write'; uri: string; content: string }
  | { kind: 'list'; uri: string }

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'mounted'; nodeCount: number }
  | { type: 'replaceDocument'; content: string; sidecarJson?: string }
  | { type: 'save' }
  | { type: 'undo' | 'redo' }
  | { type: 'dirty'; dirty: boolean }
  | { type: 'fsRequest'; id: number; operation: HostFsOperation }
  | { type: 'setSecret'; provider: SecretProvider; value: string }

export type HostToWebviewMessage =
  | { type: 'init'; payload: VsCodeInitPayload }
  | { type: 'documentChanged'; content: string; sidecarJson?: string }
  | { type: 'fsResponse'; id: number; value?: string | string[] | boolean | null; error?: string }
  | { type: 'secretChanged'; provider: SecretProvider; value: string }
