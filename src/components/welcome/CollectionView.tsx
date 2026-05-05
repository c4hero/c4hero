import { useMemo, useState } from 'react'
import {
  FolderOpen,
  Plus,
  ChevronRight,
  Search,
  Pencil,
  Trash2,
  X,
  Boxes,
} from 'lucide-react'
import RowMenu from './RowMenu'
import { WorkspaceEditDialog } from './WelcomeDialogs'
import type { FolderWorkspace } from './WelcomeLeaves'
import { scopeAccent, scopeLabel } from './workspaceScopeMeta'
import {
  C4Mark,
  LifecycleButton,
  WelcomeFooter,
  EmptyWorkspaceArtwork,
} from './WelcomeAtoms'

type RecentFolder = { name: string; path: string; displayName?: string }

export default function CollectionView({
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
  recentFolders: RecentFolder[]
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
