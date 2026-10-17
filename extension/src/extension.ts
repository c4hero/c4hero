import * as crypto from 'node:crypto'
import * as path from 'node:path'
import * as vscode from 'vscode'
import type {
  HostFsOperation, HostToWebviewMessage, SecretProvider, WebviewToHostMessage,
} from '../../src/lib/host/protocol'

const SECRET_PROVIDERS: SecretProvider[] = ['anthropic', 'openai', 'gemini']
const SECRET_PREFIX = 'c4hero.ai.'

export const testState = { mounted: false, nodeCount: 0 }

function safeSidecarStem(name: string): string {
  const illegalChars = new Set('/\\:*?"<>|')
  const safe = Array.from(name.trim(), (char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127 || illegalChars.has(char) ? '_' : char
  }).join('').replace(/^\.+/, '_').replace(/[. ]+$/, '').slice(0, 180)
  const cleaned = !safe || safe === '_' ? 'workspace' : safe
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(cleaned) ? `_${cleaned}` : cleaned
}

function sidecarUri(document: vscode.TextDocument): vscode.Uri {
  const base = safeSidecarStem(path.basename(document.uri.path).replace(/\.dsl$/i, ''))
  return vscode.Uri.joinPath(document.uri, '..', `${base}.c4hero.json`)
}

async function readOptional(uri: vscode.Uri): Promise<string | undefined> {
  try { return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) } catch { return undefined }
}

async function readSecrets(context: vscode.ExtensionContext): Promise<Record<SecretProvider, string>> {
  const result = {} as Record<SecretProvider, string>
  await Promise.all(SECRET_PROVIDERS.map(async (provider) => {
    result[provider] = await context.secrets.get(`${SECRET_PREFIX}${provider}`) ?? ''
  }))
  return result
}

function nonce(): string { return crypto.randomBytes(24).toString('base64url') }

async function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media')
  const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(mediaRoot, 'index.html')))
  const scriptNonce = nonce()
  const rewritten = source.replace(/\b(src|href)="(?!https?:|data:|#)([^"]+)"/g, (_match, attribute: string, rawPath: string) => {
    const relative = rawPath.replace(/^\.\//, '').replace(/^\//, '')
    return `${attribute}="${webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, relative))}"`
  }).replace(/<script\s/g, `<script nonce="${scriptNonce}" `)
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `media-src ${webview.cspSource} blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${scriptNonce}'`,
    "connect-src https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
    "worker-src blob:",
  ].join('; ')
  return rewritten.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`)
}

async function applyWholeDocument(document: vscode.TextDocument, content: string): Promise<void> {
  if (document.getText() === content) return
  const lastLine = document.lineAt(document.lineCount - 1)
  const range = new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end)
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, range, content)
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the c4hero document edit')
}

async function handleFs(operation: HostFsOperation): Promise<string | string[] | boolean | null> {
  const uri = vscode.Uri.parse(operation.uri)
  if (operation.kind === 'read') return await readOptional(uri) ?? null
  if (operation.kind === 'write') {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(operation.content))
    return true
  }
  const entries = await vscode.workspace.fs.readDirectory(uri)
  return entries.map(([name]) => name).sort()
}

class C4HeroEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }
    panel.webview.html = await webviewHtml(panel.webview, this.context.extensionUri)

    let latestSidecar: string | undefined = await readOptional(sidecarUri(document))
    let editQueue: Promise<void> = Promise.resolve()
    const post = (message: HostToWebviewMessage) => panel.webview.postMessage(message)
    const enqueue = (task: () => PromiseLike<unknown>) => {
      editQueue = editQueue.then(task).then(
        () => {},
        (error: unknown) => { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)) },
      )
    }

    const sendInit = async () => post({
      type: 'init',
      payload: {
        uri: document.uri.toString(),
        folderUri: vscode.Uri.joinPath(document.uri, '..').toString(),
        name: path.basename(document.uri.path),
        content: document.getText(),
        sidecarJson: latestSidecar,
        apiKeys: await readSecrets(this.context),
      },
    })

    const messageSubscription = panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
      if (message.type === 'ready') { void sendInit(); return }
      if (message.type === 'mounted') {
        testState.mounted = true
        testState.nodeCount = message.nodeCount
        return
      }
      if (message.type === 'replaceDocument') {
        latestSidecar = message.sidecarJson
        enqueue(() => applyWholeDocument(document, message.content))
        return
      }
      if (message.type === 'save') {
        enqueue(() => document.save())
        return
      }
      if (message.type === 'undo' || message.type === 'redo') {
        enqueue(() => vscode.commands.executeCommand(message.type))
        return
      }
      if (message.type === 'setSecret') {
        const key = `${SECRET_PREFIX}${message.provider}`
        void (message.value ? this.context.secrets.store(key, message.value) : this.context.secrets.delete(key))
        return
      }
      if (message.type === 'fsRequest') {
        void handleFs(message.operation).then(
          (value) => post({ type: 'fsResponse', id: message.id, value }),
          (error: unknown) => post({ type: 'fsResponse', id: message.id, error: error instanceof Error ? error.message : String(error) }),
        )
      }
    })

    const documentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return
      void post({ type: 'documentChanged', content: event.document.getText(), sidecarJson: latestSidecar })
    })
    const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString() || latestSidecar === undefined) return
      void vscode.workspace.fs.writeFile(sidecarUri(document), new TextEncoder().encode(latestSidecar)).then(
        undefined,
        (error: unknown) => vscode.window.showErrorMessage(`Could not save c4hero sidecar: ${error instanceof Error ? error.message : String(error)}`),
      )
    })
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, '..'), path.basename(document.uri.path)))
    watcher.onDidChange(() => void post({ type: 'documentChanged', content: document.getText(), sidecarJson: latestSidecar }))

    panel.onDidDispose(() => {
      messageSubscription.dispose()
      documentSubscription.dispose()
      saveSubscription.dispose()
      watcher.dispose()
    })
  }
}

export function activate(context: vscode.ExtensionContext): { testState: typeof testState } {
  const provider = new C4HeroEditorProvider(context)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('c4hero.dsl', provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('c4hero.openArchitectureView', async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri
      if (!uri || path.extname(uri.path).toLowerCase() !== '.dsl') {
        void vscode.window.showInformationMessage('Open a .dsl file to use the c4hero architecture view.')
        return
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, 'c4hero.dsl')
    }),
  )
  return { testState }
}

export function deactivate(): void {}
