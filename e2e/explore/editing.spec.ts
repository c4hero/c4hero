import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

const dsl = `workspace "Editing" {
 model {
  a = softwareSystem "Alpha" {
   api = container "API" { component "Handler" }
  }
  b = softwareSystem "Beta"
  c = softwareSystem "Gamma"
 }
 views { systemLandscape "landscape" { include * } }
}`

test.beforeEach(async ({ page, workspace }) => {
  await workspace.parseAndLoad(dsl)
  await page.evaluate(async () => {
    const path = '/src/store/settings.ts'
    const { useSettingsStore } = await import(/* @vite-ignore */ path)
    useSettingsStore.getState().update({ snapToGrid: false })
  })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
})

test('dragging a root edits the shared view coordinates and undo restores them', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="b"]')
  const before = (await node.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 35, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  const moved = (await node.boundingBox())!
  // Native dragging starts after its activation threshold, not at pointer-down.
  expect(moved.x - before.x).toBeGreaterThan(40)
  expect(moved.x - before.x).toBeLessThanOrEqual(61)
  const position = await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.views.systemLandscapeViews[0].elements.find(e => e.id === 'b'))
  expect(position?.x).toBeDefined()
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  expect((await node.boundingBox())!.x).toBeCloseTo(moved.x, 1)
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().undo())
  await expect.poll(async () => (await node.boundingBox())!.x).toBeCloseTo(before.x, 0)
})

test('shared add tools and undo keep Zoom enabled', async ({ page }) => {
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  await page.getByRole('button', { name: 'Container', exact: true }).click()
  const count = () => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.softwareSystems.find(s => s.id === 'a')!.containers.length)
  await expect.poll(count).toBe(2)
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().undo())
  await expect.poll(count).toBe(1)
  await expect(page.locator('[data-semantic-zoom="true"]')).toBeVisible()
})

test('root layout locks apply to both behaviors', async ({ page }) => {
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().setElementsLocked('landscape', ['b'], true))
  await expect(page.locator('.react-flow__node[data-id="b"]')).not.toHaveClass(/draggable/)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="b"]')).not.toHaveClass(/draggable/)
})

test('nested positions persist in the sidecar, stay within their parent and undo', async ({ page }) => {
  const moved = await page.locator('[data-semantic-zoom="true"]').evaluate(el => {
    const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
    const before = { ...camera.layoutState.byId.get('api')! }
    camera.moveNodes([{ id: 'api', x: before.x + 10000, y: before.y + 10000 }])
    const after = camera.layoutState.byId.get('api')!, parent = after.parent!
    return { inside: after.x + after.width <= parent.x + parent.width && after.y + after.height <= parent.y + parent.height }
  })
  expect(moved.inside).toBe(true)
  const saved = () => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.views.systemLandscapeViews[0].exploreLayout?.elements?.api)
  await expect.poll(saved).toBeTruthy()
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().undo())
  await expect.poll(saved).toBeUndefined()
})

test('multi-select aligns, groups and respects the shared layout lock', async ({ page }) => {
  await page.getByRole('button', { name: 'Multi-select (tap multiple nodes)' }).click()
  await page.locator('.react-flow__node[data-id="b"]').click()
  await page.locator('.react-flow__node[data-id="c"]').click()
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
  await page.getByTitle('Align elements', { exact: true }).click()
  await page.getByRole('button', { name: 'Align top', exact: true }).click()
  const b = page.locator('.react-flow__node[data-id="b"]'), c = page.locator('.react-flow__node[data-id="c"]')
  await expect.poll(async () => Math.abs((await b.boundingBox())!.y - (await c.boundingBox())!.y)).toBeLessThan(1)
  await page.keyboard.press('Shift+G')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.groups.length)).toBe(1)
  await page.getByRole('button', { name: 'Auto-arrange', exact: true }).click()
  await page.getByRole('button', { name: 'Lock view layout', exact: true }).click()
  await expect(b).not.toHaveClass(/draggable/)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect(b).not.toHaveClass(/draggable/)
})

test('native connection handles create a relationship and keyboard undo removes it', async ({ page }) => {
  const from = page.locator('.react-flow__node[data-id="b"] [data-handleid="right-b-source"]')
  const to = page.locator('.react-flow__node[data-id="c"] [data-handleid="left-b-target"]')
  await page.locator('.react-flow__node[data-id="b"]').hover()
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
  const relationships = () => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships)
  await expect.poll(async () => (await relationships()).some(r => r.sourceId === 'b' && r.destinationId === 'c')).toBe(true)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await relationships()).length).toBe(0)
})

test('minimap settings and native SVG and PNG exports work with Zoom enabled', async ({ page }) => {
  const svg = await page.evaluate(async () => {
    const path = '/src/lib/exportUtils.ts'
    const { exportCanvasAsSVG } = await import(/* @vite-ignore */ path)
    const doc = new DOMParser().parseFromString(exportCanvasAsSVG('current'), 'image/svg+xml')
    return { errors: doc.querySelectorAll('parsererror').length, text: doc.documentElement.textContent }
  })
  expect(svg.errors).toBe(0)
  expect(svg.text).toContain('Beta')
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click()
  await page.getByRole('radio', { name: 'Always', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.react-flow__minimap')).toBeVisible()
  await page.getByRole('button', { name: /Export/ }).first().click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export workspace' }).getByRole('button', { name: 'Current', exact: true }).first().click()
  expect((await download).suggestedFilename()).toMatch(/\.png$/)
})
