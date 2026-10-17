import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { useAiSettingsStore } from '@/store/ai-settings'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { serializeRoot } from '@/lib/includeWriteback'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { announce } from '@/lib/announce'
import {
  isVsCodeHost, postHostMessage, replaceVsCodeDocument, requestVsCodeInit, subscribeHostMessages, vscodeHost,
} from '@/lib/host'

function childUri(folderUri: string, relativePath: string): string {
  const base = folderUri.endsWith('/') ? folderUri : `${folderUri}/`
  return new URL(relativePath, base).toString()
}

/** Bind the Zustand workspace to a VS Code TextDocument.
 *
 * VS Code owns the text, undo stack, dirty marker and Save. Canvas changes are
 * emitted as document edits; document changes (including undo/redo and external
 * edits) are applied through the same replaceWorkspaceFromDSL path as the code
 * pane, so there is only one DSL-to-model state machine.
 */
export function useVsCodeHost(): void {
  useEffect(() => {
    if (!isVsCodeHost()) return

    let disposed = false
    let applyingHostText = false
    let lastWorkspace = useWorkspaceStore.getState().workspace
    let currentText = ''
    let syncTimer: ReturnType<typeof setTimeout> | null = null

    const unsubscribeMessages = subscribeHostMessages((message) => {
      if (disposed || message.type !== 'documentChanged' || message.content === currentText) return
      applyingHostText = true
      currentText = message.content
      const result = useWorkspaceStore.getState().replaceWorkspaceFromDSL(message.content)
      if (!result.ok) announce(`VS Code edit has ${result.errors.length} DSL error${result.errors.length === 1 ? '' : 's'}`)
      applyingHostText = false
    })

    let unsubscribeStore = () => {}
    void requestVsCodeInit().then(async (payload) => {
      if (disposed) return
      currentText = payload.content
      useAiSettingsStore.setState({ apiKeys: payload.apiKeys })
      const loaded = await loadWorkspaceDocument({
        content: payload.content,
        fallbackName: payload.name.replace(/\.dsl$/i, ''),
        sidecarJson: payload.sidecarJson,
        readInclude: (path) => vscodeHost.read(childUri(payload.folderUri, path)),
      })
      if (disposed) return
      const store = useWorkspaceStore.getState()
      applyingHostText = true
      store.loadWorkspace(loaded.workspace)
      store.setActiveWorkspaceFilename(payload.name)
      store.setLastSavedUndoLength(0)
      applyingHostText = false
      const nodeCount = loaded.workspace.model.people.length
        + loaded.workspace.model.softwareSystems.length
        + loaded.workspace.model.softwareSystems.reduce((count, system) => count + system.containers.length, 0)
      postHostMessage({ type: 'mounted', nodeCount })
      lastWorkspace = useWorkspaceStore.getState().workspace
      if (loaded.errors.length) announce(`Opened with ${loaded.errors.length} DSL error${loaded.errors.length === 1 ? '' : 's'}`)

      unsubscribeStore = useWorkspaceStore.subscribe((state) => {
        if (disposed || applyingHostText || !state.workspace || state.workspace === lastWorkspace) return
        lastWorkspace = state.workspace
        if (syncTimer) clearTimeout(syncTimer)
        syncTimer = setTimeout(() => {
          const latest = useWorkspaceStore.getState().workspace
          if (!latest || disposed) return
          try {
            const content = serializeRoot(latest)
            if (content === currentText) return
            currentText = content
            const sidecar = extractSidecar(latest)
            replaceVsCodeDocument(content, serializeSidecar(sidecar ?? { version: 1 }))
          } catch (error) {
            announce(error instanceof Error ? error.message : 'Unable to update the VS Code document')
          }
        }, 150)
      })
    })

    return () => {
      disposed = true
      if (syncTimer) clearTimeout(syncTimer)
      unsubscribeMessages()
      unsubscribeStore()
    }
  }, [])
}
