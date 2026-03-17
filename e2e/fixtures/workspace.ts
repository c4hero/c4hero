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
    await this.page.getByText('Explore sample').click()
    // Wait for canvas to be ready
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async loadBlank() {
    await this.goto()
    await this.page.getByText('Blank workspace').click()
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async getNodeByName(name: string) {
    return this.page.locator('.react-flow__node').filter({ hasText: name })
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

  /** Open search dialog */
  async openSearch() {
    await this.page.keyboard.press('Control+k')
    await expect(this.page.getByPlaceholder('Search elements, views...')).toBeVisible()
  }
}
