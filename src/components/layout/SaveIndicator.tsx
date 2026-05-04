import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile, getCurrentFileHandle, hasFileSystemAccess } from '@/lib/fileIO'
import { getCurrentDirHandle } from '@/lib/folderIO'
import { announce } from '@/lib/announce'

/** The workspace is linked to a file if EITHER:
 *  - A single-file handle is open (file-picker mode), OR
 *  - A folder handle is open AND an active filename is set (collection mode). */
function isWorkspaceLinked(activeFilename: string | null): boolean {
  if (getCurrentFileHandle() !== null) return true
  if (getCurrentDirHandle() !== null && activeFilename) return true
  return false
}

export default function SaveIndicator() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const currentUndoLength = useWorkspaceStore((s) => s.undoStack.length)
  const isDirty = currentUndoLength > 0
  const lastSavedUndoLength = useWorkspaceStore((s) => s.lastSavedUndoLength)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedUndoLength, setSavedUndoLength] = useState(lastSavedUndoLength)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const hasFileHandle = isWorkspaceLinked(activeFilename)
  const canLinkFiles = hasFileSystemAccess()

  async function handleSave() {
    if (!workspace) return
    setSaveStatus('saving')
    const wsName = workspace.name ?? 'workspace'
    const dsl = serializeDSL(workspace)
    const ok = await saveDSLFile(dsl, `${wsName}.dsl`)
    if (ok) {
      const n = useWorkspaceStore.getState().undoStack.length
      setSavedUndoLength(n)
      useWorkspaceStore.getState().setLastSavedUndoLength(n)
      setSaveStatus('saved')
      announce('File saved')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } else {
      setSaveStatus('error')
      announce('Save failed')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const isFileDirty = isDirty && currentUndoLength !== savedUndoLength && currentUndoLength !== lastSavedUndoLength
  const dotColor =
    saveStatus === 'saving' ? 'var(--color-info)'
    : saveStatus === 'saved' ? 'var(--color-success)'
    : saveStatus === 'error' ? 'var(--color-error)'
    : !hasFileHandle ? 'var(--color-text-muted)'
    : isFileDirty ? 'var(--color-warning)'
    : 'var(--color-success)'
  const dotGlow =
    saveStatus === 'saving' ? '0 0 6px var(--color-info)'
    : saveStatus === 'saved' ? '0 0 6px var(--color-success)'
    : saveStatus === 'error' ? '0 0 6px var(--color-error)'
    : !hasFileHandle ? 'none'
    : isFileDirty ? '0 0 6px var(--color-warning)'
    : '0 0 6px var(--color-success)'
  const tooltip =
    saveStatus === 'saving' ? (canLinkFiles ? 'Saving\u2026' : 'Downloading\u2026')
    : saveStatus === 'saved' ? (canLinkFiles ? 'Saved to file' : 'Downloaded')
    : saveStatus === 'error' ? (canLinkFiles ? 'Save failed \u2014 click to retry' : 'Download failed \u2014 click to retry')
    : !canLinkFiles ? 'Click to download .dsl'
    : !hasFileHandle ? 'No file linked \u2014 click to save to a .dsl file'
    : isFileDirty ? 'Unsaved changes \u2014 click to save'
    : 'All changes saved'
  const isUnlinked = canLinkFiles && !hasFileHandle && saveStatus === 'idle'

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
      title={tooltip}
      aria-label={tooltip}
    >
      {!canLinkFiles ? (
        <Download
          size={14}
          color={
            saveStatus === 'saving' ? 'var(--color-info)'
            : saveStatus === 'saved' ? 'var(--color-success)'
            : saveStatus === 'error' ? 'var(--color-error)'
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
