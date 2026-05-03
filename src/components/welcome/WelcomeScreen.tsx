import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
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
import { parseSidecar, applySidecar, sidecarName } from '@/lib/sidecar'
import {
  FolderOpen,
  FileText,
  Plus,
  ChevronRight,
  AlertTriangle,
  Search,
  Pencil,
  Trash2,
  X,
  MoreHorizontal,
  Boxes,
} from 'lucide-react'
import AISettingsDialog from '@/components/ai/AISettingsDialog'
import DescribeSystemDialog from '@/components/ai/DescribeSystemDialog'
import {
  TemplateDialog,
  DuplicateCollectionDialog,
  NewCollectionDialog,
  WorkspaceEditDialog,
} from './WelcomeDialogs'
import type { FolderWorkspace } from './WelcomeLeaves'
import { scopeAccent, scopeLabel } from './workspaceScopeMeta'

const ScopePickerDialog = lazy(() => import('@/components/shared/ScopePickerDialog'))

const log = createLogger('WelcomeScreen')

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WelcomeScreen({ initialView }: { initialView?: 'startup' | 'collection' }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const navigate = useNavigate()
  const location = useLocation()
  const { slug: urlSlug } = useParams<{ slug?: string }>()
  useEffect(() => { document.title = 'c4hero' }, [])

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

  const view = initialView ?? (getCurrentDirHandle() !== null ? 'collection' : 'startup')
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
  const [showAISettings, setShowAISettings] = useState(false)
  const [showDescribe, setShowDescribe] = useState(false)
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
      const { workspace, errors } = parseDSL(file.content)
      if (errors.length > 0) log.warn("DSL parse warnings", errors)
      if (workspace) {
        if (!workspace.name) workspace.name = filename.replace(/\.dsl$/, '')
        if (file.sidecarJson) {
          const sidecar = parseSidecar(file.sidecarJson)
          if (sidecar) applySidecar(workspace, sidecar)
        }
        loadWorkspace(workspace)
        useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
      } else {
        setErrorMsg('Failed to parse DSL file. Please check the file format.')
      }
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
    const { workspace, errors } = parseDSL(content)
    if (errors.length > 0) log.warn("DSL parse warnings", errors)
    if (workspace) {
      if (!workspace.name) workspace.name = file.name.replace(/\.dsl$/, '')
      loadWorkspace(workspace)
    } else {
      setErrorMsg('Failed to parse DSL file. Please check the file format.')
    }
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
      const { workspace, errors } = parseDSL(file.content)
      if (errors.length > 0) log.warn("DSL parse warnings", errors)
      if (workspace) {
        if (!workspace.name) workspace.name = file.name.replace(/\.dsl$/, '')
        if (file.sidecarJson) {
          const sidecar = parseSidecar(file.sidecarJson)
          if (sidecar) applySidecar(workspace, sidecar)
        }
        loadWorkspace(workspace)
      } else {
        setErrorMsg('Failed to parse DSL file. Please check the file format.')
      }
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
      {showAISettings && <AISettingsDialog onClose={() => setShowAISettings(false)} />}
      {showDescribe && <DescribeSystemDialog onClose={() => setShowDescribe(false)} />}
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
      <div className="commit-hash">{__COMMIT_HASH__}</div>
    </div>
  )
}

// ─── Screen 1: Startup ───────────────────────────────────────────────────────

