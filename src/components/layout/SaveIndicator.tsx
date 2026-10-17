import { useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { serializeRoot } from '@/lib/includeWriteback'
import { saveDSLFile, hasFileSystemAccess } from '@/lib/fileIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from '@/lib/workspaceSave'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { announce } from '@/lib/announce'

export default function SaveIndicator() {
  // Note: we deliberately don't subscribe to the workspace itself — only
  // primitives that change when save status actually changes. Keeps this
  // component out of the inspector-typing re-render fanout.
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const currentUndoLength = useWorkspaceStore((s) => s.undoStack.length)
  const isDirty = currentUndoLength > 0
  const lastSavedUndoLength = useWorkspaceStore((s) => s.lastSavedUndoLength)
  const fileSaveFailed = useWorkspaceStore((s) => s.fileSaveFailed)
  const watchDisk = useWorkspaceStore((s) => s.watchDisk)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const saveRequest = useRef(0)
  const hasFileHandle = isWorkspaceLinked(activeFilename)
  const canLinkFiles = hasFileSystemAccess()

  async function handleSave() {
    // Read the current workspace at click time rather than subscribing to it;
    // the latest snapshot is what we want to serialize anyway.
    const snapshot = useWorkspaceStore.getState()
    const workspace = snapshot.workspace
    if (!workspace) return
    const filename = snapshot.activeWorkspaceFilename
    const undoLength = snapshot.undoStack.length
    const request = ++saveRequest.current
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
    setSaveStatus('saving')
    try {
      // A linked workspace (single file, or folder collection + filename) is
      // written in place — never "save as", which in a collection made a copy
      // (TEA-339). Only an unlinked one needs to ask where to go.
      const ok = isWorkspaceLinked(filename)
        ? await writeLinkedWorkspace(workspace, filename)
        : await saveDSLFile(
          serializeRoot(workspace),
          `${workspace.name ?? 'workspace'}.dsl`,
          serializeSidecar(extractSidecar(workspace) ?? { version: 1, views: {} }),
        )
      if (request !== saveRequest.current) return
      const current = useWorkspaceStore.getState()
      if (current.workspace !== workspace || current.activeWorkspaceFilename !== filename) {
        setSaveStatus('idle')
        return
      }
      if (!ok) throw new Error('Save failed')
      current.setFileSaveFailed(false)
      current.setLastSavedUndoLength(undoLength)
      setSaveStatus('saved')
      announce('File saved')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      if (request !== saveRequest.current) return
      const current = useWorkspaceStore.getState()
      if (current.workspace !== workspace || current.activeWorkspaceFilename !== filename) {
        setSaveStatus('idle')
        return
      }
      current.setFileSaveFailed(true)
      setSaveStatus('error')
      announce(error instanceof Error ? error.message : 'Save failed')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const isFileDirty = fileSaveFailed || (isDirty && currentUndoLength !== lastSavedUndoLength)
  const displayStatus = saveStatus === 'saving' ? 'saving'
    : fileSaveFailed ? 'error'
    : saveStatus === 'saved' && isFileDirty ? 'idle'
    : saveStatus
  const dotColor =
    displayStatus === 'saving' ? 'var(--color-info)'
    : displayStatus === 'saved' ? 'var(--color-success)'
    : displayStatus === 'error' ? 'var(--color-error)'
    : !hasFileHandle ? 'var(--color-text-muted)'
    : isFileDirty ? 'var(--color-warning)'
    : 'var(--color-success)'
  const dotGlow =
    displayStatus === 'saving' ? '0 0 6px var(--color-info)'
    : displayStatus === 'saved' ? '0 0 6px var(--color-success)'
    : displayStatus === 'error' ? '0 0 6px var(--color-error)'
    : !hasFileHandle ? 'none'
    : isFileDirty ? '0 0 6px var(--color-warning)'
    : '0 0 6px var(--color-success)'
  const tooltip =
    displayStatus === 'saving' ? (canLinkFiles ? 'Saving\u2026' : 'Downloading\u2026')
    : displayStatus === 'saved' ? (canLinkFiles ? 'Saved to file' : 'Downloaded')
    : displayStatus === 'error' ? (canLinkFiles ? 'Save failed \u2014 click to retry' : 'Download failed \u2014 click to retry')
    : !canLinkFiles ? 'Click to download workspace'
    : !hasFileHandle ? 'No file linked \u2014 click to save to a .dsl file'
    : isFileDirty ? 'Unsaved changes \u2014 click to save'
    : 'All changes saved'
  const isUnlinked = canLinkFiles && !hasFileHandle && displayStatus === 'idle'
  const watching = watchDisk && hasFileHandle
  const tooltipWithWatch = watching && displayStatus === 'idle' ? `${tooltip} · watching for changes on disk` : tooltip

  const dotBg = isUnlinked ? 'var(--color-warning)' : dotColor
  const dotShadow = isUnlinked ? '0 0 6px var(--color-warning)' : dotGlow

  return (
    <button
      onClick={handleSave}
      className={isUnlinked ? 'hover-subtle save-indicator-pulse' : 'hover-subtle'}
      style={{
        width: 36,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: 'none',
        borderRight: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
      title={tooltipWithWatch}
      aria-label={tooltip}
      data-watching-disk={watching ? 'true' : undefined}
    >
      {!canLinkFiles ? (
        // No File System Access API — clicking saves by triggering a browser
        // download. Use the Save (floppy) icon so this slot is visually
        // distinct from the Export (download tray) icon further right.
        <Save
          size={14}
          color={
            displayStatus === 'saving' ? 'var(--color-info)'
            : displayStatus === 'saved' ? 'var(--color-success)'
            : displayStatus === 'error' ? 'var(--color-error)'
            : isFileDirty ? 'var(--color-warning)'
            : 'var(--color-text-muted)'
          }
          style={{ transition: 'color 0.3s' }}
        />
      ) : (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotBg,
            boxShadow: dotShadow,
            transition: 'background 0.3s, box-shadow 0.3s',
          }}
        />
      )}
    </button>
  )
}
