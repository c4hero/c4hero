import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check, TriangleAlert, Minus, Maximize2, Minimize2, Undo2, Redo2, ChevronUp, Search } from 'lucide-react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Annotation, Transaction } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, undo as cmUndo, redo as cmRedo, undoDepth, redoDepth } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'
import { useWorkspaceStore } from '@/store/workspace'
import { serializeDSL } from '@/lib/dsl'
import type { ParseError } from '@/lib/dsl'
import { readJSON, writeJSON, readString, writeString } from '@/lib/safeStorage'
import { structurizrLanguage } from './structurizrLanguage'
import { createDslSyncEngine, type DslSyncStatus } from './dslSyncEngine'

/** Marks programmatic (store-to-editor) transactions so the update listener
 *  doesn't mistake them for user keystrokes and start an apply cycle. */
const fromStoreSync = Annotation.define<boolean>()

// ─── Floating-window geometry ────────────────────────────────────────

interface PaneRect { x: number; y: number; w: number; h: number }

const RECT_STORAGE_KEY = 'c4hero_code_pane_rect'
const EDITED_STORAGE_KEY = 'c4hero_code_pane_edited'
const MARGIN = 14
const MIN_W = 320
const MIN_H = 180
const HEADER_H = 40 // approximate; used only for clamping so the drag handle stays reachable

function defaultRect(): PaneRect {
  const w = Math.round(Math.min(440, window.innerWidth * 0.45))
  const h = Math.max(window.innerHeight - 64 - 70, MIN_H)
  return { x: window.innerWidth - w - MARGIN, y: 64, w, h }
}

/** Keep the window inside the viewport (header always grabbable). */
function clampRect(r: PaneRect): PaneRect {
  const w = Math.min(Math.max(r.w, MIN_W), window.innerWidth - 2 * MARGIN)
  const h = Math.min(Math.max(r.h, MIN_H), window.innerHeight - 2 * MARGIN)
  const x = Math.min(Math.max(r.x, MARGIN - w + MIN_W), window.innerWidth - MIN_W)
  const y = Math.min(Math.max(r.y, MARGIN), window.innerHeight - HEADER_H)
  return { x, y, w, h }
}

function isPaneRect(v: unknown): v is PaneRect {
  return !!v && typeof v === 'object'
    && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((v as Record<string, unknown>)[k]))
}

type ResizeEdge = 'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right'

