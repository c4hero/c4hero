import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDslSyncEngine, type DslSyncEngine, type DslSyncStatus } from './dslSyncEngine'
import type { ParseError } from '@/lib/dsl'

interface Harness {
  engine: DslSyncEngine
  editorText: { value: string }
  writeText: ReturnType<typeof vi.fn>
  serialize: ReturnType<typeof vi.fn>
  apply: ReturnType<typeof vi.fn>
  lastStatus: () => DslSyncStatus
}

function makeHarness(overrides: {
  serialize?: () => { text: string } | { error: string }
  apply?: (text: string) => { ok: boolean; errors: ParseError[] }
} = {}): Harness {
  const editorText = { value: '' }
  const statuses: DslSyncStatus[] = []
  const writeText = vi.fn((text: string) => { editorText.value = text })
  const serialize = vi.fn(overrides.serialize ?? (() => ({ text: 'serialized-dsl' })))
  const apply = vi.fn(overrides.apply ?? (() => ({ ok: true, errors: [] })))
  const engine = createDslSyncEngine({
    readText: () => editorText.value,
    writeText,
    serialize,
    apply,
    onStatus: (s) => statuses.push(s),
  })
  return {
    engine, editorText, writeText, serialize, apply,
    lastStatus: () => statuses[statuses.length - 1],
  }
}

describe('dslSyncEngine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('init seeds the editor from the store', () => {
    const h = makeHarness()
    h.engine.init()
    expect(h.writeText).toHaveBeenCalledWith('serialized-dsl')
    expect(h.lastStatus().serializeError).toBeNull()
  })

  it('debounces keystrokes and applies once', () => {
    const h = makeHarness()
    h.engine.init()
    h.editorText.value = 'edit 1'
    h.engine.handleEditorChange()
    h.editorText.value = 'edit 2'
    h.engine.handleEditorChange()
    expect(h.apply).not.toHaveBeenCalled()
    expect(h.lastStatus().pendingApply).toBe(true)

    vi.advanceTimersByTime(500)
    expect(h.apply).toHaveBeenCalledTimes(1)
    expect(h.apply).toHaveBeenCalledWith('edit 2')
    expect(h.lastStatus().pendingApply).toBe(false)
    expect(h.lastStatus().errors).toEqual([])
  })

  it('suppresses store-to-editor sync while the editor owns the text', () => {
    const h = makeHarness()
    h.engine.init()
    h.writeText.mockClear()

    h.editorText.value = 'typing...'
    h.engine.handleEditorChange()
    // A canvas edit lands mid-typing — must not clobber the editor.
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.writeText).not.toHaveBeenCalled()
  })

  it('ignores the store notification fired by its own apply', () => {
    const h = makeHarness()
    // Simulate zustand notifying synchronously inside replaceWorkspaceFromDSL.
    h.apply.mockImplementation(() => {
      h.engine.handleStoreChange()
      return { ok: true, errors: [] }
    })
    h.engine.init()
    h.writeText.mockClear()
    h.serialize.mockClear()

    h.editorText.value = 'new dsl'
    h.engine.handleEditorChange()
    vi.advanceTimersByTime(500) // apply fires, notifying handleStoreChange re-entrantly
    vi.advanceTimersByTime(200) // any (incorrectly) scheduled store sync would fire here
    expect(h.serialize).not.toHaveBeenCalled()
    expect(h.writeText).not.toHaveBeenCalled()
  })

  it('a failed apply keeps editor ownership and reports errors', () => {
    const errors: ParseError[] = [{ message: 'Unexpected token', line: 3, column: 5 }]
    const h = makeHarness({ apply: () => ({ ok: false, errors }) })
    h.engine.init()
    h.writeText.mockClear()

    h.editorText.value = 'broken dsl'
    h.engine.handleEditorChange()
    vi.advanceTimersByTime(500)
    expect(h.lastStatus().errors).toEqual(errors)
    expect(h.lastStatus().pendingApply).toBe(true)

    // Canvas edits still must not clobber the broken text being fixed —
    // not even after a blur.
    h.engine.handleEditorBlur()
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.writeText).not.toHaveBeenCalled()
  })

  it('a successful apply returns ownership to the store', () => {
    const h = makeHarness()
    h.engine.init()
    h.editorText.value = 'new dsl'
    h.engine.handleEditorChange()
    vi.advanceTimersByTime(500)
    h.writeText.mockClear()

    h.serialize.mockReturnValue({ text: 'canvas-updated-dsl' })
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.writeText).toHaveBeenCalledWith('canvas-updated-dsl')
  })

  it('debounces store changes', () => {
    const h = makeHarness()
    h.engine.init()
    h.serialize.mockClear()
    h.engine.handleStoreChange()
    h.engine.handleStoreChange()
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.serialize).toHaveBeenCalledTimes(1)
  })

  it('skips the editor write when the serialized text is unchanged', () => {
    const h = makeHarness()
    h.engine.init()
    h.writeText.mockClear()
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.writeText).not.toHaveBeenCalled() // editor already holds 'serialized-dsl'
  })

  it('surfaces serialization failures instead of clobbering the editor', () => {
    const h = makeHarness()
    h.engine.init()
    h.writeText.mockClear()
    h.serialize.mockReturnValue({ error: 'Group overlaps boundary' })
    h.engine.handleStoreChange()
    vi.advanceTimersByTime(200)
    expect(h.lastStatus().serializeError).toBe('Group overlaps boundary')
    expect(h.writeText).not.toHaveBeenCalled()
  })

  it('flush applies pending text immediately', () => {
    const h = makeHarness()
    h.engine.init()
    h.editorText.value = 'flush me'
    h.engine.handleEditorChange()
    h.engine.flush()
    expect(h.apply).toHaveBeenCalledWith('flush me')
    // The debounced timer must not fire a second apply afterwards.
    vi.advanceTimersByTime(500)
    expect(h.apply).toHaveBeenCalledTimes(1)
  })

  it('dispose cancels pending work', () => {
    const h = makeHarness()
    h.engine.init()
    h.editorText.value = 'never applied'
    h.engine.handleEditorChange()
    h.engine.dispose()
    vi.advanceTimersByTime(500)
    expect(h.apply).not.toHaveBeenCalled()
  })
})
