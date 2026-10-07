import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { useAiSettingsStore } from '@/store/ai-settings'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { createSnapshotProjector } from '@/lib/host/documentSnapshot'
import { createDocumentSync } from '@/lib/host/vscodeSync'
import { useHostStatus, reportHostError } from '@/lib/host/status'
import {
  isVsCodeHost, postHostMessage, replaceVsCodeDocument, requestVsCodeInit,
  setDocumentFlusher, subscribeHostMessages, vscodeHost,
  type DocumentSnapshot, type VsCodeInitPayload,
} from '@/lib/host'

export function useVsCodeHost() {
  useEffect(() => {
    if (!isVsCodeHost()) return
    let disposed = false
    let applying = false
    let loadGeneration = 0
    let sync: ReturnType<typeof createDocumentSync> | undefined
    let project: ReturnType<typeof createSnapshotProjector> | undefined
    let projectionError: string | null = null
    let lastWorkspace = useWorkspaceStore.getState().workspace
    let init: VsCodeInitPayload | undefined
    let mountedObserver: MutationObserver | undefined
    let mountedTimer: ReturnType<typeof setTimeout> | undefined

    async function receive(snapshot: DocumentSnapshot, revision: number, initial = false) {
      const generation = ++loadGeneration
      // Suspend outbound edits while the document being displayed is changing.
      project = undefined
      // Invalidate queued edits immediately, even while asynchronous include
      // reads are still preparing the replacement workspace.
      sync?.receive(snapshot, revision)
      const texts = { ...snapshot.includes }
      const loaded = await loadWorkspaceDocument({
        ...snapshot,
        fallbackName: init?.name.replace(/\.dsl$/i, ''),
        readInclude: async (path) => {
          if (path in texts) return texts[path]
          const uri = new URL(path.split('/').map(encodeURIComponent).join('/'), `${init!.folderUri.replace(/\/$/, '')}/`).toString()
          const text = await vscodeHost.read(uri)
          if (text !== null) texts[path] = text
          return text
        },
      })
      if (disposed || generation !== loadGeneration) return
      if (loaded.errors.length) throw new Error(`Fix the DSL in VS Code to resume editing: ${loaded.errors.map(e => e.message).join('; ')}`)
      const source = { ...snapshot, includes: texts }
      applying = true
      try {
        const store = useWorkspaceStore.getState()
        if (initial) store.loadWorkspace(loaded.workspace)
        else store.reloadWorkspaceFromDisk(loaded.workspace)
        store.setActiveWorkspaceFilename(init!.name)
        lastWorkspace = useWorkspaceStore.getState().workspace
        project = createSnapshotProjector(lastWorkspace!, source)
        const baseline = project(lastWorkspace!)
        if (sync) sync.receive(baseline, revision)
        else sync = createDocumentSync(baseline, revision, replaceVsCodeDocument)
        useHostStatus.setState({ loading: false, error: null })
        projectionError = null
      } finally { applying = false }
      // The smoke test waits for actual React Flow DOM nodes, not model counts.
      const reportMounted = () => {
        if (disposed) return
        const nodeCount = document.querySelectorAll('.react-flow__node').length
        if (nodeCount) postHostMessage({ type: 'mounted', nodeCount })
      }
      requestAnimationFrame(reportMounted)
      mountedObserver?.disconnect()
      clearTimeout(mountedTimer)
      const observer = new MutationObserver(() => {
        if (document.querySelector('.react-flow__node')) { reportMounted(); observer.disconnect() }
      })
      mountedObserver = observer
      observer.observe(document.body, { childList: true, subtree: true })
      mountedTimer = setTimeout(() => observer.disconnect(), 15000)
    }
    const captureCurrent = (workspace: NonNullable<typeof lastWorkspace>) => {
      const snapshot = project!(workspace)
      if (projectionError && useHostStatus.getState().error === projectionError) {
        useHostStatus.setState({ error: null })
      }
      projectionError = null
      return snapshot
    }
    const sendCurrent = async () => {
      if (!project || !sync) throw new Error('Wait for the workspace to load or fix its DSL before saving')
      const workspace = useWorkspaceStore.getState().workspace
      const snapshot = workspace ? captureCurrent(workspace) : undefined
      if (useHostStatus.getState().error) throw new Error(useHostStatus.getState().error!)
      if (snapshot) await sync.push(snapshot)
      await sync.flush()
    }
    setDocumentFlusher(sendCurrent)
    const unsubscribeStore = useWorkspaceStore.subscribe((state) => {
      if (disposed || applying || !project || !sync || !state.workspace || state.workspace === lastWorkspace) return
      lastWorkspace = state.workspace
      try {
        void sync.push(captureCurrent(state.workspace)).catch(reportHostError)
      } catch (error) {
        projectionError = error instanceof Error ? error.message : String(error)
        useHostStatus.setState({ dirty: true })
        reportHostError(error)
      }
    })
    const unsubscribeMessages = subscribeHostMessages((message) => {
      if (disposed) return
      if (message.type === 'flush') {
        void sendCurrent().then(
          () => postHostMessage({ type: 'flushed', id: message.id }),
          error => postHostMessage({ type: 'flushed', id: message.id, error: error instanceof Error ? error.message : String(error) }),
        )
      } else if (message.type === 'documentChanged' && init) {
        useHostStatus.setState({ dirty: message.dirty })
        void receive(message.snapshot, message.revision).catch(reportHostError)
      } else if (message.type === 'saved') useHostStatus.setState({ dirty: message.dirty })
      else if (message.type === 'secretChanged') useAiSettingsStore.setState((s) => ({ apiKeys: { ...s.apiKeys, [message.provider]: message.value } }))
    })
    void requestVsCodeInit().then(async (payload) => {
      if (disposed) return
      init = payload
      useAiSettingsStore.setState({ apiKeys: payload.apiKeys })
      useHostStatus.setState({ dirty: payload.dirty })
      await receive(payload, payload.revision, true)
    }).catch(reportHostError)
    return () => {
      disposed = true
      sync?.dispose()
      mountedObserver?.disconnect()
      clearTimeout(mountedTimer)
      setDocumentFlusher(undefined)
      unsubscribeStore()
      unsubscribeMessages()
    }
  }, [])
}
