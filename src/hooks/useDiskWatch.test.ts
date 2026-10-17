import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { hashSnapshot } from '@/lib/fileWatch'
import { applyDiskSnapshot } from './useDiskWatch'

const DSL = `workspace "W" {
  model {
    u = person "User"
    sys = softwareSystem "Sys"
    u -> sys "Uses"
  }
  views {
    systemLandscape "Land" { include * }
  }
}`

function store() { return useWorkspaceStore.getState() }

describe('applyDiskSnapshot', () => {
  beforeEach(() => {
    const { workspace } = parseDSL(DSL)
    store().loadWorkspace(workspace)
  })

  it('reloads clean DSL and reports success', async () => {
    const snapshot = { content: DSL.replace('"User"', '"Customer"') }
    expect(await applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))).toBe(true)
    expect(store().workspace!.model.people[0].name).toBe('Customer')
    expect(store().diskConflict).toBeNull()
  })

  it('applies the sidecar from disk alongside the DSL', async () => {
    const sidecar = JSON.stringify({
      version: 1,
      views: { Land: { elements: { u: { x: 123, y: 456 } } } },
    })
    const snapshot = { content: DSL, sidecarJson: sidecar }
    expect(await applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))).toBe(true)
    const land = store().workspace!.views.systemLandscapeViews[0]
    const placed = land.elements.find((e) => e.id === 'u')
    expect(placed?.x).toBe(123)
    expect(placed?.y).toBe(456)
  })

  it('raises an unparseable conflict instead of applying broken text', async () => {
    const before = store().workspace
    const snapshot = { content: 'workspace "Broken" { model { u = person }' }
    expect(await applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))).toBe(false)
    expect(store().workspace).toBe(before)
    expect(store().diskConflict?.reason).toBe('unparseable')
    expect(store().diskConflict?.detail).toMatch(/parse error/)
  })

  it('refuses to empty a populated model silently', async () => {
    const before = store().workspace
    const snapshot = { content: 'workspace "Empty" { model { } views { } }' }
    expect(await applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))).toBe(false)
    expect(store().workspace).toBe(before)
    expect(store().diskConflict?.detail).toMatch(/empty model/)
  })

  it('does not reopen a workspace closed while its disk snapshot was parsing', async () => {
    const snapshot = { content: DSL.replace('"User"', '"Disk user"') }
    const applying = applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))
    store().closeWorkspace()
    expect(await applying).toBe(false)
    expect(store().workspace).toBeNull()
    expect(store().diskConflict).toBeNull()
  })

  it('preserves a local edit made while a disk snapshot was parsing', async () => {
    const snapshot = { content: DSL.replace('"User"', '"Disk user"') }
    const applying = applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot))
    store().replaceWorkspaceFromDSL(DSL.replace('"User"', '"Local user"'))
    expect(await applying).toBe(false)
    expect(store().workspace!.model.people[0].name).toBe('Local user')
    expect(store().diskConflict?.reason).toBe('dirty')
  })

  it('does not apply a parsed snapshot after its watch target is invalidated', async () => {
    const snapshot = { content: DSL.replace('"User"', '"Disk user"') }
    const before = store().workspace
    expect(await applyDiskSnapshot('w.dsl', snapshot, hashSnapshot(snapshot), () => false)).toBe(false)
    expect(store().workspace).toBe(before)
  })
})
