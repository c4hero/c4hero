import { webFsaHost } from './webFsa'
import { isVsCodeHost, vscodeHost } from './vscodeHost'

export function getHostFs() { return isVsCodeHost() ? vscodeHost : webFsaHost }

export type { HostFile, HostFolder, HostFs } from './types'
export type * from './protocol'
export { webFsaHost } from './webFsa'
export {
  createVsCodeHostFs, isVsCodeHost, postHostMessage, replaceVsCodeDocument, requestVsCodeInit,
  runVsCodeHistoryCommand, saveVsCodeDocument, setVsCodeSecret,
  subscribeHostMessages, vscodeHost, setDocumentFlusher, openVsCodeDocument,
} from './vscodeHost'

// Compatibility surface while callers migrate from handle-shaped browser APIs.
// Keeping it here makes host selection a single import boundary with no browser
// behaviour change.
export * from './browserFileIO'
export * from './browserFolderIO'

import * as browserFolder from './browserFolderIO'
/** Whether file references (includes, !docs and !adrs) can be resolved. */
export function hasOpenFolder(): boolean { return isVsCodeHost() || !!browserFolder.getCurrentDirHandle() }
export async function readTextFileAt(path: string): Promise<string | null> {
  if (!isVsCodeHost()) return browserFolder.readTextFileAt(path)
  return (await vscodeHost.openFolder())?.read(path) ?? null
}
export async function writeTextFileAt(path: string, content: string): Promise<boolean> {
  if (!isVsCodeHost()) return browserFolder.writeTextFileAt(path, content)
  const folder = await vscodeHost.openFolder()
  if (!folder) return false
  await folder.write(path, content)
  return true
}
export async function listFilesAt(path: string): Promise<string[] | null> {
  if (!isVsCodeHost()) return browserFolder.listFilesAt(path)
  const folder = await vscodeHost.openFolder()
  if (!folder) return null
  const uri = new URL(path.split('/').map(encodeURIComponent).join('/'), `${folder.uri.replace(/\/$/, '')}/`).toString()
  return vscodeHost.list(uri)
}
