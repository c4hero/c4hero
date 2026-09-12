import { useMemo, useRef, useState } from 'react'
import { FileInput, Upload, AlertTriangle, Check } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore } from '@/store/workspace'
import { readTextFileWithLimit } from '@/lib/fileIO'
import { importForeign, ImportError, type ForeignImport } from '@/lib/import'
import { announce } from '@/lib/announce'

const ACCEPT = '.puml,.plantuml,.iuml,.wsd,.pu,.mmd,.mermaid,.md,.txt'

const PANEL_WIDTH = 'min(640px, calc(100vw - 32px))'

/** DialogShell ships no default surface for centred modals — the "shade"
 *  variant gets its background from the `.shade-panel` class, but a centred
 *  panel renders transparent over the backdrop unless the caller supplies one.
 *  Same tones as TagManagerDialog / SearchDialog (TEA-332). */
const CENTER_SURFACE: React.CSSProperties = {
  background: 'var(--color-bg-panel)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
  overflow: 'hidden',
}

interface ImportDialogProps {
  onClose: () => void
  /** Called with the normalised workspace once the user confirms. The caller
   *  loads it into the store and takes the unsaved single-file flow. */
  onImport: (result: ForeignImport) => void
  /** Anchor under the top pill ("shade") or centre on the welcome screen. */
  position?: 'shade' | 'center'
}

type Outcome = { ok: true; result: ForeignImport } | { ok: false; error: string; line?: number } | null

/** Paste or drop a C4-PlantUML / Mermaid C4 file, see what it would become,
 *  and load it as a new unsaved workspace (TEA-255). */
export default function ImportDialog({ onClose, onImport, position = 'center' }: ImportDialogProps) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasWorkspace = useWorkspaceStore((s) => !!s.workspace)
  const workspaceName = useWorkspaceStore((s) => s.workspace?.name)
  const isDirty = useWorkspaceStore((s) => s.undoStack.length !== s.lastSavedUndoLength)

  // Re-run the importer on every change; it is pure and fast.
  const outcome = useMemo<Outcome>(() => {
    if (text.trim() === '') return null
    try {
      return { ok: true, result: importForeign(text) }
    } catch (err) {
      if (err instanceof ImportError) return { ok: false, error: err.message, line: err.line }
      return { ok: false, error: err instanceof Error ? err.message : 'Import failed' }
    }
  }, [text])

  async function readFile(file: File) {
    setReadError(null)
    try {
      setText(await readTextFileWithLimit(file, 'Diagram file'))
      setFileName(file.name)
      setConfirmReplace(false)
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'Could not read the file')
    }
  }

  function commit() {
    if (!outcome?.ok) return
    if (hasWorkspace && !confirmReplace) { setConfirmReplace(true); return }
    onImport(outcome.result)
    announce(`Imported ${outcome.result.workspace.name}`)
    onClose()
  }

  const summary = outcome?.ok ? outcome.result.summary : null
  const formatLabel = outcome?.ok ? (outcome.result.format === 'mermaid-c4' ? 'Mermaid C4' : 'C4-PlantUML') : null

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="Import PlantUML or Mermaid"
      position={position}
      style={position === 'center' ? { width: PANEL_WIDTH, ...CENTER_SURFACE } : { width: PANEL_WIDTH }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileInput size={16} color="var(--color-accent)" aria-hidden="true" />
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>Import PlantUML / Mermaid</span>
      </div>

      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Paste a C4-PlantUML file (<code>@startuml</code> with <code>Person</code>, <code>System</code>, <code>Container</code>… macros) or a Mermaid
          <code> C4Context</code> / <code>C4Container</code> / <code>C4Component</code> block. Nothing leaves your browser; includes are not fetched.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault() }}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void readFile(f) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="hover-subtle"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
          >
            <Upload size={12} aria-hidden="true" /> Choose file
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {fileName ? fileName : 'or drop a file here, or paste below'}
          </span>
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f) }} />
        </div>

        <textarea
          aria-label="Diagram source"
          data-import-source
          value={text}
          onChange={(e) => { setText(e.target.value); setFileName(null); setConfirmReplace(false) }}
          placeholder={'@startuml\nPerson(user, "User")\nSystem(sys, "System")\nRel(user, sys, "Uses")\n@enduml'}
          spellCheck={false}
          style={{ width: '100%', minHeight: 160, resize: 'vertical', boxSizing: 'border-box', padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-xs)' }}
        />

        {readError && <Note tone="error">{readError}</Note>}

        {outcome && !outcome.ok && (
          <Note tone="error" data-import-error>{outcome.line ? `Line ${outcome.line}: ` : ''}{outcome.error}</Note>
        )}

        {outcome?.ok && summary && (
          <div data-import-summary style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
              <Check size={12} color="var(--color-success)" aria-hidden="true" />
              <b>{outcome.result.workspace.name}</b>
              <span style={{ color: 'var(--color-text-muted)' }}>· {formatLabel}</span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {summary.people} {summary.people === 1 ? 'person' : 'people'}, {summary.systems} {summary.systems === 1 ? 'system' : 'systems'}, {summary.containers} {summary.containers === 1 ? 'container' : 'containers'}, {summary.components} {summary.components === 1 ? 'component' : 'components'}, {summary.relationships} {summary.relationships === 1 ? 'relationship' : 'relationships'}
            </div>
            {outcome.result.warnings.length > 0 && (
              <details data-import-warnings style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--color-warning)' }}>
                  <AlertTriangle size={11} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />
                  {outcome.result.warnings.length} {outcome.result.warnings.length === 1 ? 'line' : 'lines'} skipped or adjusted
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 140, overflowY: 'auto' }}>
                  {outcome.result.warnings.map((w, i) => (
                    <li key={i}><span style={{ color: 'var(--color-text-muted)', fontFamily: 'ui-monospace, monospace' }}>{w.line}:</span> {w.message}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {confirmReplace && (
          <Note tone="warn" data-import-replace>
            <b>Replace {workspaceName || 'the current workspace'}?</b>{' '}
            {isDirty ? 'It has unsaved changes — importing discards them.' : 'Importing replaces the open diagram with the imported one.'}
          </Note>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="hover-subtle" style={BTN}>Cancel</button>
          <button
            type="button"
            onClick={commit}
            disabled={!outcome?.ok}
            data-import-confirm
            style={{ ...BTN, border: '1px solid var(--color-accent)', color: outcome?.ok ? 'var(--color-text-primary)' : 'var(--color-text-muted)', cursor: outcome?.ok ? 'pointer' : 'not-allowed' }}
          >
            {confirmReplace ? 'Replace and import' : 'Import'}
          </button>
        </div>
      </div>
    </DialogShell>
  )
}

function Note({ tone, children, ...rest }: { tone: 'error' | 'warn'; children: React.ReactNode } & Record<string, unknown>) {
  const color = tone === 'error' ? 'var(--color-error)' : 'var(--color-warning)'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} {...rest} style={{ fontSize: 'var(--text-xs)', color, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${color}`, lineHeight: 1.45 }}>
      {children}
    </div>
  )
}

const BTN: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
}
