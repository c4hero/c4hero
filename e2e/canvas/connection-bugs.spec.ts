/**
 * Diagnostic tests for two reported connection bugs:
 * Bug 1: Arrow direction reversed (drag A→B shows B→A in model + inspector)
 * Bug 2: Phantom connections accumulate on delete+re-add cycles
 */
import { test, expect } from '../fixtures/workspace'
import type { Page } from '@playwright/test'

type Workspace = Record<string, unknown>

async function getWorkspace(page: Page): Promise<Workspace | null> {
  return page.evaluate(() => (window as Record<string, unknown>).__testGetWorkspace?.() as Workspace | null)
}

async function getRelationships(page: Page) {
  const ws = await getWorkspace(page)
  if (!ws) return []
  const model = ws.model as Record<string, unknown>
  return (model.relationships as Array<{ id: string; sourceId: string; destinationId: string }>) ?? []
}

async function getViewRelationships(page: Page) {
  const ws = await getWorkspace(page)
  if (!ws) return []
  const views = ws.views as Record<string, unknown>
  const systemViews = (views.systemLandscapeViews as Array<Record<string, unknown>>) ?? []
  const allViews = [
    ...systemViews,
    ...((views.systemContextViews as Array<Record<string, unknown>>) ?? []),
    ...((views.containerViews as Array<Record<string, unknown>>) ?? []),
    ...((views.componentViews as Array<Record<string, unknown>>) ?? []),
    ...((views.dynamicViews as Array<Record<string, unknown>>) ?? []),
    ...((views.deploymentViews as Array<Record<string, unknown>>) ?? []),
  ]
  const rels: Array<{ id: string }> = []
  for (const v of allViews) {
    const vRels = (v.relationships as Array<{ id: string }>) ?? []
    rels.push(...vRels)
  }
  return rels
}

/**
 * Delete the currently-selected relationship via keyboard.
 * addRelationship auto-selects the new relationship, so we don't need to click the edge.
 */
async function deleteSelectedRelationship(page: Page) {
  await page.keyboard.press('Delete')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
}

