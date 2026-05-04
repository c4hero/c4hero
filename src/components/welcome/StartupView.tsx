import { FolderOpen, FileText, Plus, ChevronRight, X } from 'lucide-react'
import { hasFolderAccess } from '@/lib/folderIO'
import RowMenu from './RowMenu'
import {
  C4Mark,
  LifecycleButton,
  WelcomeFooter,
  ArchitectureArtwork,
  FeatureStrip,
} from './WelcomeAtoms'

type RecentFolder = { name: string; path: string; displayName?: string }

export default function StartupView({
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
  recentFolders: RecentFolder[]
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
            {canUseCollections ? (
              <>
                Visual architecture modelling saved as plain <code>.dsl</code> documents. Open an
                existing collection (a folder of <code>.dsl</code> files), or start a new one.
              </>
            ) : (
              <>
                Visual architecture modelling saved as plain <code>.dsl</code> documents. Open
                one to get started.
              </>
            )}
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
        </div>
      )}

      <WelcomeFooter />
    </>
  )
}

function RecentCollectionRow({
  folder,
  onOpen,
  onRemove,
}: {
  folder: RecentFolder
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