// ─── Editor chrome ───────────────────────────────────────────────────

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
  // The native caret defaults to black — invisible on the dark glass
  // background. An accent caret is the pane's core "you can type here" cue.
  '.cm-content': { caretColor: 'var(--color-accent)' },
  '.cm-content ::selection': { background: 'color-mix(in srgb, var(--color-accent) 35%, transparent)' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--color-surface-3) 40%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-lint-marker-error': { content: 'none' },
  // Search panel — restyled from CodeMirror's default grey into the pane's own
  // chrome: one wrapping row, quiet ghost buttons, chip-like option toggles.
  '.cm-panels': {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderBottom: '1px solid var(--color-border)',
  },
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 30px 8px 10px',
    fontSize: '11px',
  },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-panel.cm-search input[type="text"]': {
    flex: '1 1 130px',
    minWidth: '110px',
    height: '24px',
    padding: '0 8px',
    background: 'var(--color-surface-3)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  '.cm-panel.cm-search input[type="text"]:focus': { borderColor: 'var(--color-accent)' },
  '.cm-panel.cm-search .cm-button': {
    background: 'transparent',
    backgroundImage: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    padding: '3px 9px',
    cursor: 'pointer',
    textTransform: 'capitalize',
  },
  '.cm-panel.cm-search .cm-button:hover': { background: 'var(--color-surface-3)' },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 7px',
    border: '1px solid var(--color-border)',
    borderRadius: '999px',
    color: 'var(--color-text-muted)',
    fontSize: '10px',
    textTransform: 'capitalize',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-panel.cm-search label:has(input:checked)': {
    borderColor: 'var(--color-accent)',
    color: 'var(--color-accent)',
    background: 'var(--color-accent-active)',
  },
  '.cm-panel.cm-search input[type="checkbox"]': {
    accentColor: 'var(--color-accent)',
    margin: 0,
    width: '10px',
    height: '10px',
  },
  '.cm-panel.cm-search button[name="close"]': {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    fontSize: '15px',
    padding: '0 8px',
    cursor: 'pointer',
  },
  '.cm-searchMatch': { background: 'color-mix(in srgb, var(--color-accent) 30%, transparent)' },
  '.cm-searchMatch-selected': { background: 'color-mix(in srgb, var(--color-accent) 55%, transparent)' },
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
  const hostElRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [status, setStatus] = useState<DslSyncStatus>({ errors: [], serializeError: null, pendingApply: false })
  const statusRef = useRef(status)
  const [copied, setCopied] = useState(false)
  const [histDepths, setHistDepths] = useState({ undo: 0, redo: 0 })
  // Once the user has successfully applied a text edit (ever, persisted), the
  // footer stops teaching "this is editable" and shows live sync state instead.
  const [everApplied, setEverApplied] = useState(() => readString(EDITED_STORAGE_KEY) === '1')

  // The host div is destroyed and recreated when the pane switches between its
  // inline (docked) and portal (maximized) render targets — re-attach the
  // long-lived CodeMirror DOM instead of losing the editor. CodeMirror
  // explicitly supports moving view.dom between parents.
  const hostRefCb = useCallback((el: HTMLDivElement | null) => {
    hostElRef.current = el
    const view = viewRef.current
    if (el && view && view.dom.parentElement !== el) {
      el.appendChild(view.dom)
      view.requestMeasure()
    }
  }, [])

  // ── Window state ──
  const [rect, setRect] = useState<PaneRect>(() => {
    const saved = readJSON(RECT_STORAGE_KEY, isPaneRect)
    return clampRect(saved ?? defaultRect())
  })
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const preMaxRect = useRef<PaneRect | null>(null)
  const rectRef = useRef(rect)
  useEffect(() => { rectRef.current = rect }, [rect])

  const persistRect = useCallback((r: PaneRect) => writeJSON(RECT_STORAGE_KEY, r), [])

  // Re-clamp when the browser window shrinks under the pane.
  useEffect(() => {
    function onWindowResize() {
      setRect((r) => clampRect(r))
      if (maximized) {
        setRect({ x: MARGIN, y: MARGIN, w: window.innerWidth - 2 * MARGIN, h: window.innerHeight - 2 * MARGIN })
      }
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [maximized])

  /** Shared pointer-drag loop for both moving and resizing. */
  const startPointerOp = useCallback((e: React.PointerEvent, apply: (dx: number, dy: number, start: PaneRect) => PaneRect) => {
    e.preventDefault()
    const start = { ...rectRef.current }
    const startX = e.clientX
    const startY = e.clientY
    function onMove(ev: PointerEvent) {
      setRect(clampRect(apply(ev.clientX - startX, ev.clientY - startY, start)))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistRect(rectRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [persistRect])

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    // Buttons in the header keep their click behavior — only bare header drags.
    if ((e.target as HTMLElement).closest('button')) return
    if (maximized) return
    startPointerOp(e, (dx, dy, start) => ({ ...start, x: start.x + dx, y: start.y + dy }))
  }, [startPointerOp, maximized])

  const onResizeStart = useCallback((edge: ResizeEdge) => (e: React.PointerEvent) => {
    if (maximized || minimized) return
    startPointerOp(e, (dx, dy, start) => {
      let { x, w, h } = start
      if (edge === 'left' || edge === 'bottom-left') { x = start.x + dx; w = start.w - dx }
      if (edge === 'right' || edge === 'bottom-right') { w = start.w + dx }
      if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') { h = start.h + dy }
      // Enforce min width against the correct anchor when resizing from the left.
      if (w < MIN_W && (edge === 'left' || edge === 'bottom-left')) { x -= MIN_W - w; w = MIN_W }
      return { x, y: start.y, w, h }
    })
  }, [startPointerOp, maximized, minimized])

  const toggleMaximize = useCallback(() => {
    setMinimized(false)
    setMaximized((max) => {
      if (!max) {
        preMaxRect.current = rectRef.current
        setRect({ x: MARGIN, y: MARGIN, w: window.innerWidth - 2 * MARGIN, h: window.innerHeight - 2 * MARGIN })
        return true
      }
      const restored = clampRect(preMaxRect.current ?? defaultRect())
      setRect(restored)
      persistRect(restored)
      return false
    })
  }, [persistRect])

  // ── Editor + sync engine ──
  useEffect(() => {
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
      onStatus: (s) => {
        // pendingApply true -> false with no errors = a successful text apply:
        // the user has learned the pane is editable, stop teaching it.
        const prev = statusRef.current
        statusRef.current = s
        // Disk watch must not hot-swap the model under unapplied/broken text.
        useWorkspaceStore.getState().setCodePaneDirty(s.pendingApply || s.errors.length > 0)
        if (prev.pendingApply && !s.pendingApply && s.errors.length === 0) {
          setEverApplied(true)
          writeString(EDITED_STORAGE_KEY, '1')
        }
        setStatus(s)
      },
    })

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          bracketMatching(),
          lintGutter(),
          search({ top: true }),
          structurizrLanguage,
          syntaxHighlighting(dslHighlight),
          editorTheme,
          keymap.of([
            // Apply immediately instead of waiting out the keystroke debounce.
            { key: 'Mod-Enter', run: () => { engine.flush(); return true } },
            ...searchKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromStoreSync))) {
              engine.handleEditorChange()
            }
            if (update.focusChanged && !update.view.hasFocus) engine.handleEditorBlur()
            if (update.docChanged) {
              setHistDepths({ undo: undoDepth(update.state), redo: redoDepth(update.state) })
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    hostElRef.current?.appendChild(view.dom)
    engine.init()
    // Focus on open: a blinking cursor is the clearest "you can type here".
    view.focus()

    const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
      if (state.workspace !== prev.workspace) engine.handleStoreChange()
    })

    return () => {
      unsubscribe()
      engine.dispose()
      useWorkspaceStore.getState().setCodePaneDirty(false)
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

  const editorUndo = () => { const v = viewRef.current; if (v) { cmUndo(v); v.focus() } }
  const editorRedo = () => { const v = viewRef.current; if (v) { cmRedo(v); v.focus() } }

  const filename = activeWorkspaceFilename ?? `${workspaceName ?? 'workspace'}.dsl`
  const errorCount = status.errors.length

  // Layering: docked, the pane renders INLINE inside the canvas chrome wrapper
  // (a position:fixed stacking context) at z 40 — above the diagram's nodes
  // and edges, below the tools, panels, and dialogs (z 50+). Maximized, it is
  // the user's whole focus and must cover root-level chrome too (e.g. the
  // what's-new pill), which nothing inside the wrapper can do — so it escapes
  // through a portal to document.body at z 80. The editor DOM survives the
  // container switch via hostRefCb's re-attach.
  const pane = (
    <div
      data-canvas-chrome="code-pane"
      data-canvas-fit-chrome
      aria-label="Structurizr DSL editor"
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: minimized ? 'auto' : rect.h,
        zIndex: maximized ? 80 : 40,
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
      {/* Header — the drag handle */}
      <div
        data-code-pane-header
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button')) toggleMaximize() }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: minimized ? 'none' : '1px solid var(--color-border)',
          flexShrink: 0,
          cursor: maximized ? 'default' : 'move',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <span
          title="Edits here apply to the canvas once they parse cleanly. Your formatting is kept until the next canvas-side change re-serializes the text. Drag to move, double-click to maximize."
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={editorUndo}
            disabled={histDepths.undo === 0}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3, opacity: histDepths.undo === 0 ? 0.35 : 1 }}
            title="Undo edit (in editor)"
            aria-label="Undo DSL edit"
          >
            <Undo2 size={12} />
          </button>
          <button
            onClick={editorRedo}
            disabled={histDepths.redo === 0}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3, opacity: histDepths.redo === 0 ? 0.35 : 1 }}
            title="Redo edit (in editor)"
            aria-label="Redo DSL edit"
          >
            <Redo2 size={12} />
          </button>
          <button
            onClick={() => { const v = viewRef.current; if (v) { setMinimized(false); openSearchPanel(v); v.focus() } }}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3 }}
            title="Find in DSL (mod+F inside the editor)"
            aria-label="Find in DSL"
          >
            <Search size={12} />
          </button>
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
            onClick={() => setMinimized((m) => !m)}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3 }}
            title={minimized ? 'Restore' : 'Minimize'}
            aria-label={minimized ? 'Restore DSL pane' : 'Minimize DSL pane'}
          >
            {minimized ? <ChevronUp size={12} /> : <Minus size={12} />}
          </button>
          <button
            onClick={toggleMaximize}
            className="btn-icon"
            style={{ minWidth: 24, minHeight: 24, padding: 3 }}
            title={maximized ? 'Restore size' : 'Maximize'}
            aria-label={maximized ? 'Restore DSL pane size' : 'Maximize DSL pane'}
          >
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
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
      {!minimized && status.serializeError && (
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

      {/* Editor — kept mounted while minimized (display:none) so CodeMirror
          state, history, and the sync engine survive the collapse. */}
      <div
        ref={hostRefCb}
        data-code-pane-editor
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: minimized ? 'none' : 'block' }}
      />

      {/* Status footer — the pane's editability made visible: teaches that the
          text is live until the first successful apply, then reports sync state. */}
      {!minimized && (
        <div
          data-code-pane-footer
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-xxs)',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
            minHeight: 22,
          }}
        >
          {errorCount > 0 ? (
            <span
              data-code-pane-errors
              title={status.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('\n')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-danger, #f85149)' }}
            >
              <TriangleAlert size={10} />
              {errorCount} {errorCount === 1 ? 'error' : 'errors'} — canvas not updated
            </span>
          ) : status.pendingApply ? (
            <span>Editing — applies when it parses cleanly…</span>
          ) : everApplied ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-status-live, #3fb950)' }} />
              In sync with canvas
            </span>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Editable — changes here update the canvas as you type
            </span>
          )}
          {status.pendingApply && (
            <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', opacity: 0.8 }}>
              Mod+Enter applies now
            </span>
          )}
        </div>
      )}

      {/* Resize handles */}
      {!minimized && !maximized && (
        <>
          <div onPointerDown={onResizeStart('left')} style={{ ...EDGE_STYLE, left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }} />
          <div onPointerDown={onResizeStart('right')} style={{ ...EDGE_STYLE, right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }} />
          <div onPointerDown={onResizeStart('bottom')} style={{ ...EDGE_STYLE, left: 6, right: 6, bottom: 0, height: 6, cursor: 'ns-resize' }} />
          <div onPointerDown={onResizeStart('bottom-left')} style={{ ...EDGE_STYLE, left: 0, bottom: 0, width: 12, height: 12, cursor: 'nesw-resize' }} />
          <div onPointerDown={onResizeStart('bottom-right')} style={{ ...EDGE_STYLE, right: 0, bottom: 0, width: 12, height: 12, cursor: 'nwse-resize' }} />
        </>
      )}
    </div>
  )

  return maximized ? createPortal(pane, document.body) : pane
}

const EDGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  touchAction: 'none',
}