test.describe('Connection Bug Diagnostics', () => {
  // ─── Bug 1: Arrow direction ───────────────────────────────────────────────

  test('Bug 1: drag from first node to second node produces sourceId=first, destinationId=second', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    // Get node element IDs before connecting (read from React Flow DOM data)
    const nodeIds = await workspace.page.evaluate(() => {
      const nodes = document.querySelectorAll('.react-flow__node')
      return Array.from(nodes).map(n => n.getAttribute('data-id'))
    })
    expect(nodeIds.length).toBe(2)
    const firstNodeId = nodeIds[0]
    const secondNodeId = nodeIds[1]

    // Connect first → second
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    const rels = await getRelationships(workspace.page)
    expect(rels.length).toBe(1)

    const rel = rels[0]

    // The relationship sourceId should be the node we dragged FROM (New System / first)
    // The relationship destinationId should be the node we dragged TO (New System 2 / second)
    expect(rel.sourceId).toBe(firstNodeId)
    expect(rel.destinationId).toBe(secondNodeId)
  })

  test('Bug 1: inspector shows source → destination matching drag direction', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    // Connect New System → New System 2
    // addRelationship auto-selects the new relationship and opens the inspector
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(400)

    // Inspector should show "New System → New System 2" (not reversed)
    // Wait for the floating inspector container rather than the generic panel class,
    // which is shared by other overlays and can race under slower CI runs.
    const panel = workspace.page.getByLabel('Element properties')
    await expect(panel).toHaveCSS('pointer-events', 'auto')
    await expect(panel).toContainText('New System')
    await expect(panel).toContainText('New System 2')
    const panelText = await panel.textContent()

    const srcIndex = panelText?.indexOf('New System') ?? -1
    const dstIndex = panelText?.indexOf('New System 2') ?? -1

    expect(srcIndex).toBeGreaterThanOrEqual(0)
    expect(dstIndex).toBeGreaterThanOrEqual(0)

    // Source (New System) should come before destination (New System 2) in the displayed text
    // If reversed, "New System 2" would appear before "New System"
    expect(srcIndex).toBeLessThan(dstIndex)
  })

  // ─── Bug 2: Phantom connection accumulation ───────────────────────────────

  test('Bug 2: model relationship count after delete+readd should be 1', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    // Cycle 1: add → delete → add
    // addRelationship auto-selects the new relationship
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    let rels = await getRelationships(workspace.page)
    expect(rels.length).toBe(1)

    // Delete the selected relationship
    await deleteSelectedRelationship(workspace.page)

    rels = await getRelationships(workspace.page)
    expect(rels.length).toBe(0)

    // Re-add
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    rels = await getRelationships(workspace.page)
    expect(rels.length).toBe(1)  // Bug 2: user reports seeing 2 here
  })

  test('Bug 2: view relationship count matches model after delete+readd', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    // Delete the auto-selected relationship
    await deleteSelectedRelationship(workspace.page)

    // Re-add
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    const modelRels = await getRelationships(workspace.page)
    const viewRels = await getViewRelationships(workspace.page)
    const edgeCount = await workspace.getEdgeCount()


    expect(modelRels.length).toBe(1)
    expect(viewRels.length).toBe(1)
    expect(edgeCount).toBe(1)
  })

  test('Bug 2: REPRO — click edge + Backspace + reconnect produces exactly 1 connection', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    // Connect and wait — connection auto-selects the relationship
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    let rels = await getRelationships(workspace.page)
    expect(rels.length).toBe(1)

    // Click the edge to mark it as "selected" in React Flow's internal state
    // (needed for React Flow's built-in Backspace delete to fire)
    // Use page.mouse.click at the edge's computed center — works around viewport issues
    await workspace.page.evaluate(() => {
      const edge = document.querySelector('.react-flow__edge-interaction') as SVGPathElement | null
      if (!edge) return
      const bbox = edge.getBoundingClientRect()
      const cx = bbox.left + bbox.width / 2
      const cy = bbox.top + bbox.height / 2
      // Dispatch pointer and click events the way React Flow expects
      const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }
      edge.dispatchEvent(new MouseEvent('pointerdown', opts))
      edge.dispatchEvent(new MouseEvent('mousedown', opts))
      edge.dispatchEvent(new MouseEvent('pointerup', opts))
      edge.dispatchEvent(new MouseEvent('mouseup', opts))
      edge.dispatchEvent(new MouseEvent('click', opts))
    })
    await workspace.page.waitForTimeout(300)

    // Press Backspace — React Flow's deleteKeyCode='Backspace' deletes the edge
    // from local state. Any confirmation dialog gets an Enter to confirm.
    await workspace.page.keyboard.press('Backspace')
    await workspace.page.waitForTimeout(300)
    await workspace.page.keyboard.press('Enter')
    await workspace.page.waitForTimeout(400)

    rels = await getRelationships(workspace.page)
    const edgeCount = await workspace.getEdgeCount()

    // Both the model AND the visible edges should be 0
    expect(rels.length).toBe(0)
    expect(edgeCount).toBe(0)

    // Reconnect
    await workspace.connectNodes('New System', 'New System 2')
    await workspace.page.waitForTimeout(300)

    rels = await getRelationships(workspace.page)
    const finalEdgeCount = await workspace.getEdgeCount()

    expect(rels.length).toBe(1)
    expect(finalEdgeCount).toBe(1)
  })

  test('Bug 2: three delete+readd cycles — always exactly 1 connection', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    await workspace.fitView()

    for (let cycle = 1; cycle <= 3; cycle++) {
      await workspace.fitView()
      await expect(workspace.getVisibleNodeByName('New System')).toBeVisible()
      await expect(workspace.getVisibleNodeByName('New System 2')).toBeVisible()

      // connectNodes auto-selects the new relationship
      await workspace.connectNodes('New System', 'New System 2')
      await workspace.page.waitForTimeout(300)

      const afterAdd = await workspace.getEdgeCount()
      expect(afterAdd).toBe(1)

      // Delete the selected relationship
      await deleteSelectedRelationship(workspace.page)

      const afterDelete = await workspace.getEdgeCount()
      expect(afterDelete).toBe(0)
    }
  })
})
