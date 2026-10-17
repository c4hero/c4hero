import * as assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import Mocha from 'mocha'

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 30_000 })
  mocha.suite.addTest(new Mocha.Test('opens a DSL webview and renders model nodes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c4hero-vscode-'))
    const file = path.join(dir, 'smoke.dsl')
    await fs.writeFile(file, 'workspace "Smoke" { model { user = person "User" system = softwareSystem "System" } views { systemLandscape landscape { include * autoLayout } } }')
    const uri = vscode.Uri.file(file)
    await vscode.commands.executeCommand('vscode.openWith', uri, 'c4hero.dsl')
    const extension = vscode.extensions.getExtension<{ testState: { mounted: boolean; nodeCount: number } }>('c4hero.c4hero-vscode')
    assert.ok(extension)
    const api = await extension.activate()
    const deadline = Date.now() + 20_000
    while (!api.testState.mounted && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(api.testState.mounted, true)
    assert.ok(api.testState.nodeCount >= 2)
  }))
  return new Promise((resolve, reject) => mocha.run((failures) => failures ? reject(new Error(`${failures} extension test(s) failed`)) : resolve()))
}

