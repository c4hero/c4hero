import type { ParseError } from '@/lib/dsl'

/** What the pane header renders. */
export interface DslSyncStatus {
  /** Parse/integrity errors from the last rejected apply (empty when clean). */
  errors: ParseError[]
  /** Serialization failure (e.g. GroupSerializationError) — store-to-editor sync is stalled. */
  serializeError: string | null
  /** True while the editor holds text that has not (yet) been applied to the store. */
  pendingApply: boolean
}

export interface DslSyncEngineOpts {
  /** Current editor document. */
  readText: () => string
  /** Programmatic editor replace (must NOT re-enter handleEditorChange). */
  writeText: (text: string) => void
  /** Serialize the current workspace, or report why it can't be. */
  serialize: () => { text: string } | { error: string }
  /** Apply editor text to the store (replaceWorkspaceFromDSL). */
  apply: (text: string) => { ok: boolean; errors: ParseError[] }
  onStatus: (status: DslSyncStatus) => void
  /** Debounce for editor keystrokes before an apply attempt. */
  editorDebounceMs?: number
  /** Debounce for store changes before re-serializing into the editor. */
  storeDebounceMs?: number
}

/**
 * The two-way sync state machine between the DSL text editor and the workspace
 * store, kept free of CodeMirror and zustand so it is unit-testable.
 *
 * Ownership rules (the anti-clobber core):
 * - A keystroke hands ownership to the editor; store-driven re-serialization is
 *   suspended so canvas edits can't overwrite what the user is typing.
 * - A successful apply (or a blur with nothing pending) hands ownership back to
 *   the store.
 * - The store notification fired by our own apply is ignored (applying flag —
 *   zustand notifies synchronously inside apply()).
 * - A failed apply keeps editor ownership: the broken text stays put for the
 *   user to fix, and the canvas keeps the last good state.
 */
export function createDslSyncEngine(opts: DslSyncEngineOpts) {
  const editorDebounceMs = opts.editorDebounceMs ?? 500
  const storeDebounceMs = opts.storeDebounceMs ?? 200

  let owner: 'store' | 'editor' = 'store'
  let applying = false
  let disposed = false
  let editorTimer: ReturnType<typeof setTimeout> | null = null
  let storeTimer: ReturnType<typeof setTimeout> | null = null
  const status: DslSyncStatus = { errors: [], serializeError: null, pendingApply: false }

  function emit() {
    opts.onStatus({ ...status, errors: [...status.errors] })
  }

  function syncFromStore() {
    if (disposed || owner === 'editor') return
    const result = opts.serialize()
    if ('error' in result) {
      status.serializeError = result.error
      emit()
      return
    }
    status.serializeError = null
    if (result.text !== opts.readText()) opts.writeText(result.text)
    emit()
  }

  function applyNow() {
    if (disposed) return
    const text = opts.readText()
    applying = true
    let result: { ok: boolean; errors: ParseError[] }
    try {
      result = opts.apply(text)
    } finally {
      applying = false
    }
    if (result.ok) {
      status.errors = []
      status.pendingApply = false
      owner = 'store'
    } else {
      status.errors = result.errors
      status.pendingApply = true
      // Keep editor ownership — the user is mid-fix.
    }
    emit()
  }

  return {
    /** Seed the editor from the store (call once after the editor mounts). */
    init() {
      syncFromStore()
    },

    /** A user keystroke in the editor. */
    handleEditorChange() {
      if (disposed) return
      owner = 'editor'
      status.pendingApply = true
      emit()
      if (editorTimer) clearTimeout(editorTimer)
      editorTimer = setTimeout(applyNow, editorDebounceMs)
    },

    /** Editor lost focus. Ownership returns to the store only when nothing is
     *  pending — otherwise a canvas edit would clobber unapplied/broken text. */
    handleEditorBlur() {
      if (disposed) return
      if (!status.pendingApply && status.errors.length === 0) owner = 'store'
    },

    /** The store's workspace reference changed. */
    handleStoreChange() {
      if (disposed || applying) return
      if (owner === 'editor') return
      if (storeTimer) clearTimeout(storeTimer)
      storeTimer = setTimeout(syncFromStore, storeDebounceMs)
    },

    /** Apply immediately, skipping the keystroke debounce (Cmd/Ctrl+Enter). */
    flush() {
      if (editorTimer) { clearTimeout(editorTimer); editorTimer = null }
      if (status.pendingApply) applyNow()
    },

    dispose() {
      disposed = true
      if (editorTimer) clearTimeout(editorTimer)
      if (storeTimer) clearTimeout(storeTimer)
    },
  }
}

export type DslSyncEngine = ReturnType<typeof createDslSyncEngine>
