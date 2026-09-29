import { describe, it, expect } from 'vitest'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { createSnapshotProjector } from './documentSnapshot'

const content = `workspace "Test" {
 model {
  p = person "Person"
 }
 views {
  systemLandscape "All" {
   include *
  }
 }
}\n`

describe('VS Code document snapshots', () => {
  it('preserves source bytes and does not create a sidecar on open', async () => {
    const { workspace } = await loadWorkspaceDocument({ content })
    const capture = createSnapshotProjector(workspace, { content, includes: {} })
    expect(capture(workspace)).toEqual({ content, sidecarJson: undefined, includes: {} })
  })
  it('saves a layout-only change without canonicalizing the DSL', async () => {
    const { workspace } = await loadWorkspaceDocument({ content })
    const capture = createSnapshotProjector(workspace, { content, includes: {} })
    const element = workspace.views.systemLandscapeViews[0].elements[0]
    element.x = 135; element.y = 246; element.pinned = true
    const snapshot = capture(workspace)
    expect(snapshot.content).toBe(content)
    expect(JSON.parse(snapshot.sidecarJson!).views.All.elements.p).toMatchObject({ x: 135, y: 246, pinned: true })
  })
  it('includes changed fragments while leaving the root source untouched', async () => {
    const root = 'workspace "Test" {\n model {\n !include people.dsl\n }\n}\n'
    const fragment = 'p = person "Person"\n'
    const { workspace, errors } = await loadWorkspaceDocument({ content: root, readInclude: async () => fragment })
    expect(errors).toEqual([])
    const capture = createSnapshotProjector(workspace, { content: root, includes: { 'people.dsl': fragment } })
    expect(capture(workspace).includes['people.dsl']).toBe(fragment)
    workspace.model.people[0].name = 'Renamed'
    const snapshot = capture(workspace)
    expect(snapshot.content).toBe(root)
    expect(snapshot.includes['people.dsl']).toContain('"Renamed"')
  })
})
