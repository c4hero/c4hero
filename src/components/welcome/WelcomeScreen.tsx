import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useWorkspaceStore } from '@/store/workspace'
import type { WorkspaceScope } from '@/types/model'
import { createBigBankSample, createBlankWorkspace } from '@/lib/templates'
import { openDSLFile, hasFileSystemAccess, isWorkspaceShape, readTextFileWithLimit } from '@/lib/fileIO'
import { createLogger } from '@/lib/logger'
import {
  openFolder,
  readDSLFile,
  writeDSLFile,
  hasFolderAccess,
  getCurrentDirHandle,
  restoreDirHandleByName,
  initCollectionSettings,
  readCollectionSettings,
  writeCollectionSettings,
  slugifyName,
  folderExists,
} from '@/lib/folderIO'
import { getRecentFolders, addRecentFolder, pruneRecentFolders, removeRecentFolder } from '@/lib/fileIO'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { sidecarName } from '@/lib/sidecar'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { AlertTriangle } from 'lucide-react'
import {
  TemplateDialog,
  DuplicateCollectionDialog,
  NewCollectionDialog,
} from './WelcomeDialogs'
import type { FolderWorkspace } from './WelcomeLeaves'
import StartupView from './StartupView'
import CollectionView from './CollectionView'

const ScopePickerDialog = lazy(() => import('@/components/shared/ScopePickerDialog'))

