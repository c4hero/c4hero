import * as path from 'node:path'
import { runTests } from '@vscode/test-electron'

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..')
  const extensionTestsPath = path.resolve(__dirname, './suite/index')
  await runTests({
    version: '1.95.3',
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-gpu', '--no-sandbox'],
  })
}

main().catch((error) => { console.error(error); process.exit(1) })
