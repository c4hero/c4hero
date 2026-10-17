export type { HostFile, HostFolder, HostFs } from './types'
export type * from './protocol'
export { webFsaHost } from './webFsa'
export {
  createVsCodeHostFs, isVsCodeHost, postHostMessage, replaceVsCodeDocument, requestVsCodeInit,
  runVsCodeHistoryCommand, saveVsCodeDocument, setVsCodeSecret,
  subscribeHostMessages, vscodeHost,
} from './vscodeHost'

// Compatibility surface while callers migrate from handle-shaped browser APIs.
// Keeping it here makes host selection a single import boundary with no browser
// behaviour change.
export * from '../fileIO'
export * from '../folderIO'