const log = createLogger('WelcomeScreen')

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WelcomeScreen({ initialView }: { initialView?: 'startup' | 'collection' }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const navigate = useNavigate()
  const location = useLocation()
  const { slug: urlSlug } = useParams<{ slug?: string }>()
  // Title reflects which view of the welcome screen is active. The active
  // view is derived later in this component (`view` + `urlSlug`); we re-run
  // the effect whenever those change so navigating between startup and
  // collection updates the tab title.

  // Auto-open scope picker when navigated here with ?new=1
  useEffect(() => {
    if (location.search.includes('new=1')) {
      setShowScopePicker(true)
      const dirHandle = getCurrentDirHandle()
      navigate(dirHandle ? `/collection/${dirHandle.name}` : '/collection', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  // If we have a slug in URL but no dir handle, try to restore
  useEffect(() => {
    if (urlSlug && !getCurrentDirHandle()) {
      restoreDirHandleByName(urlSlug).then(async (handle) => {
        if (handle) {
          setFolderWorkspaces(await listCurrentDSLFiles())
        } else {
          navigate('/', { replace: true })
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSlug])

  const view = !hasFolderAccess()
    ? 'startup'
    : initialView ?? (getCurrentDirHandle() !== null ? 'collection' : 'startup')

  // Set the browser tab title based on which view of the welcome screen is
  // active. Collection view tries to surface the friendly collection name
  // from recent folders; falls back to the URL slug.
  useEffect(() => {
    if (view === 'collection') {
      const friendly = getRecentFolders().find((f) => f.name === urlSlug)?.displayName
      const label = friendly ?? urlSlug ?? 'Collection'
      document.title = `${label} · Workspaces · c4hero`
    } else {
      document.title = 'c4hero — visual architecture modelling'
    }
  }, [view, urlSlug])
  function setView(v: 'startup' | 'collection', slug?: string) {
    if (v === 'collection') {
      const s = slug ?? getCurrentDirHandle()?.name ?? urlSlug ?? ''
      navigate(s ? `/collection/${s}` : '/collection', { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }
  const [folderWorkspaces, setFolderWorkspaces] = useState<FolderWorkspace[]>([])

  const [showScopePicker, setShowScopePicker] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('My Architecture')
  const [renameCollection, setRenameCollection] = useState<{ slug: string; name: string } | null>(null)
  const [loadingCollection, setLoadingCollection] = useState<string | null>(null)
  const [loadingWorkspace, setLoadingWorkspace] = useState<string | null>(null)
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ slug: string; displayName: string; parentHandle: FileSystemDirectoryHandle } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const jsonInputRef = useRef<HTMLInputElement>(null)
  const dslInputRef = useRef<HTMLInputElement>(null)

  // Load workspace list when entering collection view
  useEffect(() => {
    if (view === 'collection') {
      const dir = getCurrentDirHandle()
      if (dir) {
        listCurrentDSLFiles().then(setFolderWorkspaces)
      }
    }
  }, [view])

  async function listCurrentDSLFiles(): Promise<FolderWorkspace[]> {
    const dir = getCurrentDirHandle()
    if (!dir) return []
    const files: FolderWorkspace[] = []
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'file' && name.toLowerCase().endsWith('.dsl')) {
        let modifiedAt: number | undefined
        let scope: string | undefined
        let elementCount = 0
        let viewCount = 0
        try {
          const fh = await dir.getFileHandle(name)
          const f = await fh.getFile()
          modifiedAt = f.lastModified
	          const content = await readTextFileWithLimit(f, 'DSL file')
          const { workspace: ws } = parseDSL(content)
          if (ws) {
            scope = ws.scope
            elementCount += ws.model.people.length
            for (const s of ws.model.softwareSystems) {
              elementCount += 1
              for (const c of s.containers) {
                elementCount += 1 + c.components.length
              }
            }
            viewCount = ws.views.systemLandscapeViews.length
              + ws.views.systemContextViews.length
              + ws.views.containerViews.length
              + ws.views.componentViews.length
          }
        } catch (err) { log.warn('Failed to parse DSL metadata for file listing', err) }
        files.push({ name, modifiedAt, scope, elementCount, viewCount })
      }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name))
  }

  // ── Open folder helper ──────────────────────────────────────────────

  async function openFolderAndTransition() {
    const result = await openFolder()
    if (!result) return
    setLoadingCollection(result.dirHandle.name)
    try {
      const settings = await initCollectionSettings(result.dirHandle.name)
      addRecentFolder({ name: result.dirHandle.name, path: result.dirHandle.name, displayName: settings.name })
      setRecentFolders(getRecentFolders())
      setFolderWorkspaces(await listCurrentDSLFiles())
      setView('collection')
    } finally {
      setLoadingCollection(null)
    }
  }

  // ── Screen 1 handlers ───────────────────────────────────────────────

  async function commitCreateCollection(displayName: string) {
    setShowNewCollection(false)
    const slug = slugifyName(displayName)
    if (!slug) return

    let parentHandle: FileSystemDirectoryHandle
    try {
      parentHandle = await (window as Window & typeof globalThis & { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' })
    } catch {
      return // cancelled
    }

    const exists = await folderExists(parentHandle, slug)
    if (exists) {
      setDuplicateConfirm({ slug, displayName, parentHandle })
      return
    }

    const newDir = await parentHandle.getDirectoryHandle(slug, { create: true })
    const { setDirHandle } = await import('@/lib/folderIO')
    await setDirHandle(newDir)
    const friendlyName = displayName.trim() || slug
    await initCollectionSettings(friendlyName)
    addRecentFolder({ name: newDir.name, path: newDir.name, displayName: friendlyName })
    setRecentFolders(getRecentFolders())
    setFolderWorkspaces(await listCurrentDSLFiles())
    setView('collection')
  }

  async function handleDuplicateConfirmOpen() {
    if (!duplicateConfirm) return
    const { slug, displayName, parentHandle } = duplicateConfirm
    setDuplicateConfirm(null)
    const newDir = await parentHandle.getDirectoryHandle(slug, { create: false })
    const { setDirHandle } = await import('@/lib/folderIO')
    await setDirHandle(newDir)
    const friendlyName = displayName.trim() || slug
    const settings = await initCollectionSettings(friendlyName)
    addRecentFolder({ name: newDir.name, path: newDir.name, displayName: settings.name ?? friendlyName })
    setRecentFolders(getRecentFolders())
    setFolderWorkspaces(await listCurrentDSLFiles())
    setView('collection')
  }

  function handleDuplicateConfirmRename() {
    if (!duplicateConfirm) return
    const { displayName } = duplicateConfirm
    setDuplicateConfirm(null)
    setNewCollectionName(displayName)
    setShowNewCollection(true)
  }

  function handleCreateCollection() {
    setNewCollectionName('My Architecture')
    setShowNewCollection(true)
  }

  async function handleRenameCollection() {
    const dir = getCurrentDirHandle()
    if (!dir) return
    const settings = await readCollectionSettings()
    setRenameCollection({ slug: dir.name, name: settings?.name ?? dir.name })
  }

  async function commitRenameCollection(newName: string) {
    if (!renameCollection) return
    const trimmed = newName.trim()
    if (!trimmed) return
    const existing = (await readCollectionSettings()) ?? {}
    await writeCollectionSettings({ ...existing, name: trimmed })
    addRecentFolder({ name: renameCollection.slug, path: renameCollection.slug, displayName: trimmed })
    setRecentFolders(getRecentFolders())
    setRenameCollection(null)
  }

  const handleOpenCollection = openFolderAndTransition
  function handleRemoveRecent(name: string) {
    removeRecentFolder(name)
    setRecentFolders(prev => prev.filter(f => f.name !== name))
  }

  async function handleOpenRecent(name: string) {
    setLoadingCollection(name)
    try {
      const handle = await restoreDirHandleByName(name)
      if (handle) {
        const settings = await readCollectionSettings()
        addRecentFolder({ name: handle.name, path: handle.name, displayName: settings?.name })
        setRecentFolders(getRecentFolders())
        setFolderWorkspaces(await listCurrentDSLFiles())
        setView('collection')
      } else {
        // Permission revoked — fall back to manual picker
        setLoadingCollection(null)
        openFolderAndTransition()
        return
      }
    } finally {
      setLoadingCollection(null)
    }
  }

  // ── Screen 2 handlers ───────────────────────────────────────────────

  async function handleOpenWorkspace(filename: string) {
    setLoadingWorkspace(filename.replace(/\.dsl$/, ''))
    try {
      const file = await readDSLFile(filename)
      if (!file) return
      const { workspace, errors } = parseWorkspaceDocument({
        content: file.content,
        fallbackName: filename.replace(/\.dsl$/, ''),
        sidecarJson: file.sidecarJson,
      })
      if (errors.length > 0) log.warn("DSL parse warnings", errors)
      loadWorkspace(workspace)
      useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
    } finally {
      setLoadingWorkspace(null)
    }
  }

  function handleDeleteWorkspace(filename: string) {
    useWorkspaceStore.getState().confirmDelete(
      `Delete "${filename}"? This cannot be undone.`,
      async () => {
        // If the workspace being deleted is currently loaded, close it first.
        // This cancels any pending auto-save timer that would otherwise
        // recreate the file after we delete it.
        const store = useWorkspaceStore.getState()
        if (store.activeWorkspaceFilename === filename) {
          store.closeWorkspace()
        }

        const dir = getCurrentDirHandle()
        if (dir) {
          try {
            await dir.removeEntry(filename)
          } catch (err) {
            log.error('removeEntry failed', { filename, err })
            setErrorMsg(`Failed to delete "${filename}". ${(err as Error).message ?? ''}`)
            listCurrentDSLFiles().then(setFolderWorkspaces)
            return
          }
          // Sidecar may or may not exist — ignore NotFoundError
          const sc = sidecarName(filename)
          await dir.removeEntry(sc).catch(() => { /* sidecar didn't exist, that's fine */ })
        }

        // Re-list from disk rather than optimistically filtering, so any
        // files that failed to delete reappear in the UI.
        const fresh = await listCurrentDSLFiles()
        setFolderWorkspaces(fresh)
      }
    )
  }

  async function handleRenameWorkspace(filename: string, newLabel?: string) {
    if (!newLabel) return
    const finalName = `${slugifyName(newLabel) || 'workspace'}.dsl`
    if (finalName === filename) return
    const dir = getCurrentDirHandle()
    if (dir) {
      try {
        const handle = await dir.getFileHandle(filename)
        const file = await handle.getFile()
        const content = await file.text()
        const newHandle = await dir.getFileHandle(finalName, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()
        await dir.removeEntry(filename).catch(() => {})
        // Rename sidecar too
        try {
          const oldSidecar = await dir.getFileHandle(sidecarName(filename))
          const sidecarFile = await oldSidecar.getFile()
          const sidecarContent = await sidecarFile.text()
          const newSidecarHandle = await dir.getFileHandle(sidecarName(finalName), { create: true })
          const sw = await newSidecarHandle.createWritable()
          await sw.write(sidecarContent)
          await sw.close()
          await dir.removeEntry(sidecarName(filename)).catch(() => {})
        } catch { /* no sidecar */ }
      } catch (err) {
        log.error('Rename failed', err)
      }
    }
    setFolderWorkspaces((prev) =>
      prev.map((f) => (f.name === filename ? { ...f, name: finalName } : f))
    )
  }

  function handleBlankWorkspace() {
    setShowScopePicker(true)
  }

  async function handleBlankWorkspaceFromPicker(scope: WorkspaceScope, name: string, openAfter: boolean = true, description: string = '') {
    setShowScopePicker(false)
    const ws = createBlankWorkspace(scope)
    ws.name = name.trim() || 'workspace'
    if (description.trim()) ws.description = description.trim()
    const filename = `${slugifyName(ws.name) || 'workspace'}.dsl`
    const dir = getCurrentDirHandle()
    if (dir) {
      await writeDSLFile(filename, serializeDSL(ws))
      useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
      // Refresh the workspace list with stats
      listCurrentDSLFiles().then(setFolderWorkspaces)
    }
    if (openAfter) {
      loadWorkspace(ws)
    }
  }

  async function handleTemplateSelect(
    ws: ReturnType<typeof createBigBankSample>,
    filename: string
  ) {
    setShowTemplates(false)
    await writeDSLFile(filename, serializeDSL(ws))
    loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
  }

	async function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
	  const file = e.target.files?.[0]
	  e.target.value = ''
	  if (!file) return
	  try {
	    const text = await readTextFileWithLimit(file, 'Workspace JSON file')
	    const parsed = JSON.parse(text)
	    if (!isWorkspaceShape(parsed)) {
	      setErrorMsg('Invalid workspace file. The JSON does not have the expected workspace structure.')
	      return
	    }
	    // Write to folder if open
	    const filename = file.name.replace(/\.json$/i, '.dsl')
	    await writeDSLFile(filename, serializeDSL(parsed))
	    loadWorkspace(parsed)
	    useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
	  } catch (err) {
	    setErrorMsg(err instanceof Error ? err.message : 'Failed to parse JSON file. Please check the file format.')
	  }
	}

  async function handleDSLInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
	  let content: string
	  try {
	    content = await readTextFileWithLimit(file, 'DSL file')
	  } catch (err) {
	    setErrorMsg(err instanceof Error ? err.message : 'Failed to read DSL file.')
	    return
	  }
    const { workspace, errors } = parseWorkspaceDocument({
      content,
      fallbackName: file.name.replace(/\.dsl$/, ''),
    })
    if (errors.length > 0) log.warn("DSL parse warnings", errors)
    loadWorkspace(workspace)
  }

  async function handleOpenFile() {
    if (!hasFileSystemAccess()) {
      dslInputRef.current?.click()
      return
    }
    const file = await openDSLFile()
    if (!file) return
    setLoadingWorkspace(file.name.replace(/\.dsl$/, ''))
    try {
      const { workspace, errors } = parseWorkspaceDocument({
        content: file.content,
        fallbackName: file.name.replace(/\.dsl$/, ''),
        sidecarJson: file.sidecarJson,
      })
      if (errors.length > 0) log.warn("DSL parse warnings", errors)
      loadWorkspace(workspace)
    } finally {
      setLoadingWorkspace(null)
    }
  }

  const dirHandle = getCurrentDirHandle()
  const [recentFolders, setRecentFolders] = useState(getRecentFolders)

  // On mount: filter out recents whose IDB handle no longer exists
  useEffect(() => {
    import('@/lib/folderIO').then(({ filterValidRecentFolders }) => {
      const all = getRecentFolders()
      filterValidRecentFolders(all.map(f => f.name)).then(validNames => {
        const validSet = new Set(validNames)
        const filtered = all.filter(f => validSet.has(f.name))
        if (filtered.length !== all.length) {
          pruneRecentFolders(validNames)
          setRecentFolders(filtered)
        }
      })
    })
  }, [])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="welcome-page"
    >
      <div className="welcome-stage">
        {/* Error banner */}
        {errorMsg && (
          <div
            role="alert"
            className="welcome-error"
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs underline"
              style={{ color: 'var(--color-error)', flexShrink: 0 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {view === 'startup' ? (
          <StartupView
            onCreateCollection={handleCreateCollection}
            onOpenCollection={handleOpenCollection}
            onOpenRecent={handleOpenRecent}
            onRemoveRecent={handleRemoveRecent}
            onOpenFile={handleOpenFile}
            recentFolders={recentFolders}
          />
        ) : (
          <CollectionView
            dirHandle={dirHandle}
            workspaces={folderWorkspaces}
            recentFolders={recentFolders}
            onOpenWorkspace={handleOpenWorkspace}
            onRenameWorkspace={handleRenameWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onBlankWorkspace={handleBlankWorkspace}
            onImportDSL={handleOpenFile}
            onTemplate={() => setShowTemplates(true)}
            onOpenCollection={handleOpenCollection}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={handleRenameCollection}
            onOpenRecent={handleOpenRecent}
            onBack={() => setView('startup')}
          />
        )}

        {/* Hidden file inputs — must live in DOM for Android Chrome gesture handling */}
        <input
          ref={dslInputRef}
          type="file"
          accept=".dsl,.txt"
          className="hidden"
          onChange={handleDSLInputChange}
        />
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportJSON}
        />
      </div>

      {showNewCollection && (
        <NewCollectionDialog
          value={newCollectionName}
          onChange={setNewCollectionName}
          onConfirm={() => commitCreateCollection(newCollectionName)}
          onCancel={() => setShowNewCollection(false)}
        />
      )}
      {renameCollection && (
        <NewCollectionDialog
          title="Rename collection"
          description="Update the collection's display name. The folder name on disk stays the same."
          confirmLabel="Save"
          showSlug={false}
          value={renameCollection.name}
          onChange={(v) => setRenameCollection((r) => (r ? { ...r, name: v } : r))}
          onConfirm={() => commitRenameCollection(renameCollection.name)}
          onCancel={() => setRenameCollection(null)}
        />
      )}
      {duplicateConfirm && (
        <DuplicateCollectionDialog
          slug={duplicateConfirm.slug}
          onOpen={handleDuplicateConfirmOpen}
          onRename={handleDuplicateConfirmRename}
          onCancel={() => setDuplicateConfirm(null)}
        />
      )}
      {showScopePicker && (
        <Suspense fallback={null}>
          <ScopePickerDialog
            onConfirm={handleBlankWorkspaceFromPicker}
            onCancel={() => setShowScopePicker(false)}
          />
        </Suspense>
      )}
      {showTemplates && (
        <TemplateDialog
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplates(false)}
        />
      )}
      {(loadingCollection || loadingWorkspace) && (
        <CollectionLoadingOverlay
          name={loadingWorkspace ?? loadingCollection ?? ''}
          kind={loadingWorkspace ? 'workspace' : 'collection'}
        />
      )}
      <div className="commit-hash">v{__APP_VERSION__} · {__COMMIT_HASH__}</div>
    </div>
  )
}

// Screens extracted: ./StartupView.tsx, ./CollectionView.tsx
// Atoms extracted: ./WelcomeAtoms.tsx, ./RowMenu.tsx

const LOADING_MESSAGES = [
  'Sketching boxes…',
  'Drawing edges…',
  'Wiring up containers…',
  'Placing components…',
  'Connecting the dots…',
  'Reading the .dsl files…',
  'Plotting your architecture…',
  'Untangling dependencies…',
]

function CollectionLoadingOverlay({ name, kind = 'collection' }: { name: string; kind?: 'collection' | 'workspace' }) {
  const [messageIndex, setMessageIndex] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length))
  useEffect(() => {
    const id = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length)
    }, 1800)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="collection-loading" role="status" aria-live="polite">
      <div className="collection-loading-card">
        <div className="collection-loading-stage" aria-hidden="true">
          <svg viewBox="0 0 200 120" width="200" height="120">
            {/* Two boxes with an edge drawing between them, the c4 mark
                resting beside as the author's signature. */}
            <g stroke="var(--color-accent)" fill="none" strokeLinecap="round">
              <rect className="diag-box diag-box-1"
                    x="24" y="46" width="44" height="28" rx="5" strokeWidth="1.6" />
              <rect className="diag-box diag-box-2"
                    x="124" y="46" width="44" height="28" rx="5" strokeWidth="1.6" />
              <line className="diag-edge"
                    x1="68" y1="60" x2="124" y2="60" strokeWidth="1.6" />
            </g>
            <image className="diag-author" href="/c4-logo.png" x="84" y="14" width="32" height="32" />
          </svg>
        </div>

        <div className="collection-loading-copy">
          <span className="collection-loading-title">Opening {kind}</span>
          <span className="collection-loading-subtitle">{name}</span>
          <span key={messageIndex} className="collection-loading-status">
            {LOADING_MESSAGES[messageIndex]}
          </span>
        </div>
      </div>
    </div>
  )
}
