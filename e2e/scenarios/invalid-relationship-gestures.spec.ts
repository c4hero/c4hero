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

async function dragBetweenPoints(
  workspace: WorkspaceHelper,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await workspace.page.mouse.move(start.x, start.y)
  await workspace.page.mouse.down()
  await workspace.page.mouse.move(end.x, end.y, { steps: 15 })
  await workspace.page.mouse.up()
  await workspace.page.waitForTimeout(400)
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

    const node = workspace.getVisibleNodeByName('New System')
    await node.hover()

    const handle = node.locator('[data-handleid$="-b-source"]').first()
    const handleBox = await handle.boundingBox()
    const nodeBox = await node.boundingBox()
    if (!handleBox || !nodeBox) throw new Error('Could not get self-connect drag coordinates')

    await dragBetweenPoints(
      workspace,
      { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 },
      { x: nodeBox.x + nodeBox.width / 2, y: nodeBox.y + nodeBox.height / 2 },
    )

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

    await workspace.selectNewestRelationship()
    const updater = workspace.page.locator('.react-flow__edgeupdater-source').first()
    await expect(updater).toBeVisible()

    const updaterBox = await updater.boundingBox()
    const targetNodeBox = await workspace.getVisibleNodeByName('New System 2').boundingBox()
    if (!updaterBox || !targetNodeBox) throw new Error('Could not get reconnect drag coordinates')

    await dragBetweenPoints(
      workspace,
      { x: updaterBox.x + updaterBox.width / 2, y: updaterBox.y + updaterBox.height / 2 },
      { x: targetNodeBox.x + targetNodeBox.width / 2, y: targetNodeBox.y + targetNodeBox.height / 2 },
    )

    const after = await getRelationshipState(workspace)
    expect(after).toEqual(before)
  })
})
