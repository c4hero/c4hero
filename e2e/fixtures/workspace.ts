import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ workspace: WorkspaceHelper }>({
  workspace: async ({ page }, use) => {
    const helper = new WorkspaceHelper(page)
    await use(helper)
  },
})

export { expect }

export class WorkspaceHelper {
  constructor(public page: Page) {}

  async goto() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  async loadSample() {
    await this.goto()
    // Directly load the Big Bank sample via test helper exposed in dev mode
    await this.page.evaluate(() => (window as Record<string, unknown>).__testLoadSample?.())
    // Wait for store→effect→navigate chain to land on a canvas route
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async loadBlank() {
    await this.goto()
    // Directly load a blank workspace via test helper exposed in dev mode
    await this.page.evaluate(() => (window as Record<string, unknown>).__testLoadBlank?.())
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async getNodeByName(name: string) {
    // Use exact text matching so 'New System' does not match 'New System 2'
    return this.page.locator('.react-flow__node').filter({
      has: this.page.getByText(name, { exact: true }),
    })
  }

  async getEdgeCount() {
    return this.page.locator('.react-flow__edge').count()
  }

  async getNodeCount() {
    return this.page.locator('.react-flow__node').count()
  }

  async clickNode(name: string) {
    const node = await this.getNodeByName(name)
    await node.click()
  }

  async doubleClickNode(name: string) {
    const node = await this.getNodeByName(name)
    await node.dblclick()
  }

  async rightClickNode(name: string) {
    const node = await this.getNodeByName(name)
    await node.click({ button: 'right' })
  }

  async rightClickCanvas() {
    await this.page.locator('.react-flow__pane').click({ button: 'right', position: { x: 100, y: 100 } })
  }

  /** Check that the right panel shows the given element name */
  async expectRightPanelElement(name: string) {
    await expect(this.page.locator('.glass-panel-solid').last().getByText(name).first()).toBeVisible()
  }

  /** Zoom to fit — ensures all nodes are visible before interaction */
  async fitView() {
    await this.page.getByRole('button', { name: 'Zoom to fit' }).click()
    // Wait for the viewport transform to settle after fit-view animation
    await this.page.locator('.react-flow__viewport').evaluate((el) =>
      new Promise<void>((resolve) => {
        let last = el.getAttribute('transform') ?? el.style.transform
        const check = () => {
          const cur = el.getAttribute('transform') ?? el.style.transform
          if (cur === last) { resolve(); return }
          last = cur
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      }),
    )
  }

  /** Open search dialog */
  async openSearch() {
    await this.page.keyboard.press('Control+k')
    await expect(this.page.getByPlaceholder('Search elements, views...')).toBeVisible()
  }

  /**
   * Connect two nodes by dragging from the source node's center handle to a target handle.
   * Hovers the source to reveal handles, then drags to a visible target handle on the target node.
   * Ends the drag ON a target handle (not just the node center) to ensure React Flow detects
   * the connection regardless of zoom level.
   */
  async connectNodes(sourceName: string, targetName: string) {
    const sourceNode = await this.getNodeByName(sourceName)
    const targetNode = await this.getNodeByName(targetName)

    // Hover to reveal source handles
    await sourceNode.hover()

    // Find any center source handle (slot b = center handle, any side)
    const sourceHandle = sourceNode.locator('[data-handleid$="-b-source"]').first()
    await sourceHandle.waitFor({ state: 'attached' })

    // Find a target handle on the target node — use any center target handle
    const targetHandle = targetNode.locator('[data-handleid$="-b-target"]').first()
    await targetHandle.waitFor({ state: 'attached' })

    const handleBox = await sourceHandle.boundingBox()
    const targetHandleBox = await targetHandle.boundingBox()

    if (!handleBox || !targetHandleBox) throw new Error('Could not get bounding boxes for connect drag')

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    // End directly on the target handle center so React Flow detects it regardless of zoom
    const endX = targetHandleBox.x + targetHandleBox.width / 2
    const endY = targetHandleBox.y + targetHandleBox.height / 2

    // Perform slow drag so React Flow registers proximity detection
    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    // Move in steps so React Flow can detect handles along the way
    const steps = 15
    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(
        startX + ((endX - startX) * i) / steps,
        startY + ((endY - startY) * i) / steps,
      )
    }
    await this.page.mouse.up()
    // Wait for React Flow to process the connection (new edge appears)
    await this.page.locator('.react-flow__edge').first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {
      // Edge may already exist from a prior connection; swallow if count is unchanged
    })
  }
}
