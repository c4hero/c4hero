import { test as base, expect, type Page, type Locator } from '@playwright/test'

export const test = base.extend<{ workspace: WorkspaceHelper }>({
  workspace: async ({ page }, runWorkspace) => {
    const helper = new WorkspaceHelper(page)
    await runWorkspace(helper)
  },
})

export { expect }

type WorkspaceSnapshot = {
  name?: string
  scope?: string
  model: {
    people: Array<{ id: string; name: string; type: string; tags: string[]; description?: string; owner?: string; url?: string; location?: string }>
    softwareSystems: Array<{
      id: string
      name: string
      type: string
      tags: string[]
      description?: string
      owner?: string
      url?: string
      location?: string
      containers: Array<{
        id: string
        name: string
        type: string
        tags: string[]
        technology?: string
        description?: string
        owner?: string
        url?: string
        components: Array<{
          id: string
          name: string
          type: string
          tags: string[]
          technology?: string
          description?: string
          owner?: string
          url?: string
        }>
      }>
    }>
    relationships: Array<{
      id: string
      sourceId: string
      destinationId: string
      description?: string
      technology?: string
      tags: string[]
      interactionStyle?: string
      lineStyle?: string
      url?: string
    }>
    groups: Array<{ id: string; name: string; elementIds: string[] }>
  }
  views: {
    systemLandscapeViews: Array<{ key: string; title?: string; type: string; elements: Array<{ id: string }>; relationships: Array<{ id: string }>; autoLayout?: { direction?: string } }>
    systemContextViews: Array<{ key: string; title?: string; type: string; elements: Array<{ id: string }>; relationships: Array<{ id: string }>; autoLayout?: { direction?: string } }>
    containerViews: Array<{ key: string; title?: string; type: string; elements: Array<{ id: string }>; relationships: Array<{ id: string }>; autoLayout?: { direction?: string } }>
    componentViews: Array<{ key: string; title?: string; type: string; elements: Array<{ id: string }>; relationships: Array<{ id: string }>; autoLayout?: { direction?: string } }>
  }
}

type ViewSummary = { key: string; type: string; title: string }

export class WorkspaceHelper {
  constructor(public page: Page) {}

