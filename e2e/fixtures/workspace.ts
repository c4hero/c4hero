import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ workspace: WorkspaceHelper }>({
  workspace: async ({ page }, runWorkspace) => {
    const helper = new WorkspaceHelper(page)
    await runWorkspace(helper)
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
   * Connect two nodes by dragging from the source node's center handle to the
   * target node center. This is more stable than aiming for a specific hidden
   * target handle after the layout changes from an earlier connection.
   */
  async connectNodes(sourceName: string, targetName: string) {
    const sourceNode = await this.getNodeByName(sourceName)
    const targetNode = await this.getNodeByName(targetName)

    await sourceNode.hover()

    const sourceHandle = sourceNode.locator('[data-handleid$="-b-source"]').first()
    await sourceHandle.waitFor({ state: 'attached' })

    const handleBox = await sourceHandle.boundingBox()
    const targetBox = await targetNode.boundingBox()

    if (!handleBox || !targetBox) throw new Error('Could not get bounding boxes for connect drag')

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    const endX = targetBox.x + targetBox.width / 2
    const endY = targetBox.y + targetBox.height / 2

    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    const steps = 15
    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(
        startX + ((endX - startX) * i) / steps,
        startY + ((endY - startY) * i) / steps,
      )
    }
    await this.page.mouse.up()
    await this.page.waitForTimeout(400)
  }
}
