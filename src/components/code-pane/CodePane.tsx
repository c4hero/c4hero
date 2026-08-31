import { useEffect, useRef, useState } from 'react'
import { X, Copy, Check, TriangleAlert } from 'lucide-react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Annotation, Transaction } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { tags as t } from '@lezer/highlight'
import { useWorkspaceStore } from '@/store/workspace'
import { serializeDSL } from '@/lib/dsl'
import type { ParseError } from '@/lib/dsl'
import { structurizrLanguage } from './structurizrLanguage'
import { createDslSyncEngine, type DslSyncStatus } from './dslSyncEngine'

export const CODE_PANE_WIDTH = 'min(440px, 45vw)'

/** Marks programmatic (store-to-editor) transactions so the update listener
 *  doesn't mistake them for user keystrokes and start an apply cycle. */
const fromStoreSync = Annotation.define<boolean>()

const dslHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--color-accent)' },
  { tag: t.string, color: 'var(--color-text-primary)' },
  { tag: t.comment, color: 'var(--color-text-muted)', fontStyle: 'italic' },
  { tag: t.number, color: 'var(--color-text-secondary)' },
  { tag: t.operator, color: 'var(--color-text-muted)' },
  { tag: t.variableName, color: 'var(--color-text-secondary)' },
  { tag: t.propertyName, color: 'var(--color-text-secondary)' },
  { tag: t.color, color: 'var(--color-text-primary)' },
  { tag: t.meta, color: 'var(--color-text-muted)' },
  { tag: t.brace, color: 'var(--color-text-muted)' },
])

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', background: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--color-surface-3) 40%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-lint-marker-error': { content: 'none' },
})

/** Convert 1-based parser line/column errors into CodeMirror diagnostics,
 *  clamped so out-of-range positions (e.g. integrity errors at 1:1) stay valid. */
function toDiagnostics(view: EditorView, errors: ParseError[]): Diagnostic[] {
  const doc = view.state.doc
  return errors.map((err) => {
    const line = doc.line(Math.min(Math.max(err.line, 1), doc.lines))
    const from = Math.min(line.from + Math.max(err.column - 1, 0), line.to)
    return { from, to: line.to, severity: 'error' as const, message: err.message }
  })
}

export default function CodePane() {
  const setCodePanelOpen = useWorkspaceStore((s) => s.setCodePanelOpen)
  const activeWorkspaceFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const workspaceName = useWorkspaceStore((s) => s.workspace?.name)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [status, setStatus] = useState<DslSyncStatus>({ errors: [], serializeError: null, pendingApply: false })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!hostRef.current) return

    const engine = createDslSyncEngine({
      readText: () => viewRef.current?.state.doc.toString() ?? '',
      writeText: (text) => {
        const view = viewRef.current
        if (!view) return
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          // Store syncs are excluded from the editor's undo history: undoing
          // one would resurrect stale text, and the resulting keystroke event
          // would auto-apply it — silently reverting canvas-side work.
          annotations: [fromStoreSync.of(true), Transaction.addToHistory.of(false)],
        })
      },
      serialize: () => {
        const ws = useWorkspaceStore.getState().workspace
        if (!ws) return { error: 'No workspace open' }
        try {
          return { text: serializeDSL(ws) }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Serialization failed' }
        }
      },
      apply: (text) => useWorkspaceStore.getState().replaceWorkspaceFromDSL(text),
      onStatus: setStatus,
    })

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          bracketMatching(),
          lintGutter(),
          structurizrLanguage,
          syntaxHighlighting(dslHighlight),
          editorTheme,
          keymap.of([
            // Apply immediately instead of waiting out the keystroke debounce.
            { key: 'Mod-Enter', run: () => { engine.flush(); return true } },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromStoreSync))) {
              engine.handleEditorChange()
            }
            if (update.focusChanged && !update.view.hasFocus) engine.handleEditorBlur()
          }),
        ],
      }),
    })
    viewRef.current = view
    engine.init()

    const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
      if (state.workspace !== prev.workspace) engine.handleStoreChange()
    })

    return () => {
      unsubscribe()
      engine.dispose()
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // Render the sync engine's errors as gutter diagnostics.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(setDiagnostics(view.state, toDiagnostics(view, status.errors)))
  }, [status.errors])

  const copy = () => {
    const text = viewRef.current?.state.doc.toString() ?? ''
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const filename = activeWorkspaceFilename ?? `${workspaceName ?? 'workspace'}.dsl`
  const errorCount = status.errors.length

  return (
    <div
      data-canvas-chrome="code-pane"
      data-canvas-fit-chrome
      aria-label="Structurizr DSL editor"
      style={{
        position: 'fixed',
        top: 64,
        right: 14,
        bottom: 70,
        zIndex: 49,
        width: CODE_PANE_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        border: '1px solid rgba(88,166,255,0.16)',
        background: 'var(--glass-bg-heavy)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <span
          title="Edits here apply to the canvas once they parse cleanly. Your formatting is kept until the next canvas-side change re-serializes the text."
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          DSL · {filename}
        </span>
        {errorCount > 0 && (
          <span
            data-code-pane-errors
            title={status.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('\n')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--text-xxs)',
              color: 'var(--color-danger, #f85149)',
              border: '1px solid color-mix(in srgb, var(--color-danger, #f85149) 40%, transparent)',
              borderRadius: 999,
              padding: '1px 7px',
              whiteSpace: 'nowrap',
            }}
          >
            <TriangleAlert size={10} />
            {errorCount} {errorCount === 1 ? 'error' : 'errors'} — canvas not updated
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={copy}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3 }}
            title="Copy DSL"
            aria-label="Copy DSL"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => setCodePanelOpen(false)}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3 }}
            title="Close"
            aria-label="Close DSL pane"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Serialization failure banner — the editor may be showing stale text. */}
      {status.serializeError && (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger, #f85149)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          Cannot serialize the current workspace: {status.serializeError}
        </div>
      )}

      {/* Editor */}
      <div ref={hostRef} data-code-pane-editor style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
    </div>
  )
}