  async goto() {
    await this.page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  async loadSample() {
    await this.goto()
    await this.page.evaluate(() => (window as Record<string, unknown>).__testLoadSample?.())
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async loadBlank() {
    await this.goto()
    await this.page.evaluate(() => (window as Record<string, unknown>).__testLoadBlank?.())
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async loadTemplate(name: 'bigBank' | 'microservices' | 'monolith' | 'eventDriven' | 'blank') {
    await this.goto()
    await this.page.evaluate((templateName) => (window as Record<string, unknown>).__testLoadTemplate?.(templateName), name)
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async parseAndLoad(dsl: string) {
    await this.goto()
    await this.page.evaluate((input) => (window as Record<string, unknown>).__testParseAndLoad?.(input), dsl)
    await this.page.waitForURL(/\/collection\//, { timeout: 5000 })
    await this.page.locator('.react-flow').waitFor({ state: 'visible' })
  }

  async getWorkspace() {
    return this.page.evaluate(() => (window as Record<string, unknown>).__testGetWorkspace?.() as WorkspaceSnapshot | null)
  }

  async getViews() {
    return this.page.evaluate(() => ((window as Record<string, unknown>).__testListViews?.() as ViewSummary[] | undefined) ?? [])
  }

  async setView(key: string) {
    await this.page.evaluate((viewKey) => (window as Record<string, unknown>).__testSetView?.(viewKey), key)
    await this.page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0)
    await this.page.locator('.react-flow__viewport').evaluate((el) =>
      new Promise<void>((resolve) => {
        let stableFrames = 0
        let last = el.getAttribute('transform') ?? ''
        const check = () => {
          const cur = el.getAttribute('transform') ?? ''
          if (cur === last) {
            stableFrames += 1
            if (stableFrames >= 2) { resolve(); return }
          } else {
            stableFrames = 0
            last = cur
          }
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      }),
    )
    await this.page.waitForTimeout(100)
  }

  async relayout(direction?: 'TB' | 'BT' | 'LR' | 'RL') {
    await this.page.evaluate((dir) => (window as Record<string, unknown>).__testRelayout?.(dir), direction)
    await this.page.waitForTimeout(250)
  }

  async addGroup(name: string, elementIds: string[]) {
    return this.page.evaluate(
      ({ groupName, ids }) => (window as Record<string, unknown>).__testAddGroup?.(groupName, ids) as string | undefined,
      { groupName: name, ids: elementIds },
    )
  }

  async deleteElements(elementIds: string[]) {
    await this.page.evaluate(
      (ids) => (window as Record<string, unknown>).__testDeleteElements?.(ids),
      elementIds,
    )
    await this.page.waitForTimeout(250)
  }

  async getNodeByName(name: string) {
    return this.page.locator('.react-flow__node').filter({
      has: this.page.getByText(name, { exact: true }),
    })
  }

  getVisibleNodeByName(name: string): Locator {
    return this.page.locator('.react-flow__node').filter({
      has: this.page.getByText(name, { exact: true }),
    }).first()
  }

  async getNodeCount() {
    return this.page.locator('.react-flow__node').count()
  }

  async getEdgeCount() {
    return this.page.locator('.react-flow__edge').count()
  }

  async clickNode(name: string) {
    await this.getVisibleNodeByName(name).click()
  }

  async doubleClickNode(name: string) {
    await this.getVisibleNodeByName(name).dblclick()
  }

  async rightClickNode(name: string) {
    await this.getVisibleNodeByName(name).click({ button: 'right' })
  }

  async clickCanvas(position = { x: 100, y: 100 }) {
    await this.page.locator('.react-flow__pane').click({ position })
  }

  async dragNodeBy(name: string, delta: { x: number; y: number }) {
    const node = this.getVisibleNodeByName(name)
    const box = await node.boundingBox()
    if (!box) throw new Error(`Could not get bounding box for node ${name}`)

    const startX = box.x + box.width / 2
    const startY = box.y + Math.min(box.height / 2, 28)

    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    await this.page.mouse.move(startX + delta.x, startY + delta.y, { steps: 12 })
    await this.page.mouse.up()
  }

  async getCanvasNodeBoxById(id: string) {
    return this.page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
  }

  async clearSelection() {
    await this.clickCanvas({ x: 20, y: 20 })
  }

  async expectInspectorFor(name: string) {
    await expect(this.page.locator('[aria-label="Element properties"]')).toContainText(name)
  }

  async fitView() {
    await this.page.getByRole('button', { name: 'Zoom to fit' }).click()
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

  async openSearch() {
    await this.page.keyboard.press('Control+f')
    await expect(this.page.getByPlaceholder('Search elements, views, technology...')).toBeVisible()
  }

  async openCommandPalette() {
    await this.page.keyboard.press('Control+k')
    await expect(this.page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  }

  async runCommand(query: string, exactLabel?: string) {
    await this.openCommandPalette()
    const input = this.page.getByLabel('Search commands')
    await input.fill(query)
    const target = exactLabel
      ? this.page.getByRole('button', { name: new RegExp(exactLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      : this.page.locator('[role="dialog"][aria-label="Command palette"] button').filter({ hasText: query }).first()
    await target.click()
  }

  async openAddElementPanel() {
    await this.page.getByRole('button', { name: 'Add element' }).click()
    await expect(this.page.getByText('Create new')).toBeVisible()
  }

  async addElementFromPanel(label: string) {
    await this.openAddElementPanel()
    await this.page.getByRole('button', { name: label, exact: true }).click()
  }

  async openViewSwitcher() {
    const closeButton = this.page.getByLabel('Close view switcher')
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true })
      await expect(closeButton).not.toBeVisible()
    }

    await this.page.getByRole('button', { name: 'Switch view' }).click()
    await expect(closeButton).toBeVisible()
  }

  async createView(typeLabel: string, title: string, scopeName?: string) {
    await this.runCommand('new view', 'New View')
    await expect(this.page.getByRole('dialog', { name: 'Create View' })).toBeVisible()
    await this.page.locator('#cv-type').selectOption({ label: typeLabel })
    if (scopeName) {
      await this.page.locator('#cv-scope').selectOption({ label: scopeName })
    }
    await this.page.locator('#cv-title').fill(title)
    await this.page.getByRole('button', { name: 'Create View' }).click()
    await expect(this.page.getByRole('dialog', { name: 'Create View' })).not.toBeVisible()
  }

  async fillEditableField(label: string, value: string) {
    const root = this.page.getByLabel(label, { exact: true }).first()
    const tagName = await root.evaluate((el) => el.tagName.toLowerCase())
    const field = tagName === 'input' || tagName === 'textarea' || tagName === 'select'
      ? root
      : root.locator('input, textarea, select').first()
    await field.click()
    await field.fill(value)
    await field.press('Tab')
  }

  async selectStatus(value: string) {
    await this.page.getByTestId('element-status').selectOption(value)
  }

  async toggleInspectorTab(name: 'Properties' | 'Relations' | 'Tags') {
    await this.page.getByRole('tab', { name }).click()
  }

  async addTag(tag: string) {
    await this.toggleInspectorTab('Tags')
    await this.page.getByPlaceholder('Add tag...').fill(tag)
    await this.page.keyboard.press('Enter')
  }

  async connectNodes(sourceName: string, targetName: string) {
    const sourceNode = this.getVisibleNodeByName(sourceName)
    const targetNode = this.getVisibleNodeByName(targetName)

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

  async selectNewestRelationship() {
    await expect(this.page.locator('.react-flow__edge').last()).toBeVisible()
    const path = this.page.locator('.react-flow__edge-interaction').last()
    const box = await path.boundingBox()
    if (!box) throw new Error('Could not find edge interaction path')
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  async getElementByName(name: string) {
    const ws = await this.getWorkspace()
    if (!ws) return undefined

    const people = ws.model.people.find((person) => person.name === name)
    if (people) return people

    for (const system of ws.model.softwareSystems) {
      if (system.name === name) return system
      const container = system.containers.find((item) => item.name === name)
      if (container) return container
      for (const item of system.containers) {
        const component = item.components.find((child) => child.name === name)
        if (component) return component
      }
    }

    return undefined
  }

  async getRelationshipByDescription(description: string) {
    const ws = await this.getWorkspace()
    return ws?.model.relationships.find((relationship) => relationship.description === description)
  }

  async getViewByTitle(title: string) {
    const views = await this.getViews()
    return views.find((view) => view.title === title)
  }

  async getGroupByName(name: string) {
    const ws = await this.getWorkspace()
    return ws?.model.groups.find((group) => group.name === name)
  }
}
