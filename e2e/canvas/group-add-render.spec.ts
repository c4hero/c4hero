import { test, expect } from '../fixtures/workspace'

/**
 * Regression: clicking Group on the multi-select bar in multi-select mode
 * created an empty group (or none at all) — the bar's button click never
 * fired its onClick.
 *
 * Root cause: FloatingInspector attaches a document `mousedown` listener
 * that calls `clearSelection()` whenever the click target is outside the
 * inspector AND not inside `.react-flow` or `[data-canvas-chrome]`. The
 * MultiSelectBar wasn't tagged as canvas chrome, so mousedown on its
 * Group button cleared `selectedElementIds`, the bar re-rendered with
 * count<2 and unmounted, and the click event never reached the button.
 *
 * Fix: tag the MultiSelectBar wrapper with data-canvas-chrome so the
 * outside-click handler treats it as canvas chrome.
 */
test.describe('group renders when added via multi-select bar', () => {
  test('addGroup followed by selectGroup (programmatic) renders the group', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    const groupId = await workspace.page.evaluate((ids) => {
      type S = {
        addGroup: (n: string, ids: string[]) => string
        selectGroup: (id: string) => void
      }
      const w = window as unknown as { __testStore?: () => S }
      const store = w.__testStore?.()
      if (!store) return null
      const id = store.addGroup('Smoke Group', ids)
      store.selectGroup(id)
      return id
    }, ['customer', 'internetBanking'])
    expect(groupId).toBeTruthy()

    const groupNode = workspace.page.locator(`[data-id="group-${groupId}"]`)
    await expect(groupNode).toHaveCount(1, { timeout: 3000 })
    await expect(groupNode).toBeVisible()
  })

  test('dragging a group moves all its members by the same delta and persists', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    const groupId = await workspace.page.evaluate((ids) => {
      type S = {
        addGroup: (n: string, ids: string[]) => string
        selectGroup: (id: string) => void
      }
      const w = window as unknown as { __testStore?: () => S }
      const s = w.__testStore?.()
      const id = s!.addGroup('Drag Test', ids)
      s!.selectGroup(id)
      return id
    }, ['customer', 'internetBanking'])
    expect(groupId).toBeTruthy()
    await workspace.page.waitForTimeout(400)

    const before = await workspace.page.evaluate(() => {
      type WS = { views: { systemContextViews: Array<{ elements: Array<{ id: string; x?: number; y?: number }> }> } }
      const ws = (window as unknown as { __testGetWorkspace?: () => WS }).__testGetWorkspace?.()
      return ws!.views.systemContextViews[0].elements
        .filter((e) => e.id === 'customer' || e.id === 'internetBanking')
        .map((e) => ({ id: e.id, x: e.x ?? 0, y: e.y ?? 0 }))
    })

    // Pick up the group by its top-left label corner and drag by (200, 100).
    const groupNode = workspace.page.locator(`[data-id="group-${groupId}"]`)
    const gbox = await groupNode.boundingBox()
    if (!gbox) throw new Error('group node has no bounding box')
    const startX = gbox.x + 20
    const startY = gbox.y + 12
    await workspace.page.mouse.move(startX, startY)
    await workspace.page.mouse.down()
    await workspace.page.mouse.move(startX + 200, startY + 100, { steps: 10 })
    await workspace.page.mouse.up()
    await workspace.page.waitForTimeout(400)

    const after = await workspace.page.evaluate(() => {
      type WS = { views: { systemContextViews: Array<{ elements: Array<{ id: string; x?: number; y?: number }> }> } }
      const ws = (window as unknown as { __testGetWorkspace?: () => WS }).__testGetWorkspace?.()
      return ws!.views.systemContextViews[0].elements
        .filter((e) => e.id === 'customer' || e.id === 'internetBanking')
        .map((e) => ({ id: e.id, x: e.x ?? 0, y: e.y ?? 0 }))
    })

    const a = before.find((p) => p.id === 'customer')!
    const a2 = after.find((p) => p.id === 'customer')!
    const b = before.find((p) => p.id === 'internetBanking')!
    const b2 = after.find((p) => p.id === 'internetBanking')!

    const dxA = a2.x - a.x
    const dyA = a2.y - a.y
    const dxB = b2.x - b.x
    const dyB = b2.y - b.y

    // Both members translated by IDENTICAL deltas (the whole cluster moved as a unit).
    expect(Math.abs(dxA - dxB)).toBeLessThan(1)
    expect(Math.abs(dyA - dyB)).toBeLessThan(1)
    // And they actually moved.
    expect(Math.abs(dxA)).toBeGreaterThan(50)
    expect(Math.abs(dyA)).toBeGreaterThan(25)
  })

  test('clicking Group on the multi-select bar in multi-select mode renders the group', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    // Toggle multi-select mode and click two nodes so the bar appears.
    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('Internet Banking System')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    // Click the Group button on the bar.
    await workspace.page.locator('button[title="Group 2 elements"]').click()

    // The new group should render.
    const groupNodes = workspace.page.locator('.react-flow__node[data-id^="group-"]')
    await expect(groupNodes).toHaveCount(1, { timeout: 3000 })
    await expect(groupNodes.first()).toBeVisible()

    // And the store should have the group with both selected elementIds.
    const storeGroups = await workspace.page.evaluate(() => {
      const w = window as unknown as { __testGetWorkspace?: () => { model?: { groups?: Array<{ elementIds: string[] }> } } }
      return w.__testGetWorkspace?.()?.model?.groups ?? []
    })
    expect(storeGroups).toHaveLength(1)
    expect(storeGroups[0].elementIds).toEqual(['customer', 'internetBanking'])
  })
})
