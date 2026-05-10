import { test, expect } from '../fixtures/workspace'

/**
 * Regressions covered:
 *  - PR #39 (multiselect-align-persists): handleAlign relied on
 *    reactFlow.setNodes(fn) running its callback synchronously to populate
 *    the alignedPositions array passed to updateNodePositions. RF defers
 *    the callback, so the persist step silently no-op'd and the canvas
 *    didn't move.
 *  - PR #40 (align-prevents-overlap): aligning two nodes that happened to
 *    share the OTHER axis stacked them on top of each other. After-align
 *    pass now sorts by the preserved axis and nudges any pair that would
 *    overlap apart by the predecessor's size + a 24px gap.
 */
test.describe('multi-select bar — align', () => {
  test('Align top makes both selected nodes share the same y AND persists', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('Internet Banking System')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    const before = await readPositions(workspace.page, ['customer', 'internetBanking'])
    expect(before.find((p) => p.id === 'customer')!.y)
      .not.toBe(before.find((p) => p.id === 'internetBanking')!.y)

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align top' }).click()
    await workspace.page.waitForTimeout(300)

    const after = await readPositions(workspace.page, ['customer', 'internetBanking'])
    const yA = after.find((p) => p.id === 'customer')!.y
    const yB = after.find((p) => p.id === 'internetBanking')!.y
    expect(Math.abs(yA - yB)).toBeLessThan(0.5)
    // The persist step actually wrote new positions to the store.
    expect(after).not.toEqual(before)
  })

  test('Align top spreads two close-x nodes apart so they do not overlap', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    // Force the two nodes to be very close on the x axis but far on y so
    // an Align top would naively stack them.
    await workspace.page.evaluate(() => {
      type S = { updateNodePositions: (u: { id: string; x: number; y: number }[]) => void }
      const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
      store?.updateNodePositions([
        { id: 'customer', x: 100, y: 50 },
        { id: 'internetBanking', x: 110, y: 400 },
      ])
    })
    await workspace.page.waitForTimeout(200)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('Internet Banking System')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align top' }).click()
    await workspace.page.waitForTimeout(300)

    const after = await readPositions(workspace.page, ['customer', 'internetBanking'])
    const a = after.find((p) => p.id === 'customer')!
    const b = after.find((p) => p.id === 'internetBanking')!
    // Same y after Align top.
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.5)
    // But x-distance must be at least the (default) node width so they do
    // NOT visually overlap. We don't have measured widths in the store, so
    // assert the distance is more than 100 — the broken behavior would
    // have left them at x=100 and x=110 (a 10px gap on the same y).
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(100)
  })
})

test.describe('multi-select bar — delete', () => {
  test('Delete from model shows impact-aware confirm dialog', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const landscape = views.find(v => v.type === 'systemLandscape')
    test.skip(!landscape, 'sample workspace has no landscape view')
    await workspace.setView(landscape!.key)

    // Pick two systems with containers (so cascade is visible)
    const ws = await workspace.getWorkspace()
    const systems = ws!.model.softwareSystems.filter(s => s.containers.length > 0).slice(0, 2)
    test.skip(systems.length < 2, 'sample workspace has fewer than 2 systems with containers')

    // Multi-select via shift-click
    await workspace.clickNode(systems[0].name)
    await workspace.page.keyboard.down('Shift')
    await workspace.clickNode(systems[1].name)
    await workspace.page.keyboard.up('Shift')

    // Click "Delete from model" in the toolbar
    await workspace.page.getByRole('button', { name: /delete from model/i }).first().click()

    // Confirm dialog appears with impact list
    const dialog = workspace.page.getByRole('dialog', { name: /confirm delete/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('list', { name: /cascade impact/i })).toBeVisible()
  })
})

async function readPositions(page: import('@playwright/test').Page, ids: string[]) {
  return page.evaluate(({ ids }) => {
    type WS = { views: { systemContextViews: Array<{ elements: Array<{ id: string; x?: number; y?: number }> }> } }
    const ws = (window as unknown as { __testGetWorkspace?: () => WS }).__testGetWorkspace?.()
    const view = ws?.views.systemContextViews[0]
    return view!.elements
      .filter((e) => ids.includes(e.id))
      .map((e) => ({ id: e.id, x: e.x ?? 0, y: e.y ?? 0 }))
  }, { ids })
}
