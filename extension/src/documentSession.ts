import * as vscode from 'vscode'
import { sanitizeFilename } from '../../src/lib/filenames'
import type { DocumentSnapshot } from '../../src/lib/host/protocol'

const LIMIT = 10 * 1024 * 1024
function checkedText(text: string): string {
  if (new TextEncoder().encode(text).byteLength > LIMIT) throw new Error('Architecture file exceeds the 10 MB limit')
  return text
}
export function scopedUri(folder: vscode.Uri, raw: string): vscode.Uri {
  const uri = vscode.Uri.parse(raw)
  const base = folder.path.replace(/\/$/, '') + '/'
  if (uri.scheme !== folder.scheme || uri.authority !== folder.authority || (uri.path !== folder.path && !uri.path.startsWith(base))
    || uri.path.split('/').some(part => part === '..' || part === '.') || uri.query || uri.fragment) {
    throw new Error('File access is limited to the architecture document folder')
  }
  return uri
}
export async function readText(uri: vscode.Uri): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
  if (open) return checkedText(open.getText())
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    if (stat.size > LIMIT) throw new Error('Architecture file exceeds the 10 MB limit')
    const bytes = await vscode.workspace.fs.readFile(uri)
    if (bytes.byteLength > LIMIT) throw new Error('Architecture file exceeds the 10 MB limit')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return undefined
    throw error
  }
}
function replace(edit: vscode.WorkspaceEdit, doc: vscode.TextDocument, content: string) {
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), content)
}

/** One session per root TextDocument, shared by every canvas opened for it.
 * Layout and include fragments are real TextDocuments, so dirty buffers are
 * recoverable by VS Code and edits participate in its native undo history. */
export class DocumentSession implements vscode.Disposable {
  readonly folder: vscode.Uri
  readonly sidecar: vscode.Uri
  revision = 0
  private applying = false
  private saving = 0
  private queue: Promise<unknown> = Promise.resolve()
  private readonly docs = new Map<string, vscode.TextDocument>()
  private readonly includes = new Set<string>()
  private readonly undoTargets: vscode.Uri[] = []
  private readonly redoTargets: vscode.Uri[] = []
  private readonly changes = new vscode.EventEmitter<DocumentSnapshot>()
  readonly onDidChange = this.changes.event
  private readonly disposables: vscode.Disposable[] = []
  private publishing = 0
  private readonly watchedText = new Map<string, string | undefined>()

