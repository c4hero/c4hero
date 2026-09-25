import { test, expect } from '../fixtures/workspace'
import type { ExploreController } from '../../src/lib/explore/controller'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { Page } from '@playwright/test'

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
async function position(page: Page, id: string, side: 'center' | 'right' = 'center') {
  return page.getByTestId('explore-canvas').evaluate((el, { id, side }) => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const n = engine.state.layout.byId.get(id)!
    return engine.flowToScreenPosition({ x: n.x + n.width * (side === 'right' ? 1 : .5), y: n.y + n.height / 2 })
  }, { id, side })
}
async function select(page: Page, id: string, shift = false) {
  const p = await position(page, id)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(p.x, p.y)
  if (shift) await page.keyboard.up('Shift')
}
async function enterExplore(page: Page) {
  await page.getByRole('button', { name: 'Switch view' }).click()
  await page.getByRole('button', { name: 'Explore workspace' }).click()
}

test.beforeEach(async ({ page, workspace }) => {
  await workspace.parseAndLoad(dsl)
  await enterExplore(page)
  await expect(page.getByTestId('explore-canvas')).toHaveAttribute('data-camera', /zoom/)
})

test('shared add tools create within the selected system and undo without leaving Explore', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  await select(page, 'a')
  await page.getByRole('button', { name: 'Add element', exact: true }).click()
  await page.getByRole('button', { name: 'Container', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.softwareSystems.find(s => s.id === 'a')!.containers.length)).toBe(2)
  await page.getByTestId('explore-canvas').focus(); await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.softwareSystems.find(s => s.id === 'a')!.containers.length)).toBe(1)
  await expect(page.getByTestId('explore-canvas')).toBeVisible()
})

test('dragging persists Explore geometry, undo restores it, and Diagram coordinates stay intact', async ({ page }) => {
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.views))
  const p = await position(page, 'b')
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 55, p.y + 35, { steps: 5 }); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.exploreLayout?.elements?.b)).toBe(true)
  const moved = await position(page, 'b'); expect(moved.x).toBeCloseTo(p.x + 55, 0)
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.views))).toBe(before)
  await page.getByTestId('explore-canvas').focus(); await page.keyboard.press('Control+z')
  expect((await position(page, 'b')).x).toBeCloseTo(p.x, 0)
})

test('multi-select aligns and locks nodes, groups them, and respects layout lock', async ({ page }) => {
  await page.getByRole('button', { name: 'Multi-select (tap multiple nodes)' }).click()
  await select(page, 'b'); await select(page, 'c', true)
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
  await page.getByTitle('Align elements', { exact: true }).click()
  await page.getByRole('button', { name: 'Align top', exact: true }).click()
  expect((await position(page, 'b')).y).toBeCloseTo((await position(page, 'c')).y, 0)
  await page.getByTestId('explore-canvas').focus(); await page.keyboard.press('Shift+G')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.groups.length)).toBe(1)
  await page.getByRole('button', { name: 'Auto-arrange', exact: true }).click()
  await page.getByRole('button', { name: 'Lock view layout', exact: true }).click()
  await page.getByRole('button', { name: 'Auto-arrange (view layout locked)' }).click()
  await page.getByRole('button', { name: 'Multi-select: ON (tap to turn off)' }).click()
  const p = await position(page, 'b')
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, p.y + 20, { steps: 5 }); await page.mouse.up()
  expect((await position(page, 'b')).x).toBeCloseTo(p.x, 0)
})

test('connection handle drag adds a real relationship and undo removes it', async ({ page }) => {
  await select(page, 'b')
  const from = await position(page, 'b', 'right'), to = await position(page, 'c')
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships.some(r => r.sourceId === 'b' && r.destinationId === 'c'))).toBe(true)
  await page.getByTestId('explore-canvas').focus(); await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships.length)).toBe(0)
})

test('settings enables the minimap and image exports capture Explore', async ({ page }) => {
  const svg = await page.getByTestId('explore-canvas').evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const markup = engine.exportSVG('current')
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
    return { errors: doc.querySelectorAll('parsererror').length, text: doc.documentElement.textContent, images: doc.querySelectorAll('image').length, shapes: doc.querySelectorAll('rect').length }
  })
  expect(svg.errors).toBe(0); expect(svg.text).toContain('Beta'); expect(svg.images).toBe(0); expect(svg.shapes).toBeGreaterThan(2)
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click()
  await page.getByRole('radio', { name: 'Always', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByLabel('Architecture minimap', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Export/ }).first().click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export workspace' }).getByRole('button', { name: 'Current', exact: true }).first().click()
  expect((await download).suggestedFilename()).toMatch(/\.png$/)
})