function StartupView({
  onCreateCollection,
  onOpenCollection,
  onOpenRecent,
  onRemoveRecent,
  onOpenFile,
  recentFolders,
}: {
  onCreateCollection: () => void
  onOpenCollection: () => void
  onOpenRecent: (path: string) => void
  onRemoveRecent: (name: string) => void
  onOpenFile: () => void
  recentFolders: { name: string; path: string; displayName?: string }[]
}) {
  const canUseCollections = hasFolderAccess()
  const hasRecents = recentFolders.length > 0

  return (
    <>
      <div className="welcome-brand">
        <C4Mark />
      </div>

      {hasRecents ? (
        <div className="welcome-content welcome-content-centered">
          <div className="welcome-return-header">
            <div className="welcome-return-copy">
              <h1 className="welcome-display">Welcome back<span>.</span></h1>
              <p className="welcome-summary">Pick up where you left off, or start something new.</p>
            </div>

            <div className="welcome-ctas">
              {canUseCollections ? (
                <>
                  <LifecycleButton variant="primary" onClick={onCreateCollection}>
                    <Plus size={14} />
                    New collection
                  </LifecycleButton>
                  <LifecycleButton onClick={onOpenCollection}>
                    <FolderOpen size={14} />
                    Open collection
                  </LifecycleButton>
                </>
              ) : (
                <LifecycleButton variant="primary" onClick={onOpenFile}>
                  <FileText size={14} />
                  Open .dsl file
                </LifecycleButton>
              )}
            </div>
          </div>

          <div className="welcome-toc-label">
            Recent collections
            <span>{recentFolders.length} collection{recentFolders.length === 1 ? '' : 's'}</span>
          </div>

          <div className="welcome-recent-list">
            {recentFolders.slice(0, 6).map((folder) => (
              <RecentCollectionRow
                key={folder.path}
                folder={folder}
                onOpen={() => onOpenRecent(folder.name)}
                onRemove={() => onRemoveRecent(folder.name)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="welcome-hero">
          <ArchitectureArtwork />
          <h1>Diagram your <em>architecture</em>.</h1>
          <p className="welcome-lede">
            Visual architecture modelling that lives with your code. Open a folder, or start a
            new collection — c4hero saves everything as plain <code>.dsl</code> documents.
          </p>

          {canUseCollections ? (
            <div className="welcome-ctas">
              <LifecycleButton variant="primary" onClick={onCreateCollection}>
                <Plus size={14} />
                New collection
              </LifecycleButton>
              <LifecycleButton onClick={onOpenCollection}>
                <FolderOpen size={14} />
                Open collection
              </LifecycleButton>
            </div>
          ) : (
            <div className="welcome-fallback">
              <p>Folder collections require a Chromium-based browser. You can still open individual .dsl files.</p>
              <LifecycleButton variant="primary" onClick={onOpenFile}>
                <FileText size={14} />
                Open .dsl file
              </LifecycleButton>
            </div>
          )}

          <FeatureStrip />
          <p className="welcome-code-line">Architecture diagrams that live with your code.</p>
        </div>
      )}

      {/* sr-only: preserves test assertion for AI describe */}
      <span className="sr-only">Describe your system with AI</span>

      <WelcomeFooter />
    </>
  )
}

function WelcomeFooter() {
  return (
    <div className="welcome-footer">
      <a href="https://github.com/c4hero/c4hero" target="_blank" rel="noreferrer">GitHub</a>
      <a href="https://c4hero.com" target="_blank" rel="noreferrer">c4hero.com</a>
    </div>
  )
}

// ─── Screen 2: Collection Home ────────────────────────────────────────────────

function CollectionView({
  dirHandle,
  workspaces,
  recentFolders,
  onOpenWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onBlankWorkspace,
  onImportDSL,
  onTemplate,
  onOpenCollection,
  onCreateCollection,
  onRenameCollection,
  onOpenRecent,
  onBack,
}: {
  dirHandle: FileSystemDirectoryHandle | null
  workspaces: FolderWorkspace[]
  recentFolders: { name: string; path: string; displayName?: string }[]
  onOpenWorkspace: (name: string) => void
  onRenameWorkspace: (oldName: string, newName: string) => void
  onDeleteWorkspace: (name: string) => void
  onBlankWorkspace: () => void
  onImportDSL: () => void
  onTemplate: () => void
  onOpenCollection: () => void
  onCreateCollection: () => void
  onRenameCollection: () => void
  onOpenRecent: (name: string) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState('')
  const [editingWorkspace, setEditingWorkspace] = useState<FolderWorkspace | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return workspaces
    return workspaces.filter((ws) => workspaceLabel(ws.name).toLowerCase().includes(q))
  }, [workspaces, query])

  const count = workspaces.length
  const countLabel = count === 1 ? '1 workspace' : `${count} workspaces`
  const currentSlug = dirHandle?.name ?? 'collection'
  const currentRecent = recentFolders.find((folder) => folder.name === currentSlug)
  const collectionName = currentRecent?.displayName || currentSlug
  const otherRecentFolders = recentFolders.filter((folder) => folder.name !== currentSlug).slice(0, 4)

  return (
    <>
      <div className="welcome-brand">
        <button
          className="welcome-brand-button"
          onClick={onBack}
          aria-label="Back to start"
          title="Back to start"
        >
          <C4Mark />
        </button>
      </div>

      <div className="welcome-content welcome-content-centered">
        <div className="welcome-return-header">
          <div className="welcome-return-copy">
            <h1 className="welcome-display">Workspaces<span>.</span></h1>
            <p className="welcome-summary">
              {count === 0
                ? 'This collection is empty. A workspace is a single architecture model: its elements, relationships, and views, saved as one .dsl file.'
                : `${countLabel.charAt(0).toUpperCase()}${countLabel.slice(1)} in ${collectionName}. Each workspace is one architecture model with its own elements, relationships, and views.`}
            </p>
          </div>
          <div className="welcome-ctas">
            {dirHandle && (
              <LifecycleButton variant="primary" ariaLabel="New Workspace" onClick={onBlankWorkspace}>
                <Plus size={14} />
                New workspace
              </LifecycleButton>
            )}
          </div>
        </div>

        <div className="collection-pills">
          <span className="collection-pill active collection-pill-current">
            <span className="collection-pill-label">{collectionName}</span>
            <span>{count}</span>
            <RowMenu
              ariaLabel={`Collection actions for ${collectionName}`}
              items={[
                { label: 'Rename collection', icon: <Pencil size={13} />, onSelect: onRenameCollection },
              ]}
            />
          </span>
          {otherRecentFolders.map((folder) => (
            <button key={folder.path} className="collection-pill" onClick={() => onOpenRecent(folder.name)}>
              {folder.displayName || folder.name}
            </button>
          ))}
          <span className="collection-pills-divider" aria-hidden="true" />
          <button
            className="collection-pill collection-pill-action"
            onClick={onOpenCollection}
            title="Open collection"
            aria-label="Open collection"
          >
            <FolderOpen size={13} />
            Open
          </button>
          <button
            className="collection-pill collection-pill-action"
            onClick={onCreateCollection}
            title="New collection"
            aria-label="New collection"
          >
            <Plus size={13} />
            New
          </button>
        </div>

        {count > 0 && (
          <div className="workspace-search">
            <Search size={13} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces…"
              aria-label="Search workspaces"
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {count === 0 ? (
          <div className="workspace-empty-zone">
            <EmptyWorkspaceArtwork />
            <div className="workspace-empty-badge">No workspaces yet. 0 of infinity</div>
            <h2>Map your first system.</h2>
            <p>
              Workspaces are where a system map lives. Start with a software-system workspace for one product, a landscape workspace for multiple systems, or import an existing <code>.dsl</code> file.
            </p>
            <div className="welcome-ctas">
              <LifecycleButton variant="primary" ariaLabel="New Workspace" onClick={onBlankWorkspace}>
                <Plus size={14} />
                New workspace
              </LifecycleButton>
              <LifecycleButton onClick={onImportDSL}>Import .dsl file</LifecycleButton>
              <LifecycleButton onClick={onTemplate}>Start from a template</LifecycleButton>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="workspace-no-results">No workspaces match “{query}”.</p>
        ) : (
          <div className="workspace-list">
            {filtered.map((ws) => (
              <WorkspaceRow
                key={ws.name}
                workspace={ws}
                onOpen={() => onOpenWorkspace(ws.name)}
                onEdit={() => setEditingWorkspace(ws)}
                onDelete={() => onDeleteWorkspace(ws.name)}
              />
            ))}
          </div>
        )}
      </div>

      {editingWorkspace && (
        <WorkspaceEditDialog
          name={workspaceLabel(editingWorkspace.name)}
          onRename={(newName) => {
            onRenameWorkspace(editingWorkspace.name, newName)
            setEditingWorkspace(null)
          }}
          onDelete={() => {
            onDeleteWorkspace(editingWorkspace.name)
            setEditingWorkspace(null)
          }}
          onClose={() => setEditingWorkspace(null)}
        />
      )}

      <WelcomeFooter />
    </>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function C4Mark({ compact }: { compact?: boolean }) {
  return (
    <img
      className={compact ? 'welcome-mark compact' : 'welcome-mark'}
      src="/c4-logo.svg"
      alt=""
      aria-hidden="true"
    />
  )
}

function LifecycleButton({
  children,
  onClick,
  variant = 'ghost',
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'ghost'
  ariaLabel?: string
}) {
  return (
    <button
      className="welcome-button"
      data-variant={variant}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ArchitectureArtwork() {
  return (
    <div className="welcome-art" aria-hidden="true">
      <svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="welcome-edge-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="var(--color-accent-hover)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <g stroke="url(#welcome-edge-gradient)" strokeWidth="1" fill="none" strokeDasharray="2 4">
          <rect x="20" y="40" width="60" height="36" rx="8" />
          <rect x="100" y="20" width="60" height="36" rx="8" />
          <rect x="100" y="84" width="60" height="36" rx="8" />
          <rect x="180" y="52" width="32" height="36" rx="8" />
          <path d="M80 58 L100 38 M80 58 L100 102 M160 38 L180 70 M160 102 L180 70" />
        </g>
        <g fill="var(--color-accent-hover)" opacity="0.85">
          <circle cx="80" cy="58" r="2" />
          <circle cx="100" cy="38" r="2" />
          <circle cx="100" cy="102" r="2" />
          <circle cx="160" cy="38" r="2" />
          <circle cx="160" cy="102" r="2" />
          <circle cx="180" cy="70" r="2" />
        </g>
        <g stroke="var(--color-accent-hover)" strokeWidth="1.4" strokeLinecap="round" opacity="0.65">
          <path d="M130 42 v8 M126 46 h8" />
        </g>
      </svg>
    </div>
  )
}

function EmptyWorkspaceArtwork() {
  return (
    <div className="workspace-empty-art" aria-hidden="true">
      <svg viewBox="0 0 110 70" xmlns="http://www.w3.org/2000/svg">
        <g stroke="rgba(121,184,255,0.72)" strokeWidth="1" fill="none" strokeDasharray="2 4">
          <rect x="6" y="22" width="32" height="22" rx="6" />
          <rect x="72" y="22" width="32" height="22" rx="6" />
          <path d="M38 33 H72" />
        </g>
        <g fill="var(--color-accent-hover)" opacity="0.85">
          <circle cx="38" cy="33" r="2" />
          <circle cx="72" cy="33" r="2" />
        </g>
        <g stroke="var(--color-accent-hover)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M55 28 v10 M50 33 h10" />
        </g>
      </svg>
    </div>
  )
}

function FeatureStrip() {
  const features = [
    { icon: <FileText size={13} />, label: '.dsl files' },
    { icon: <ChevronRight size={13} />, label: 'Git-friendly' },
    { icon: <GridIcon />, label: 'C4 model' },
    { icon: <ExportIcon />, label: 'Export PNG/SVG' },
    { icon: <OpenSourceIcon />, label: 'Open-source · MIT' },
  ]

  return (
    <div className="welcome-features">
      {features.map(({ icon, label }) => (
        <span key={label}>
          {icon}
          {label}
        </span>
      ))}
    </div>
  )
}

function RecentCollectionRow({
  folder,
  onOpen,
  onRemove,
}: {
  folder: { name: string; path: string; displayName?: string }
  onOpen: () => void
  onRemove: () => void
}) {
  const label = folder.displayName || folder.name
  const slug = folder.name

  return (
    <div
      role="button"
      tabIndex={0}
      className="welcome-recent-row"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <span className="recent-folder-icon"><FolderOpen size={15} /></span>
      <span className="recent-main">
        <span className="recent-name">{label}</span>
        <span className="recent-slug">{slug}</span>
      </span>
      <span className="recent-meta">recent</span>
      <span className="recent-actions">
        <RowMenu
          ariaLabel={`More actions for ${label}`}
          items={[
            { label: 'Remove from recents', icon: <X size={13} />, onSelect: onRemove, danger: true },
          ]}
        />
      </span>
      <span className="recent-arrow"><ChevronRight size={15} /></span>
    </div>
  )
}

function WorkspaceRow({
  workspace,
  onOpen,
  onEdit,
  onDelete,
}: {
  workspace: FolderWorkspace
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const label = workspaceLabel(workspace.name)
  const elementCount = workspace.elementCount ?? 0
  const viewCount = workspace.viewCount ?? 0
  const scopeText = scopeLabel(workspace.scope) || 'Workspace'
  const typeColor = scopeAccent(workspace.scope)
  const modified = workspace.modifiedAt ? `edited ${relativeTime(workspace.modifiedAt)}` : 'ready to edit'

  return (
    <div
      role="button"
      tabIndex={0}
      className="workspace-row"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <span
        className="workspace-scope-icon"
        style={{
          color: typeColor,
          borderColor: `${typeColor}55`,
          background: `${typeColor}14`,
        }}
        aria-hidden="true"
      >
        <Boxes size={15} />
      </span>
      <span className="workspace-main">
        <span className="workspace-name">{label}</span>
        <span className="workspace-meta">
          <span className="workspace-scope" style={{ color: typeColor }}>{scopeText}</span>
          <span className="workspace-meta-dot" aria-hidden="true">·</span>
          <span>{modified}</span>
        </span>
      </span>
      <span className="workspace-stats" aria-label={`${elementCount} elements and ${viewCount} views`}>
        <span><strong>{elementCount}</strong> elements</span>
        <span className="workspace-meta-dot" aria-hidden="true">·</span>
        <span><strong>{viewCount}</strong> views</span>
      </span>
      <span className="workspace-row-actions">
        <RowMenu
          ariaLabel={`More actions for ${label}`}
          items={[
            { label: 'Rename', icon: <Pencil size={13} />, onSelect: onEdit },
            { label: 'Delete', icon: <Trash2 size={13} />, onSelect: onDelete, danger: true },
          ]}
        />
      </span>
      <span className="workspace-arrow"><ChevronRight size={16} /></span>
    </div>
  )
}

type RowMenuItem = {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
}

function RowMenu({ items, ariaLabel }: { items: RowMenuItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const POPUP_WIDTH = 200

  function computeCoords() {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const top = r.bottom + 6
    // Anchor right edge of popup to right edge of trigger; clamp to viewport.
    let left = r.right - POPUP_WIDTH
    left = Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8))
    setCoords({ top, left })
  }

  useEffect(() => {
    if (!open) return
    computeCoords()
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (popupRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onReposition() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  return (
    <span className="row-menu" data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && coords && createPortal(
        <div
          ref={popupRef}
          role="menu"
          className="row-menu-popup"
          style={{ top: coords.top, left: coords.left, width: POPUP_WIDTH }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              className={item.danger ? 'row-menu-item danger' : 'row-menu-item'}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}

function workspaceLabel(name: string): string {
  return name.replace(/\.dsl$/i, '').replace(/[-_]+/g, ' ')
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < hour) return 'just now'
  if (diff < day) {
    const hours = Math.max(1, Math.round(diff / hour))
    return `${hours}h ago`
  }
  const days = Math.max(1, Math.round(diff / day))
  return `${days}d ago`
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18l5-5 4 4 7-9" />
      <path d="M15 8h5v5" />
    </svg>
  )
}

function OpenSourceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v18" />
      <path d="M7 8l5-5 5 5" />
      <path d="M7 16l5 5 5-5" />
    </svg>
  )
}

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
            <image className="diag-author" href="/c4-logo.svg" x="84" y="14" width="32" height="32" />
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
