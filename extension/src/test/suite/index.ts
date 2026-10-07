import * as assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { DocumentSession, scopedUri } from '../../documentSession'
import { C4HeroEditorProvider } from '../../extension'
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../../../src/lib/host/protocol'

const dsl = 'workspace "Smoke" {\n model {\n user = person "User"\n system = softwareSystem "System"\n }\n views {\n systemLandscape "All" {\n include *\n autoLayout\n }\n }\n}\n'
async function fixture(sidecar = '{"version":1,"views":{}}', content = dsl) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c4hero-vscode-'))
  const file = path.join(dir, 'smoke.dsl')
  await fs.writeFile(file, content)
  if (sidecar) await fs.writeFile(path.join(dir, 'smoke.c4hero.json'), sidecar)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  return { dir, file, document, session: new DocumentSession(document) }
}
async function eventually(check: () => boolean, message: string) {
  const deadline = Date.now() + 20000
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(check(), message)
}
async function testPanel(document: vscode.TextDocument) {
  const receive = new vscode.EventEmitter<WebviewToHostMessage>()
  const close = new vscode.EventEmitter<void>()
  const secretChanges = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
  const messages: HostToWebviewMessage[] = []
  const extensionUri = vscode.extensions.getExtension('c4hero.c4hero-vscode')!.extensionUri
  const context = {
    extensionUri,
    secrets: { get: async () => undefined, onDidChange: secretChanges.event },
  } as unknown as vscode.ExtensionContext
  const provider = new C4HeroEditorProvider(context)
  const panel = {
    webview: {
      options: {}, html: '', cspSource: 'test', asWebviewUri: (uri: vscode.Uri) => uri,
      onDidReceiveMessage: receive.event,
      postMessage: async (message: HostToWebviewMessage) => { messages.push(message); return true },
    },
    onDidDispose: close.event,
  } as unknown as vscode.WebviewPanel
  await provider.resolveCustomTextEditor(document, panel)
  return {
    messages, send: (message: WebviewToHostMessage) => receive.fire(message),
    dispose: () => { close.fire(); provider.dispose(); receive.dispose(); close.dispose(); secretChanges.dispose() },
  }
}
export async function run(): Promise<void> {
  const tests: { title: string; body: () => Promise<void> }[] = []
  const test = (title: string, body: () => Promise<void>) => tests.push({ title, body })
  test('opens a DSL webview and renders actual canvas nodes', async () => {
    const { file, session } = await fixture()
    session.dispose()
    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(file), 'c4hero.dsl')
    const extension = vscode.extensions.getExtension<{ testState: { mounted: boolean; nodeCount: number } }>('c4hero.c4hero-vscode')
    assert.ok(extension)
    const api = await extension.activate()
    await eventually(() => api.testState.mounted, 'The webview did not render React Flow nodes')
    assert.ok(api.testState.nodeCount >= 2)
    // Exercise the host-initiated flush handshake used by Ctrl/Cmd+S.
    await vscode.commands.executeCommand('c4hero.save')
  })
  test('layout-only changes dirty the sidecar, preserve DSL bytes, and save both', async () => {
    const { file, document, session } = await fixture()
    try {
      const snapshot = await session.snapshot()
      const sidecarJson = '{"version":1,"views":{"All":{"elements":{"user":{"x":135,"y":246,"pinned":true}}}}}'
      await session.edit({ ...snapshot, sidecarJson }, session.revision)
      assert.equal(document.isDirty, false)
      assert.equal(session.dirty, true)
      const sidecar = await vscode.workspace.openTextDocument(session.sidecar)
      assert.equal(sidecar.isDirty, true)
      await session.save()
      assert.equal(await fs.readFile(file, 'utf8'), dsl)
      assert.equal(await fs.readFile(session.sidecar.fsPath, 'utf8'), sidecarJson)
      assert.equal(session.dirty, false)
    } finally { session.dispose() }
  })
  test('DSL edits and sidecar edits participate in native undo/redo', async () => {
    const { document, session } = await fixture()
    try {
      const snapshot = await session.snapshot()
      await session.edit({ ...snapshot, content: dsl.replace('"User"', '"Edited"'), sidecarJson: '{"version":1,"views":{"All":{"locked":true}}}' }, session.revision)
      assert.equal(document.isDirty, true)
      await session.history('undo')
      assert.equal(document.getText(), dsl)
      assert.equal((await session.snapshot()).sidecarJson, snapshot.sidecarJson)
      await session.history('redo')
      assert.match(document.getText(), /Edited/)
      await session.save()
    } finally { session.dispose() }
  })
  test('layout-only native undo/redo leaves the DSL clean', async () => {
    const { document, session } = await fixture()
    try {
      const snapshot = await session.snapshot()
      const sidecarJson = '{"version":1,"views":{"All":{"elements":{"user":{"x":25,"y":60}}}}}'
      await session.edit({ ...snapshot, sidecarJson }, session.revision)
      await session.history('undo')
      assert.equal((await session.snapshot()).sidecarJson, snapshot.sidecarJson)
      assert.equal(document.isDirty, false)
      await session.history('redo')
      assert.equal((await session.snapshot()).sidecarJson, sidecarJson)
      await session.save()
    } finally { session.dispose() }
  })
  test('external sidecar edits publish a new snapshot and participate in save', async () => {
    const { session } = await fixture()
    try {
      const doc = await vscode.workspace.openTextDocument(session.sidecar)
      let observed: string | undefined
      const subscription = session.onDidChange(snapshot => { observed = snapshot.sidecarJson })
      const edit = new vscode.WorkspaceEdit()
      edit.insert(doc.uri, new vscode.Position(0, 0), ' ')
      await vscode.workspace.applyEdit(edit)
      await eventually(() => observed?.startsWith(' ') ?? false, 'Sidecar change was not published')
      assert.equal(session.dirty, true)
      await session.save()
      assert.equal(session.dirty, false)
      subscription.dispose()
    } finally { session.dispose() }
  })
  test('new layout sidecar is retained and can be saved without dirtying DSL', async () => {
    const { document, session } = await fixture('')
    try {
      await session.edit({ ...await session.snapshot(), sidecarJson: '{"version":1,"views":{}}' }, session.revision)
      assert.equal(document.isDirty, false)
      await session.save()
      assert.equal(await fs.readFile(session.sidecar.fsPath, 'utf8'), '{"version":1,"views":{}}')
    } finally { session.dispose() }
  })
  test('included fragment edits use dirty documents and are saved with the root', async () => {
    const { dir, session } = await fixture()
    try {
      const uri = vscode.Uri.file(path.join(dir, 'people.dsl'))
      await fs.writeFile(uri.fsPath, 'p = person "Old"\n')
      await session.read(uri)
      const snapshot = await session.snapshot()
      await session.edit({ ...snapshot, includes: { 'people.dsl': 'p = person "New"\n' } }, session.revision)
      assert.equal((await vscode.workspace.openTextDocument(uri)).isDirty, true)
      await session.save()
      assert.equal(await fs.readFile(uri.fsPath, 'utf8'), 'p = person "New"\n')
    } finally { session.dispose() }
  })
  test('rejects stale canvas edits after text changes outside the canvas', async () => {
    const { document, session } = await fixture()
    try {
      const snapshot = await session.snapshot(); const revision = session.revision
      const edit = new vscode.WorkspaceEdit()
      edit.insert(document.uri, new vscode.Position(0, 0), '// external edit\n')
      await vscode.workspace.applyEdit(edit)
      await assert.rejects(session.edit({ ...snapshot, content: 'stale' }, revision), /changed outside/)
      assert.match(document.getText(), /^\/\/ external edit/)
      await document.save()
    } finally { session.dispose() }
  })
  test('publishes external text changes while preparing a stale canvas edit', async () => {
    const changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    const contents = new Map([['/model.dsl', dsl], ['/model.c4hero.json', '{"version":1,"views":{}}']])
    let holdRead = false
    let preparing = false
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const filesystem: vscode.FileSystemProvider = {
      onDidChangeFile: changed.event,
      stat: uri => ({ type: vscode.FileType.File, ctime: 1, mtime: 1, size: contents.get(uri.path)!.length }),
      readFile: async uri => {
        if (holdRead && uri.path === '/model.c4hero.json') {
          holdRead = false; preparing = true; await gate
        }
        return new TextEncoder().encode(contents.get(uri.path)!)
      },
      writeFile: (uri, bytes) => { contents.set(uri.path, new TextDecoder().decode(bytes)) },
      readDirectory: () => [], watch: () => ({ dispose() {} }),
      createDirectory() {}, delete() {}, rename() {},
    }
    const registration = vscode.workspace.registerFileSystemProvider('c4hero-review', filesystem)
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('c4hero-review:/model.dsl'))
    const panel = await testPanel(document)
    try {
      holdRead = true
      panel.send({ type: 'request', id: 100, operation: {
        kind: 'edit', revision: 0,
        snapshot: { content: dsl.replace('"User"', '"Canvas"'), sidecarJson: '{"version":1,"views":{"All":{"locked":true}}}', includes: {} },
      } })
      await eventually(() => preparing, 'The canvas edit did not await its companion file')
      const edit = new vscode.WorkspaceEdit()
      edit.insert(document.uri, new vscode.Position(0, 0), '// external edit\n')
      await vscode.workspace.applyEdit(edit)
      await eventually(() => panel.messages.some(message => message.type === 'documentChanged'), 'The originating canvas missed the external text change during edit preparation')
      release()
      await eventually(() => panel.messages.some(message => message.type === 'fsResponse' && message.id === 100), 'The stale edit was not answered')
      const response = panel.messages.find(message => message.type === 'fsResponse' && message.id === 100)
      assert.ok(response?.type === 'fsResponse' && response.error?.includes('changed while preparing'))
      assert.match(document.getText(), /^\/\/ external edit/)
      await document.save()
    } finally { release(); panel.dispose(); registration.dispose(); changed.dispose() }
  })
  test('native companion-only saves clear the canvas dirty status', async () => {
    const { document, session } = await fixture()
    const panel = await testPanel(document)
    try {
      await session.edit({ ...await session.snapshot(), sidecarJson: '{"version":1,"views":{"All":{"locked":true}}}' }, session.revision)
      const sidecar = await vscode.workspace.openTextDocument(session.sidecar)
      assert.equal(document.isDirty, false)
      assert.equal(sidecar.isDirty, true)
      await sidecar.save()
      await eventually(() => panel.messages.some(message => message.type === 'saved' && !message.dirty), 'Saving the sidecar did not clear the canvas dirty status')
      assert.equal(session.dirty, false)
    } finally { panel.dispose(); session.dispose() }
  })
  test('rejects oversized root DSL snapshots before loading companion files', async () => {
    const { session } = await fixture('', ' '.repeat(10 * 1024 * 1024 + 1))
    try { await assert.rejects(session.snapshot(), /10 MB limit/) }
    finally { session.dispose() }
  })
  test('rejects filesystem access outside the opened architecture folder', async () => {
    const folder = vscode.Uri.parse('vscode-remote://ssh-remote+test/project')
    assert.equal(scopedUri(folder, folder.toString()).path, '/project')
    assert.equal(scopedUri(folder, 'vscode-remote://ssh-remote+test/project/a.dsl').path, '/project/a.dsl')
    assert.throws(() => scopedUri(folder, 'vscode-remote://ssh-remote+other/project/a.dsl'))
    assert.throws(() => scopedUri(folder, 'file:///project/a.dsl'))
    assert.throws(() => scopedUri(folder, 'vscode-remote://ssh-remote+test/project/../secret'))
    assert.throws(() => scopedUri(folder, 'vscode-remote://ssh-remote+test/project-sibling/a.dsl'))
  })
  const failures: unknown[] = []
  for (const { title, body } of tests) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([body(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Test timed out after 30 seconds')), 30000) })])
      console.log(`PASS ${title}`)
    }
    catch (error) { failures.push(error); console.error(`FAIL ${title}`, error) }
    finally { clearTimeout(timeout) }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} extension test(s) failed`)
  console.log(`${tests.length} extension tests passed`)
}
