import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import {
  createBigBankSample,
  createBlankWorkspace,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
} from '@/lib/templates'
import { openDSLFile, hasFileSystemAccess, isWorkspaceShape } from '@/lib/fileIO'
import {
  openFolder,
  readDSLFile,
  writeDSLFile,
  hasFolderAccess,
  getCurrentDirHandle,
} from '@/lib/folderIO'
import { getRecentFolders, addRecentFolder } from '@/lib/fileIO'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { parseSidecar, applySidecar, sidecarName } from '@/lib/sidecar'
import { getAIConfig } from '@/lib/ai'
import {
  FolderOpen,
  FileText,
  Plus,
  Play,
  Upload,
  Pencil,
  Trash2,
  ChevronRight,
  X,
  AlertTriangle,
  Settings,
  Sparkles,
  Server,
  Box,
  Radio,
} from 'lucide-react'
import AISettingsDialog from '@/components/ai/AISettingsDialog'
import DescribeSystemDialog from '@/components/ai/DescribeSystemDialog'

// ─── Types ─────────────────────────────────────────────────────────────────

interface FolderWorkspace {
  name: string
  modifiedAt?: number
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function WorkspaceRow({
  name,
  renamingFile,
  renameValue,
  onOpen,
  onRename,
  onDelete,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
}: {
  name: string
  renamingFile: string | null
  renameValue: string
  onOpen: (name: string) => void
  onRename: (name: string) => void
  onDelete: (name: string) => void
  onRenameValueChange: (val: string) => void
  onRenameCommit: (name: string) => void
  onRenameCancel: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const isRenaming = renamingFile === name

  return (
    <button
      className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
      onClick={() => !isRenaming && onOpen(name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FileText
        size={15}
        style={{ color: 'var(--color-accent)', flexShrink: 0, opacity: 0.7 }}
      />
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onBlur={() => onRenameCommit(name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit(name)
            if (e.key === 'Escape') onRenameCancel()
          }}
          className="text-sm bg-transparent border-b outline-none flex-1"
          style={{ borderColor: 'var(--color-accent)' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 text-sm font-semibold truncate">{name}</span>
      )}
      {(hovered && !isRenaming) && (
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button
            className="btn-surface !px-2 !py-1 text-xs"
            onClick={(e) => { e.stopPropagation(); onRename(name) }}
          >
            <Pencil size={11} />
            <span>Rename</span>
          </button>
          <button
            className="btn-surface !px-2 !py-1 text-xs"
            style={{ color: 'var(--color-error)' }}
            onClick={(e) => { e.stopPropagation(); onDelete(name) }}
          >
            <Trash2 size={11} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </button>
  )
}

function RecentRow({
  name,
  path,
  onClick,
}: {
  name: string
  path: string
  onClick: () => void
}) {
  return (
    <button
      className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left"
      onClick={onClick}
    >
      <FolderOpen
        size={14}
        style={{ color: 'var(--color-accent)', opacity: 0.7, flexShrink: 0 }}
      />
      <span className="flex-1 text-sm font-medium">{name}</span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{path}</span>
    </button>
  )
}

// ─── Template Dialog ─────────────────────────────────────────────────────────

function TemplateDialog({
  onSelect,
  onClose,
}: {
  onSelect: (ws: ReturnType<typeof createBigBankSample>, name: string) => void
  onClose: () => void
}) {
  const templates = [
    { label: 'Big Bank Sample', name: 'big-bank.dsl', fn: createBigBankSample },
    { label: 'Microservices', name: 'microservices.dsl', fn: createMicroservicesTemplate },
    { label: 'Monolith', name: 'monolith.dsl', fn: createMonolithTemplate },
    { label: 'Event-Driven', name: 'event-driven.dsl', fn: createEventDrivenTemplate },
  ] as const

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col gap-4 rounded-xl border p-5 shadow-xl"
        style={{
          background: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
          minWidth: '280px',
          maxWidth: '400px',
          width: '90vw',
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Load template
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:opacity-70"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {templates.map(({ label, name, fn }) => (
            <button
              key={name}
              className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
              onClick={() => onSelect(fn(), name)}
            >
              <FileText size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  useEffect(() => { document.title = 'c4hero' }, [])

  // Determine initial view based on whether a folder is already open
  const [view, setView] = useState<'startup' | 'collection'>(() =>
    getCurrentDirHandle() !== null ? 'collection' : 'startup'
  )
  const [folderWorkspaces, setFolderWorkspaces] = useState<FolderWorkspace[]>([])
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [showAISettings, setShowAISettings] = useState(false)
  const [showDescribe, setShowDescribe] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
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
      if (entry.kind === 'file' && name.endsWith('.dsl')) {
        let modifiedAt: number | undefined
        try {
          const fh = await dir.getFileHandle(name)
          const f = await fh.getFile()
          modifiedAt = f.lastModified
        } catch { /* ignore */ }
        files.push({ name, modifiedAt })
      }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name))
  }

  // ── Open folder helper ──────────────────────────────────────────────

  async function openFolderAndTransition() {
    const result = await openFolder()
    if (!result) return
    addRecentFolder({ name: result.dirHandle.name, path: result.dirHandle.name })
    const workspaces = result.dslFiles.map((name) => ({ name }))
    setFolderWorkspaces(workspaces)
    setView('collection')
  }

  // ── Screen 1 handlers ───────────────────────────────────────────────

  const handleCreateCollection = openFolderAndTransition
  const handleOpenCollection = openFolderAndTransition
  const handleOpenRecent = (_path: string) => openFolderAndTransition()

  // ── Screen 2 handlers ───────────────────────────────────────────────

  async function handleOpenWorkspace(filename: string) {
    const file = await readDSLFile(filename)
    if (!file) return
    const { workspace, errors } = parseDSL(file.content)
    if (errors.length > 0) console.warn('DSL parse warnings:', errors)
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
  }

  function handleDeleteWorkspace(filename: string) {
    useWorkspaceStore.getState().confirmDelete(
      `Delete "${filename}"? This cannot be undone.`,
      async () => {
        const dir = getCurrentDirHandle()
        if (dir) {
          await dir.removeEntry(filename).catch(() => {})
          const sc = sidecarName(filename)
          await dir.removeEntry(sc).catch(() => {})
        }
        setFolderWorkspaces((prev) => prev.filter((f) => f.name !== filename))
      }
    )
  }

  function handleRenameWorkspace(filename: string) {
    setRenamingFile(filename)
    setRenameValue(filename.replace(/\.dsl$/, ''))
  }

  async function commitRename(oldName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === oldName.replace(/\.dsl$/, '')) {
      setRenamingFile(null)
      return
    }
    const finalName = newName.endsWith('.dsl') ? newName : `${newName}.dsl`
    const dir = getCurrentDirHandle()
    if (dir) {
      try {
        const handle = await dir.getFileHandle(oldName)
        const file = await handle.getFile()
        const content = await file.text()
        const newHandle = await dir.getFileHandle(finalName, { create: true })
        const writable = await newHandle.createWritable()
        await writable.write(content)
        await writable.close()
        await dir.removeEntry(oldName).catch(() => {})
        // Rename sidecar too
        try {
          const oldSidecar = await dir.getFileHandle(sidecarName(oldName))
          const sidecarFile = await oldSidecar.getFile()
          const sidecarContent = await sidecarFile.text()
          const newSidecarHandle = await dir.getFileHandle(sidecarName(finalName), { create: true })
          const sw = await newSidecarHandle.createWritable()
          await sw.write(sidecarContent)
          await sw.close()
          await dir.removeEntry(sidecarName(oldName)).catch(() => {})
        } catch { /* no sidecar */ }
      } catch (err) {
        console.error('Rename failed:', err)
      }
    }
    setFolderWorkspaces((prev) =>
      prev.map((f) => (f.name === oldName ? { ...f, name: finalName } : f))
    )
    setRenamingFile(null)
  }

  async function handleBlankWorkspace() {
    const name = prompt('Workspace name:') || 'workspace'
    const filename = name.endsWith('.dsl') ? name : `${name}.dsl`
    const ws = createBlankWorkspace()
    ws.name = name
    await writeDSLFile(filename, serializeDSL(ws))
    loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
  }

  function handleLoadTemplate() {
    setShowTemplates(true)
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

  function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        if (!isWorkspaceShape(parsed)) {
          setErrorMsg('Invalid workspace file. The JSON does not have the expected workspace structure.')
          return
        }
        // Write to folder if open
        const filename = file.name.replace(/\.json$/, '.dsl')
        await writeDSLFile(filename, serializeDSL(parsed))
        loadWorkspace(parsed)
        useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
      } catch {
        setErrorMsg('Failed to parse JSON file. Please check the file format.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleDSLInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const content = await file.text()
    const { workspace, errors } = parseDSL(content)
    if (errors.length > 0) console.warn('DSL parse warnings:', errors)
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
    const { workspace, errors } = parseDSL(file.content)
    if (errors.length > 0) console.warn('DSL parse warnings:', errors)
    if (workspace) {
      if (!workspace.name) workspace.name = file.name.replace(/\.dsl$/, '')
      if (file.sidecarJson) {
        const sidecar = parseSidecar(file.sidecarJson)
        if (sidecar) applySidecar(workspace, sidecar)
      }
      loadWorkspace(workspace)
    } else {
      alert('Failed to parse DSL file. Check console for errors.')
    }
  }

  function handleDescribeClick() {
    const config = getAIConfig()
    if (!config) {
      setShowAISettings(true)
    } else {
      setShowDescribe(true)
    }
  }

  const dirHandle = getCurrentDirHandle()
  const recentFolders = getRecentFolders()

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-full w-full items-start justify-center overflow-y-auto px-5"
      style={{
        background: 'var(--color-bg-primary)',
        paddingTop: 'max(3rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))',
        paddingBottom: 'max(3rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))',
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-6 sm:max-w-lg my-auto">
        {/* Error banner */}
        {errorMsg && (
          <div
            role="alert"
            className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)',
              color: 'var(--color-error)',
            }}
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
            onOpenFile={handleOpenFile}
            onDescribe={handleDescribeClick}
            onAISettings={() => setShowAISettings(true)}
            recentFolders={recentFolders}
          />
        ) : (
          <CollectionView
            dirHandle={dirHandle}
            workspaces={folderWorkspaces}
            renamingFile={renamingFile}
            renameValue={renameValue}
            onOpenWorkspace={handleOpenWorkspace}
            onRenameWorkspace={handleRenameWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRenameValueChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingFile(null)}
            onBlankWorkspace={handleBlankWorkspace}
            onLoadTemplate={handleLoadTemplate}
            onImportJSON={() => jsonInputRef.current?.click()}
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

      {showAISettings && <AISettingsDialog onClose={() => setShowAISettings(false)} />}
      {showDescribe && <DescribeSystemDialog onClose={() => setShowDescribe(false)} />}
      {showTemplates && (
        <TemplateDialog
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplates(false)}
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
  onOpenFile,
  onDescribe,
  onAISettings,
  recentFolders,
}: {
  onCreateCollection: () => void
  onOpenCollection: () => void
  onOpenRecent: (path: string) => void
  onOpenFile: () => void
  onDescribe: () => void
  onAISettings: () => void
  recentFolders: { name: string; path: string }[]
}) {
  return (
    <>
      {/* Logo + tagline */}
      <div className="flex flex-col items-center gap-4">
        <h1 className="flex flex-col items-center gap-2">
          <img
            src="/c4-logo.svg"
            alt="c4hero — visual architecture modelling tool"
            className="h-10 sm:h-12"
          />
        </h1>
        <p
          className="text-center text-sm leading-relaxed sm:text-base"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Visual architecture modelling...
        </p>
      </div>

      {/* Collection actions */}
      {hasFolderAccess() ? (
        <div className="flex flex-col gap-3 w-full">
          <StartupActionCard
            icon={<FolderOpen size={22} />}
            label="Create new collection"
            description="Create a new c4hero collection under a folder"
            onClick={onCreateCollection}
          />
          <StartupActionCard
            icon={<Box size={22} />}
            label="Open folder as collection"
            description="Choose an existing collection folder"
            onClick={onOpenCollection}
          />

          {/* Recent folders */}
          {recentFolders.length > 0 && (
            <div className="w-full mt-2">
              <SectionDivider label="Recent" />
              <div className="flex flex-col gap-1 mt-2">
                {recentFolders.slice(0, 5).map((folder) => (
                  <RecentRow
                    key={folder.path}
                    name={folder.name}
                    path={folder.path}
                    onClick={() => onOpenRecent(folder.path)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Fallback for Firefox / no folder access
        <div className="flex flex-col gap-3 w-full">
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            Folder collections require a Chromium-based browser. You can still open individual .dsl files.
          </div>
          <button className="btn-surface w-full justify-center py-3.5" onClick={onOpenFile}>
            <FileText size={18} style={{ color: 'var(--color-accent)' }} />
            <span>Open .dsl file</span>
          </button>
        </div>
      )}

      {/* AI action */}
      <div className="flex w-full gap-2 mt-2">
        <button
          className="btn-surface flex-1 justify-center py-3.5"
          onClick={onDescribe}
        >
          <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
          <span>Describe your system with AI</span>
        </button>
        <button
          className="btn-surface !px-3"
          onClick={onAISettings}
          title="AI Settings"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Footer */}
      <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
        Open-source &middot; MIT License &middot; No account required
      </p>
    </>
  )
}

// ─── Screen 2: Collection Home ────────────────────────────────────────────────

function CollectionView({
  dirHandle,
  workspaces,
  renamingFile,
  renameValue,
  onOpenWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
  onBlankWorkspace,
  onLoadTemplate,
  onImportJSON,
  onBack,
}: {
  dirHandle: FileSystemDirectoryHandle | null
  workspaces: FolderWorkspace[]
  renamingFile: string | null
  renameValue: string
  onOpenWorkspace: (name: string) => void
  onRenameWorkspace: (name: string) => void
  onDeleteWorkspace: (name: string) => void
  onRenameValueChange: (val: string) => void
  onRenameCommit: (name: string) => void
  onRenameCancel: () => void
  onBlankWorkspace: () => void
  onLoadTemplate: () => void
  onImportJSON: () => void
  onBack: () => void
}) {
  return (
    <>
      {/* Collection header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded p-1 hover:opacity-70 -ml-1"
            style={{ color: 'var(--color-text-muted)' }}
            title="Back"
          >
            <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <FolderOpen size={20} style={{ color: 'var(--color-accent)' }} />
          <span className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {dirHandle?.name ?? 'Collection'}
          </span>
        </div>
        <span className="text-xs ml-8" style={{ color: 'var(--color-text-muted)' }}>
          {dirHandle?.name ?? ''}
        </span>
      </div>

      {/* Workspaces section — PRIMARY */}
      <div className="w-full">
        <SectionDivider label="Workspaces" />
        <div className="flex flex-col gap-1 mt-2">
          {workspaces.length === 0 ? (
            <p className="text-sm px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>
              No workspaces yet — create one below.
            </p>
          ) : (
            workspaces.map((ws) => (
              <WorkspaceRow
                key={ws.name}
                name={ws.name}
                renamingFile={renamingFile}
                renameValue={renameValue}
                onOpen={onOpenWorkspace}
                onRename={onRenameWorkspace}
                onDelete={onDeleteWorkspace}
                onRenameValueChange={onRenameValueChange}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            ))
          )}
        </div>
      </div>

      {/* Add workspace section — SECONDARY */}
      <div className="w-full">
        <SectionDivider label="Add workspace" muted />
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            className="btn-surface items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={onBlankWorkspace}
          >
            <Plus size={14} />
            <span>Blank workspace</span>
          </button>
          <button
            className="btn-surface items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={onLoadTemplate}
          >
            <Play size={14} />
            <span>Load example / template</span>
          </button>
          <button
            className="btn-surface items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={onImportJSON}
          >
            <Upload size={14} />
            <span>Import JSON</span>
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function StartupActionCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className="btn-surface w-full items-center gap-4 rounded-xl px-5 py-5 text-left"
      onClick={onClick}
    >
      <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>{icon}</span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </span>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    </button>
  )
}

function SectionDivider({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      />
      <span
        className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ color: muted ? 'var(--color-text-muted)' : 'var(--color-text-secondary, var(--color-text-muted))' }}
      >
        {label}
      </span>
      <div
        className="flex-1 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      />
    </div>
  )
}

// Keep unused icon imports from triggering lint errors
void Server
void Radio
