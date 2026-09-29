import * as assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { DocumentSession, scopedUri } from '../../documentSession'

const dsl = 'workspace "Smoke" {\n model {\n user = person "User"\n system = softwareSystem "System"\n }\n views {\n systemLandscape "All" {\n include *\n autoLayout\n }\n }\n}\n'
async function fixture(sidecar = '{"version":1,"views":{}}') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c4hero-vscode-'))
  const file = path.join(dir, 'smoke.dsl')
  await fs.writeFile(file, dsl)
  if (sidecar) await fs.writeFile(path.join(dir, 'smoke.c4hero.json'), sidecar)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  return { dir, file, document, session: new DocumentSession(document) }
}
async function eventually(check: () => boolean, message: string) {
  const deadline = Date.now() + 20000
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(check(), message)
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
