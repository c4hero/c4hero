import { test, expect } from '../fixtures/workspace'

/** A view whose auto-arrange result visibly moves things around. */
const DSL = `workspace "Locking" {
  model {
    customer = person "Customer"
    web = softwareSystem "Web App"
    api = softwareSystem "API"
    db = softwareSystem "Database"

    customer -> web "Uses"
    web -> api "Calls"
    api -> db "Reads"
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout tb
    }
  }
}`

/** Position of a node in canvas coordinates, so viewport fitting after an
 *  auto-arrange doesn't masquerade as the node having moved. */
async function canvasPosition(workspace: { page: import('@playwright/test').Page }, id: string) {
  return workspace.page.evaluate((elementId) => {
    const store = (window as Record<string, unknown>).__testStore as () => {
      workspace: { views: Record<string, Array<{ key: string; elements: Array<{ id: string; x?: number; y?: number; locked?: boolean }> }>> }
      activeViewKey: string | null
    }
    const state = store()
    for (const views of Object.values(state.workspace.views)) {
      if (!Array.isArray(views)) continue
      const view = views.find((v) => v.key === state.activeViewKey)
      if (!view) continue
      const el = view.elements.find((e) => e.id === elementId)
      return el ? { x: el.x, y: el.y, locked: el.locked === true } : null
    }
    return null
  }, id)
}

async function autoArrange(workspace: { page: import('@playwright/test').Page }, direction: string) {
  await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
  await workspace.page.getByRole('button', { name: direction }).click()
  await workspace.page.waitForTimeout(600)
}

test.describe('Node locking', () => {
  test('a locked node keeps its exact position through Auto-arrange', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    await workspace.clickNode('API')
    await workspace.expectInspectorFor('API')
    await workspace.page.getByRole('button', { name: 'Lock position', exact: true }).click()

    const locked = await canvasPosition(workspace, 'api')
    expect(locked?.locked).toBe(true)
    expect(locked?.x).toBeDefined()

    const movableBefore = await canvasPosition(workspace, 'web')

    await autoArrange(workspace, 'Left to right')

    // The lock held...
    const lockedAfter = await canvasPosition(workspace, 'api')
    expect(lockedAfter).toMatchObject({ x: locked!.x, y: locked!.y, locked: true })

    // ...and everything else genuinely re-laid out around it.
    const movableAfter = await canvasPosition(workspace, 'web')
    expect(movableAfter).not.toEqual(movableBefore)
  })

  test('a locked node cannot be dragged, and unlocking releases it', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    await workspace.clickNode('API')
    await workspace.page.getByRole('button', { name: 'Lock position', exact: true }).click()
    const before = await canvasPosition(workspace, 'api')

    await workspace.dragNodeBy('API', { x: 150, y: 120 })
    expect(await canvasPosition(workspace, 'api')).toMatchObject({ x: before!.x, y: before!.y })

    // The canvas says so, visibly — and without needing a hover. `toBeVisible`
    // alone would pass on an opacity-0 element, which is how this first shipped.
    const glyph = workspace.page.locator('.react-flow__node[data-id="api"] .c4-node-lock')
    await expect(glyph).toBeVisible()
    await workspace.page.mouse.move(5, 5)
    await workspace.page.waitForTimeout(300)
    const opacity = await glyph.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement
      let effective = 1
      while (node) {
        effective *= Number(window.getComputedStyle(node).opacity)
        node = node.parentElement
      }
      return effective
    })
    expect(opacity).toBeGreaterThan(0.5)

    await workspace.clickNode('API')
    await workspace.page.getByRole('button', { name: 'Unlock position', exact: true }).click()
    await workspace.dragNodeBy('API', { x: 150, y: 120 })

    const after = await canvasPosition(workspace, 'api')
    expect(after?.locked).toBe(false)
    expect(after?.x).not.toBe(before?.x)
  })

  test('Unlock all appears in the Auto-arrange menu and clears every lock', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    const arrangeMenu = workspace.page.locator('[data-flyout="arrange"]')
    const unlockAll = workspace.page.getByRole('button', { name: /Unlock all/ })

    // Nothing locked yet, so the escape hatch stays out of the way.
    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await expect(arrangeMenu).toBeVisible()
    await expect(unlockAll).toBeHidden()
    await workspace.clickCanvas()
    await expect(arrangeMenu).toBeHidden()

    for (const name of ['API', 'Database']) {
      await workspace.clearSelection()
      await workspace.clickNode(name)
      await workspace.page.getByRole('button', { name: 'Lock position', exact: true }).click()
    }

    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await expect(arrangeMenu).toBeVisible()
    await expect(unlockAll).toBeVisible()
    await unlockAll.click()

    expect((await canvasPosition(workspace, 'api'))?.locked).toBe(false)
    expect((await canvasPosition(workspace, 'db'))?.locked).toBe(false)
    await expect(workspace.page.locator('.c4-node-lock')).toHaveCount(0)
  })
})
