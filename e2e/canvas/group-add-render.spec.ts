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
