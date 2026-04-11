import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile, getCurrentFileHandle } from '@/lib/fileIO'
import { getCurrentDirHandle } from '@/lib/folderIO'
import { announce } from '@/lib/announce'
import { TriangleAlert } from 'lucide-react'

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
  const isDirty = useWorkspaceStore((s) => s.undoStack.length > 0)
  const lastSavedUndoLength = useWorkspaceStore((s) => s.lastSavedUndoLength)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasFileHandle, setHasFileHandle] = useState(() => isWorkspaceLinked(activeFilename))
  const savedUndoLengthRef = useRef(0)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // Sync hasFileHandle whenever state changes that affects the link
  useEffect(() => {
    setHasFileHandle(isWorkspaceLinked(activeFilename))
  }, [saveStatus, activeFilename])

  async function handleSave() {
    if (!workspace) return
    setSaveStatus('saving')
    const wsName = workspace.name ?? 'workspace'
    const dsl = serializeDSL(workspace)
    const ok = await saveDSLFile(dsl, `${wsName}.dsl`)
    if (ok) {
      const n = useWorkspaceStore.getState().undoStack.length
      savedUndoLengthRef.current = n
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

  const currentUndoLength = useWorkspaceStore.getState().undoStack.length
  const isFileDirty = isDirty && currentUndoLength !== savedUndoLengthRef.current && currentUndoLength !== lastSavedUndoLength
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
    saveStatus === 'saving' ? 'Saving\u2026'
    : saveStatus === 'saved' ? 'Saved to file'
    : saveStatus === 'error' ? 'Save failed \u2014 click to retry'
    : !hasFileHandle ? 'No file linked \u2014 click to save to a .dsl file'
    : isFileDirty ? 'Unsaved changes \u2014 click to save'
    : 'All changes saved'
  const showWarningIcon = !hasFileHandle && saveStatus === 'idle'

  return (
    <button
      onClick={handleSave}
      className="hover-subtle"
      style={{
        width: showWarningIcon ? 40 : 36,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: 'none',
        borderRight: '1px solid var(--color-border)',
        flexShrink: 0,
        color: showWarningIcon ? 'var(--color-warning)' : undefined,
      }}
      title={tooltip}
      aria-label={tooltip}
    >
      {showWarningIcon ? (
        <TriangleAlert size={14} style={{ filter: 'drop-shadow(0 0 4px var(--color-warning))' }} />
      ) : (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: dotGlow,
            transition: 'background 0.3s, box-shadow 0.3s',
          }}
        />
      )}
    </button>
  )
}
