import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/workspace'

/**
 * Regression (GH #84): when one group is fully nested inside another
 * (every element of the inner group also belongs to the outer group), the
 * outer group's background sat at the same z-index as the inner group's, so
 * ties were broken by array order — whichever group came later always won
 * every click within the overlap, regardless of size.
 *
 * Fix: group nodes now get a z-index offset by nesting depth
 * (canvasBuilders.ts `groupNestingDepth`), so a group nested inside another
 * renders — and hit-tests — above its container.
 */

type TestStore = {
  addGroup: (name: string, ids: string[]) => string
  selectedGroupId: string | null
}

function getStore(page: Page) {
  return page.evaluate(() => (window as unknown as { __testStore?: () => TestStore }).__testStore?.())
}

async function getGroupBackgroundPoint(page: Page, groupId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`[data-id="group-${id}"]`) as HTMLElement | null
    if (!node) throw new Error(`group node not found: ${id}`)
    const rect = node.getBoundingClientRect()
    const candidates = [
      { x: rect.left + 12, y: rect.top + 40 },
      { x: rect.right - 12, y: rect.top + 40 },
      { x: rect.left + rect.width / 2, y: rect.top + 40 },
      { x: rect.left + 12, y: rect.bottom - 12 },
    ]
    for (const point of candidates) {
      const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
      if (target?.closest(`[data-id="group-${id}"]`)) return point
    }
    return candidates[0]
  }, groupId)
}

test.describe('nested/overlapping group selection', () => {
  test('clicking the inner group selects it, not the outer container', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() =>
      (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    const ids = await workspace.page.evaluate(() => {
      const store = (window as unknown as { __testStore?: () => TestStore }).__testStore?.()
      if (!store) throw new Error('no store')
      const innerId = store.addGroup('Inner', ['customer', 'internetBanking'])
      const outerId = store.addGroup('Outer', ['customer', 'internetBanking', 'supportStaff', 'atm'])
      return { innerId, outerId }
    })
    expect(ids.innerId).toBeTruthy()
    expect(ids.outerId).toBeTruthy()
    await workspace.page.waitForTimeout(300)

    const innerNode = workspace.page.locator(`[data-id="group-${ids.innerId}"]`)
    const outerNode = workspace.page.locator(`[data-id="group-${ids.outerId}"]`)
    await expect(innerNode).toBeVisible()
    await expect(outerNode).toBeVisible()

    const innerBox = await innerNode.boundingBox()
    const outerBox = await outerNode.boundingBox()
    if (!innerBox || !outerBox) throw new Error('missing bounding boxes')
    // Sanity check the fixture actually reproduces overlap before asserting the fix.
    expect(innerBox.x).toBeGreaterThanOrEqual(outerBox.x)
    expect(innerBox.y).toBeGreaterThanOrEqual(outerBox.y)
    expect(innerBox.x + innerBox.width).toBeLessThanOrEqual(outerBox.x + outerBox.width)
    expect(innerBox.y + innerBox.height).toBeLessThanOrEqual(outerBox.y + outerBox.height)

    const point = await getGroupBackgroundPoint(workspace.page, ids.innerId)
    await workspace.page.mouse.click(point.x, point.y)
    await workspace.page.waitForTimeout(200)

    const store = await getStore(workspace.page)
    expect(store?.selectedGroupId).toBe(ids.innerId)
  })
})