  constructor(readonly document: vscode.TextDocument) {
    this.folder = vscode.Uri.joinPath(document.uri, '..')
    const stem = sanitizeFilename(document.uri.path.split('/').at(-1)!.replace(/\.dsl$/i, ''))
    const name = stem === 'download' ? 'workspace' : stem
    this.sidecar = vscode.Uri.joinPath(this.folder, `${name}.c4hero.json`)
    this.docs.set(document.uri.toString(), document)
    this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
      if (this.applying || !event.contentChanges.length || !this.watches(event.document.uri)) return
      this.revision++
      void this.publish()
    }))
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.folder, '**/*'))
    const changed = async (uri: vscode.Uri) => {
      if (this.applying || !this.watches(uri)) return
      // VS Code emits TextDocument changes for every open buffer, including
      // external disk reloads. Watching those again would invalidate our own
      // edit revisions after each save.
      if (vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString())) return
      try {
        const text = await readText(uri)
        if (text === this.watchedText.get(uri.toString())) return
        this.watchedText.set(uri.toString(), text)
        this.revision++
        await this.publish()
      } catch (error) { void vscode.window.showErrorMessage(String(error)) }
    }
    this.disposables.push(watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed))
  }
  get dirty() { return this.documents().some(doc => doc.isDirty) }
  private documents() { return vscode.workspace.textDocuments.filter(doc => this.watches(doc.uri)) }
  watches(uri: vscode.Uri) {
    const key = uri.toString()
    return this.docs.has(key) || key === this.sidecar.toString() || this.includes.has(key)
  }
  async snapshot(): Promise<DocumentSnapshot> {
    const version = this.document.version
    const content = checkedText(this.document.getText())
    const includes: Record<string, string> = {}
    for (const key of this.includes) {
      const uri = vscode.Uri.parse(key)
      const value = await readText(uri)
      if (value !== undefined) includes[uri.path.slice(this.folder.path.replace(/\/$/, '').length + 1)] = value
    }
    const sidecarJson = await readText(this.sidecar)
    this.watchedText.set(this.sidecar.toString(), sidecarJson)
    return { content: this.document.version === version ? content : checkedText(this.document.getText()), sidecarJson, includes }
  }
  private async publish() {
    const generation = ++this.publishing
    try {
      const snapshot = await this.snapshot()
      if (generation === this.publishing) this.changes.fire(snapshot)
    } catch (error) { void vscode.window.showErrorMessage(String(error)) }
  }
  async read(uri: vscode.Uri) {
    scopedUri(this.folder, uri.toString())
    const value = await readText(uri)
    this.watchedText.set(uri.toString(), value)
    if (uri.toString() !== this.sidecar.toString()) this.includes.add(uri.toString())
    return value
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => {})
    return result
  }
  async edit(snapshot: DocumentSnapshot, revision: number): Promise<number> {
    return this.enqueue(async () => {
      if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace in VS Code before editing')
      if (revision !== this.revision) throw new Error('The files changed outside this canvas. Reopen the architecture view before retrying your edit.')
      const targets = new Map<string, string>([[this.document.uri.toString(), snapshot.content]])
      if (snapshot.sidecarJson !== undefined) {
        JSON.parse(snapshot.sidecarJson)
        targets.set(this.sidecar.toString(), snapshot.sidecarJson)
      }
      for (const [relative, content] of Object.entries(snapshot.includes)) {
        const uri = scopedUri(this.folder, vscode.Uri.joinPath(this.folder, relative).toString())
        if (!this.includes.has(uri.toString())) throw new Error(`Cannot edit an include that was not loaded: ${relative}`)
        targets.set(uri.toString(), content)
      }
      const changed: Array<{ uri: vscode.Uri; content: string; doc?: vscode.TextDocument }> = []
      for (const [key, content] of targets) {
        if (new TextEncoder().encode(content).byteLength > LIMIT) throw new Error('Architecture file exceeds the 10 MB limit')
        const uri = vscode.Uri.parse(key)
        const previous = await readText(uri)
        if (previous === content) continue
        const doc = previous === undefined ? undefined : await vscode.workspace.openTextDocument(uri)
        changed.push({ uri, content, doc })
      }
      // File reads await providers, during which another editor may change a
      // document. Recheck immediately before the atomic WorkspaceEdit.
      if (revision !== this.revision) throw new Error('The files changed while preparing the edit; reopen the architecture view')
      if (!changed.length) return this.revision
      const edit = new vscode.WorkspaceEdit()
      for (const target of changed) {
        if (target.doc) replace(edit, target.doc, target.content)
        else {
          edit.createFile(target.uri, { overwrite: false })
          edit.insert(target.uri, new vscode.Position(0, 0), target.content)
        }
      }
      this.applying = true
      try {
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the architecture edit')
        for (const target of changed) this.docs.set(target.uri.toString(), await vscode.workspace.openTextDocument(target.uri))
        // Grouped edits undo together; a layout-only edit targets its actual
        // sidecar document instead of creating a fake edit in the DSL.
        this.undoTargets.push(changed[0].uri)
        this.redoTargets.length = 0
        return ++this.revision
      } finally { this.applying = false }
    })
  }
  async writeFile(uri: vscode.Uri, content: string): Promise<boolean> {
    scopedUri(this.folder, uri.toString())
    return this.enqueue(async () => {
      if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before writing files')
      if (new TextEncoder().encode(content).byteLength > LIMIT) throw new Error('Architecture file exceeds the 10 MB limit')
      const previous = await readText(uri)
      if (previous === content) return true
      const edit = new vscode.WorkspaceEdit()
      if (previous === undefined) { await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..')); edit.createFile(uri, { overwrite: false }); edit.insert(uri, new vscode.Position(0, 0), content) }
      else replace(edit, await vscode.workspace.openTextDocument(uri), content)
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the file edit')
      const doc = await vscode.workspace.openTextDocument(uri)
      this.docs.set(uri.toString(), doc)
      if (!await this.saveDocument(doc)) throw new Error(`Could not save ${uri.path}`)
      return true
    })
  }
  private async saveDocument(doc: vscode.TextDocument): Promise<boolean> {
    this.saving++
    try { return await doc.save() }
    finally { this.saving-- }
  }
  async idle(): Promise<void> {
    // A write operation may save from inside the queue. Its onWillSave event
    // must not wait on that same operation and deadlock the document.
    if (!this.saving) await this.queue
  }
  async save(): Promise<boolean> {
    await this.queue
    for (const doc of this.documents()) {
      if (doc.isDirty && !await this.saveDocument(doc)) throw new Error(`Could not save ${doc.uri.path}`)
    }
    return true
  }
  async saveCompanions(): Promise<void> {
    for (const doc of this.documents()) {
      if (doc !== this.document && doc.isDirty && !await this.saveDocument(doc)) throw new Error(`Could not save ${doc.uri.path}`)
    }
  }
  async history(command: 'undo' | 'redo'): Promise<boolean> {
    await this.queue
    const from = command === 'undo' ? this.undoTargets : this.redoTargets
    const to = command === 'undo' ? this.redoTargets : this.undoTargets
    const uri = from.pop() ?? this.document.uri
    // VS Code's undo command uses the active editor and ignores URI arguments.
    // Activate the real target buffer, then let the provider restore its canvas.
    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false })
    await vscode.commands.executeCommand(command)
    to.push(uri)
    return true
  }
  dispose() { this.publishing++; this.disposables.forEach(item => item.dispose()); this.changes.dispose() }
}
