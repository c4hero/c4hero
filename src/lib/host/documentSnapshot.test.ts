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
  it('keeps legacy sidecar metadata when a layout save preserves the DSL', async () => {
    const root = content.replace('p = person "Person"', 'p = person "Person"\n  s = softwareSystem "System"\n  p -> s "Uses"')
    const { workspace: parsed } = await loadWorkspaceDocument({ content: root })
    const relationshipId = parsed.model.relationships[0].id
    const sidecarJson = JSON.stringify({
      version: 1,
      elements: { p: { status: 'Current', owner: 'Platform' } },
      relationships: { [relationshipId]: { lineStyle: 'Orthogonal' } },
    })
    const { workspace } = await loadWorkspaceDocument({ content: root, sidecarJson })
    const capture = createSnapshotProjector(workspace, { content: root, sidecarJson, includes: {} })
    const element = workspace.views.systemLandscapeViews[0].elements[0]
    Object.assign(element, { x: 135, y: 246, pinned: true })
    const snapshot = capture(workspace)
    expect(snapshot.content).toBe(root)
    const { workspace: reopened } = await loadWorkspaceDocument(snapshot)
    expect(reopened.model.people[0]).toMatchObject({ status: 'Current', owner: 'Platform' })
    expect(reopened.model.relationships[0].lineStyle).toBe('Orthogonal')
  })
  it('removes legacy fallbacks when their metadata is cleared in the DSL', async () => {
    const sidecarJson = JSON.stringify({ version: 1, elements: { p: { status: 'Current', owner: 'Platform' } } })
    const { workspace } = await loadWorkspaceDocument({ content, sidecarJson })
    const capture = createSnapshotProjector(workspace, { content, sidecarJson, includes: {} })
    workspace.model.people[0].status = undefined
    workspace.model.people[0].owner = undefined
    const snapshot = capture(workspace)
    const { workspace: reopened } = await loadWorkspaceDocument(snapshot)
    expect(reopened.model.people[0].status).toBeUndefined()
    expect(reopened.model.people[0].owner).toBeUndefined()
    expect(JSON.parse(snapshot.sidecarJson!).elements).toBeUndefined()
  })
  it('keeps legacy included-file metadata until that fragment is rewritten', async () => {
    const root = content.replace('p = person "Person"', '!include people.dsl')
    const fragment = 'p = person "Person"\n'
    const sidecarJson = JSON.stringify({ version: 1, elements: { p: { owner: 'Platform' } } })
    const { workspace } = await loadWorkspaceDocument({ content: root, sidecarJson, readInclude: async () => fragment })
    const capture = createSnapshotProjector(workspace, { content: root, sidecarJson, includes: { 'people.dsl': fragment } })
    workspace.name = 'Renamed root'
    Object.assign(workspace.views.systemLandscapeViews[0].elements[0], { x: 135, y: 246, pinned: true })
    const snapshot = capture(workspace)
    expect(snapshot.includes['people.dsl']).toBe(fragment)
    const { workspace: reopened } = await loadWorkspaceDocument({ ...snapshot, readInclude: async path => snapshot.includes[path] ?? null })
    expect(reopened.model.people[0].owner).toBe('Platform')
    workspace.model.people[0].owner = undefined
    const cleared = capture(workspace)
    const { workspace: reopenedCleared } = await loadWorkspaceDocument({ ...cleared, readInclude: async path => cleared.includes[path] ?? null })
    expect(reopenedCleared.model.people[0].owner).toBeUndefined()
  })
})
