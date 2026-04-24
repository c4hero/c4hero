import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

type RelationshipState = {
  modelIds: string[]
  allViewRelationshipIds: string[]
  visibleEdgeCount: number
}

async function getRelationshipState(workspace: WorkspaceHelper): Promise<RelationshipState> {
  const snapshot = await workspace.getWorkspace()
  const allViews = [
    ...(snapshot?.views.systemLandscapeViews ?? []),
    ...(snapshot?.views.systemContextViews ?? []),
    ...(snapshot?.views.containerViews ?? []),
    ...(snapshot?.views.componentViews ?? []),
  ]

  return {
    modelIds: (snapshot?.model.relationships ?? []).map((relationship) => relationship.id),
    allViewRelationshipIds: allViews.flatMap((view) => view.relationships.map((relationship) => relationship.id)),
    visibleEdgeCount: await workspace.getEdgeCount(),
  }
}

test.describe('Invalid relationship gestures', () => {
  test('attempted self-connect gesture leaves model, view refs, and visible edges unchanged', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.fitView()

    const before = await getRelationshipState(workspace)
    expect(before).toEqual({ modelIds: [], allViewRelationshipIds: [], visibleEdgeCount: 0 })

    await workspace.dragNodeHandleToNode('New System', 'New System')

    const after = await getRelationshipState(workspace)
    expect(after).toEqual(before)
  })

  test('attempted reconnect-to-self gesture leaves relationship state unchanged', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    const before = await getRelationshipState(workspace)
    expect(before.modelIds).toHaveLength(1)
    expect(before.allViewRelationshipIds).toEqual(before.modelIds)
    expect(before.visibleEdgeCount).toBe(1)

    const relId = before.modelIds[0]
    await workspace.selectNewestRelationship()
    await expect(workspace.page.locator(`[data-testid="rf__edge-${relId}"] .react-flow__edgeupdater-source`).first()).toBeVisible()
    await workspace.reconnectEdgeEndpoint(relId, 'source', 'New System 2')

    const after = await getRelationshipState(workspace)
    expect(after).toEqual(before)
  })
})
