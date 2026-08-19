import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

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

async function autoArrange(workspace: WorkspaceHelper, direction: string) {
  await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
  await workspace.page.getByRole('button', { name: direction }).click()
  // The re-layout bumps layoutVersion and refits the viewport; the store
  // write-back lands before the fit, so a settled viewport means settled
  // positions. Condition-based, unlike a fixed sleep, which can both waste
  // wall time and (on a slow runner) elapse before the relayout finishes.
  await workspace.waitForCanvasSettled()
}

/** A node's own flow-space position, read from the inline transform React
 *  Flow puts directly on `.react-flow__node`. Unlike a DOM bounding box,
 *  this is immune to viewport pan/zoom (applied separately to the ancestor
 *  `.react-flow__viewport`), so it can tell "the node moved" apart from
 *  "the drag attempt fell through to a pane pan instead". */
async function nodeFlowPosition(page: import('@playwright/test').Page, id: string) {
  return page.evaluate((nodeId) => {
    const node = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null
    if (!node) throw new Error(`node not found: ${nodeId}`)
    const transform = getComputedStyle(node).transform
    if (transform === 'none') return { x: 0, y: 0 }
    const matrix = new DOMMatrixReadOnly(transform)
    return { x: matrix.m41, y: matrix.m42 }
  }, id)
}

/** A click point on a group overlay that isn't over one of its member
 *  nodes, so the drag grabs the group instead of a member underneath it. */
async function groupDragPoint(page: import('@playwright/test').Page, groupId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`[data-id="group-${id}"]`) as HTMLElement | null
    if (!node) throw new Error('group node not found')
    const rect = node.getBoundingClientRect()
    const candidates = [
      { x: rect.right - 12, y: rect.bottom - 12 },
      { x: rect.left + 12, y: rect.top + 12 },
      { x: rect.left + rect.width / 2, y: rect.top + 12 },
      { x: rect.right - 12, y: rect.top + rect.height / 2 },
    ]
    for (const point of candidates) {
      const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
      if (target?.closest(`[data-id="group-${id}"]`)) return point
    }
    return candidates[0]
  }, groupId)
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

    // Locking happens on an already-mounted node — the store-sync effect's
    // non-structural branch has to carry the new `draggable: false` over to
    // it, or the DOM node keeps dragging even though the store rejects the
    // write. Check the node's own flow-space transform (not a DOM bounding
    // box, which also shifts if the drag attempt falls through to a pane
    // pan instead of being a no-op) so a regression there can't hide behind
    // a store-only check.
    const flowBefore = await nodeFlowPosition(workspace.page, 'api')
    await workspace.dragNodeBy('API', { x: 150, y: 120 })
    const flowAfter = await nodeFlowPosition(workspace.page, 'api')
    expect(flowAfter.x).toBeCloseTo(flowBefore.x, 0)
    expect(flowAfter.y).toBeCloseTo(flowBefore.y, 0)

    expect(await canvasPosition(workspace, 'api')).toMatchObject({ x: before!.x, y: before!.y })

    // The canvas says so, visibly — and without needing a hover. The bug this
    // guards is structural: the glyph once rendered inside .c4-node-actions,
    // which fades to opacity 0 until the node is hovered — invisible lock
    // state. Assert placement outside that container instead of sampling
    // effective opacity on a timer.
    const glyph = workspace.page.locator('.react-flow__node[data-id="api"] .c4-node-lock')
    await expect(glyph).toBeVisible()
    await expect(workspace.page.locator('.c4-node-actions .c4-node-lock')).toHaveCount(0)

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

  test('dragging a group leaves a locked member behind while the rest follow', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.fitView()

    await workspace.clickNode('API')
    await workspace.page.getByRole('button', { name: 'Lock position', exact: true }).click()

    const groupId = await workspace.page.evaluate(() =>
      (window as unknown as { __testAddGroup?: (n: string, i: string[]) => string })
        .__testAddGroup?.('Backend', ['web', 'api']),
    )
    expect(groupId).toBeTruthy()
    await workspace.page.waitForTimeout(300)

    const apiBefore = await nodeFlowPosition(workspace.page, 'api')
    const webBefore = await nodeFlowPosition(workspace.page, 'web')
    const apiStoreBefore = await canvasPosition(workspace, 'api')

    const dragPoint = await groupDragPoint(workspace.page, groupId as string)
    await workspace.page.mouse.move(dragPoint.x, dragPoint.y)
    await workspace.page.mouse.down()
    await workspace.page.mouse.move(dragPoint.x + 140, dragPoint.y + 110, { steps: 12 })
    await workspace.page.mouse.up()
    await workspace.page.waitForTimeout(300)

    const apiAfter = await nodeFlowPosition(workspace.page, 'api')
    const webAfter = await nodeFlowPosition(workspace.page, 'web')

    // The locked member never moved, on screen or in the store...
    expect(apiAfter.x).toBeCloseTo(apiBefore.x, 0)
    expect(apiAfter.y).toBeCloseTo(apiBefore.y, 0)
    expect(await canvasPosition(workspace, 'api')).toMatchObject({ x: apiStoreBefore!.x, y: apiStoreBefore!.y })

    // ...while its unlocked group-mate followed the drag.
    expect(Math.abs(webAfter.x - webBefore.x)).toBeGreaterThan(50)
  })
})
