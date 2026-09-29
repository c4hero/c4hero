import * as crypto from 'node:crypto'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { DocumentSession, readText, scopedUri } from './documentSession'
import type { HostToWebviewMessage, SecretProvider, WebviewToHostMessage } from '../../src/lib/host/protocol'

const SECRET_PROVIDERS: SecretProvider[] = ['anthropic', 'openai', 'gemini']
const SECRET_PREFIX = 'c4hero.ai.'
export const testState = { mounted: false, nodeCount: 0 }

async function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
  const root = vscode.Uri.joinPath(extensionUri, 'media')
  const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'index.html')))
  const nonce = crypto.randomBytes(24).toString('base64url')
  const html = source.replace(/\b(src|href)="(?!https?:|data:|#)([^"]+)"/g, (_match, attr: string, raw: string) => {
    return `${attr}="${webview.asWebviewUri(vscode.Uri.joinPath(root, raw.replace(/^\.?\//, '')))}"`
  }).replace(/<script\s/g, `<script nonce="${nonce}" `)
  const csp = [
    "default-src 'none'", `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`, `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    `connect-src ${webview.cspSource} https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com`,
    'worker-src blob:',
  ].join('; ')
  return html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`)
}

class C4HeroEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  private readonly sessions = new Map<string, { session: DocumentSession; references: number }>()
  private readonly panels = new Map<vscode.WebviewPanel, DocumentSession>()
  private nextFlush = 0
  private readonly flushes = new Map<number, { panel: vscode.WebviewPanel; resolve(): void; reject(error: Error): void }>()
  private flush(panel: vscode.WebviewPanel): Promise<void> {
    const id = ++this.nextFlush
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.flushes.delete(id); reject(new Error('Canvas did not finish synchronizing; retry Save')) }, 30000)
      this.flushes.set(id, { panel, resolve: () => { clearTimeout(timeout); resolve() }, reject: error => { clearTimeout(timeout); reject(error) } })
      void panel.webview.postMessage({ type: 'flush', id } satisfies HostToWebviewMessage)
    })
  }
  constructor(private readonly context: vscode.ExtensionContext) {}
  private async open(uri?: string) {
    const selected = uri ? vscode.Uri.parse(uri) : (await vscode.window.showOpenDialog({
      canSelectMany: false, filters: { 'Structurizr DSL': ['dsl'] }, openLabel: 'Open architecture',
    }))?.[0]
    if (selected) await vscode.commands.executeCommand('vscode.openWith', selected, 'c4hero.dsl')
    return true
  }
  async historyActive(command: 'undo' | 'redo') {
    const entry = [...this.panels].find(([panel]) => panel.active)
    if (entry) {
      try { await this.flush(entry[0]); await entry[1].history(command) }
      finally { entry[0].reveal(entry[0].viewColumn) }
    }
  }
  async saveActive() {
    const entry = [...this.panels].find(([panel]) => panel.active)
    if (entry) {
      await this.flush(entry[0])
      await entry[1].save()
      for (const [panel, session] of this.panels) if (session === entry[1]) void panel.webview.postMessage({ type: 'saved', dirty: session.dirty })
    }
  }
  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const key = document.uri.toString()
    let entry = this.sessions.get(key)
    if (!entry) { entry = { session: new DocumentSession(document), references: 0 }; this.sessions.set(key, entry) }
    entry.references++
    const session = entry.session
    this.panels.set(panel, session)
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] }
    const post = (message: HostToWebviewMessage) => panel.webview.postMessage(message)
    let editingHere = false
    const subscriptions: vscode.Disposable[] = []
    subscriptions.push(session.onDidChange(snapshot => {
      if (!editingHere) void post({ type: 'documentChanged', snapshot, revision: session.revision, dirty: session.dirty })
    }))
    const init = async () => {
      const keys = Object.fromEntries(await Promise.all(SECRET_PROVIDERS.map(async provider => [provider,
        await this.context.secrets.get(`${SECRET_PREFIX}${provider}`) ?? '',
      ]))) as Record<SecretProvider, string>
      await post({ type: 'init', payload: {
        ...await session.snapshot(), uri: key, folderUri: session.folder.toString(),
        name: path.posix.basename(document.uri.path), revision: session.revision, dirty: session.dirty, apiKeys: keys,
      } })
    }
    subscriptions.push(panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      if (!raw || typeof raw !== 'object' || !('type' in raw)) return
      const message = raw as WebviewToHostMessage
      try {
        if (message.type === 'flushed') {
          const waiter = this.flushes.get(message.id)
          if (waiter?.panel === panel) {
            this.flushes.delete(message.id)
            if (message.error) waiter.reject(new Error(message.error)); else waiter.resolve()
          }
          return
        }
        if (message.type === 'ready') { await init(); return }
        if (message.type === 'mounted') { testState.mounted = true; testState.nodeCount = message.nodeCount; return }
        if (message.type === 'setSecret') {
          if (!SECRET_PROVIDERS.includes(message.provider) || typeof message.value !== 'string') throw new Error('Invalid provider key request')
          if (message.value) await this.context.secrets.store(`${SECRET_PREFIX}${message.provider}`, message.value)
          else await this.context.secrets.delete(`${SECRET_PREFIX}${message.provider}`)
          return
        }
        if (message.type !== 'request' && message.type !== 'fsRequest') return
        let value: string | string[] | number | boolean | null = null
        const operation = message.operation
        if (message.type === 'fsRequest') {
          const operation = message.operation
          const uri = scopedUri(session.folder, operation.uri)
          if (operation.kind === 'read') value = await session.read(uri) ?? null
          else if (operation.kind === 'list') {
            try { value = (await vscode.workspace.fs.readDirectory(uri)).filter(([, kind]) => (kind & vscode.FileType.File) !== 0).map(([name]) => name).sort() }
            catch (error) { if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') value = []; else throw error }
          }
          else { value = await session.writeFile(uri, operation.content); await post({ type: 'saved', dirty: session.dirty }) }
        } else if (operation.kind === 'edit') {
          editingHere = true
          try { value = await session.edit(operation.snapshot, operation.revision) }
          finally { editingHere = false }
          // Other split views need the acknowledged snapshot too.
          for (const [other, otherSession] of this.panels) if (other !== panel && otherSession === session) {
            void other.webview.postMessage({ type: 'documentChanged', snapshot: await session.snapshot(), revision: session.revision, dirty: session.dirty } satisfies HostToWebviewMessage)
          }
        } else if (operation.kind === 'save') { value = await session.save(); await post({ type: 'saved', dirty: session.dirty }) }
        else if (operation.kind === 'undo' || operation.kind === 'redo') {
          try { value = await session.history(operation.kind) }
          finally { panel.reveal(panel.viewColumn) }
        }
        else if (operation.kind === 'open') value = await this.open(operation.uri)
        else throw new Error('Unknown host operation')
        await post({ type: 'fsResponse', id: message.id, value })
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        if ('id' in message && typeof message.id === 'number') await post({ type: 'fsResponse', id: message.id, error: text })
        else void vscode.window.showErrorMessage(text)
      }
    }))
    subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
      if (event.document.uri.toString() === key) event.waitUntil(session.idle().then(() => []))
    }))
    subscriptions.push(vscode.workspace.onDidSaveTextDocument(saved => {
      if (saved.uri.toString() !== key) return
      void session.saveCompanions().then(() => post({ type: 'saved', dirty: session.dirty }), error => vscode.window.showErrorMessage(String(error)))
    }))
    subscriptions.push(this.context.secrets.onDidChange(async event => {
      const provider = SECRET_PROVIDERS.find(p => event.key === `${SECRET_PREFIX}${p}`)
      if (provider) await post({ type: 'secretChanged', provider, value: await this.context.secrets.get(event.key) ?? '' })
    }))
    panel.onDidDispose(() => {
      subscriptions.forEach(s => s.dispose())
      this.panels.delete(panel)
      for (const [id, waiter] of this.flushes) if (waiter.panel === panel) {
        this.flushes.delete(id); waiter.reject(new Error('Canvas closed before synchronization completed'))
      }
      if (--entry!.references === 0) { session.dispose(); this.sessions.delete(key) }
    })
    // Register ready handler before assigning HTML; fast webviews must not
    // lose their one initialization request.
    panel.webview.html = await webviewHtml(panel.webview, this.context.extensionUri)
  }
  dispose() { this.sessions.forEach(({ session }) => session.dispose()); this.sessions.clear() }
}
export function activate(context: vscode.ExtensionContext) {
  const provider = new C4HeroEditorProvider(context)
  context.subscriptions.push(provider,
    vscode.window.registerCustomEditorProvider('c4hero.dsl', provider, { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true }),
    vscode.commands.registerCommand('c4hero.save', () => provider.saveActive()),
    vscode.commands.registerCommand('c4hero.undo', () => provider.historyActive('undo')),
    vscode.commands.registerCommand('c4hero.redo', () => provider.historyActive('redo')),
    vscode.commands.registerCommand('c4hero.openArchitectureView', async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri ?? (await vscode.window.showOpenDialog({ filters: { 'Structurizr DSL': ['dsl'] }, canSelectMany: false }))?.[0]
      if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, 'c4hero.dsl')
    }),
  )
  return { testState, readText }
}
export function deactivate(): void {}
