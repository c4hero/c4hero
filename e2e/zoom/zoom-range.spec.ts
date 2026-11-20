import { test, expect } from '../fixtures/workspace'
import type { Page } from '@playwright/test'
import type { WorkspaceState } from '../../src/store/workspace-types'

const zoom = (page: Page) => page.locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)
const wheel = async (page: Page, deltaY: number, times: number) => {
  for (let i = 0; i < times; i++) { await page.mouse.wheel(0, deltaY); await page.waitForTimeout(120) }
}
const toggleZoom = (page: Page) => page.getByRole('button', { name: 'Zoom', exact: true }).click()

test('the ordinary canvas keeps its zoom limits and only Zoom goes deeper', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.waitForTimeout(500)
  const parent = page.locator('.react-flow__node[data-id="internetBanking"]')
  await parent.hover()
  await wheel(page, -1200, 4)
  await expect.poll(() => zoom(page)).toBeCloseTo(2, 3)
  await wheel(page, 1200, 8)
  await expect.poll(() => zoom(page)).toBeCloseTo(0.1, 3)

  await page.keyboard.press('0')
  await page.waitForTimeout(700)
  await toggleZoom(page)
  await parent.hover()
  await wheel(page, -120, 10)
  await expect.poll(() => zoom(page)).toBeGreaterThan(4)

  // Leaving Zoom while deep keeps the camera where it is, but goes no deeper.
  await page.waitForTimeout(600)
  const deep = await zoom(page)
  await toggleZoom(page)
  await page.waitForTimeout(300)
  expect(await zoom(page)).toBeCloseTo(deep, 1)
  await page.mouse.move(700, 450)
  await wheel(page, -600, 3)
  expect(await zoom(page)).toBeCloseTo(deep, 1)
})

test('a close-up saved inside Zoom is not restored into the ordinary canvas', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.waitForTimeout(500)
  const fitted = await zoom(page)
  await toggleZoom(page)
  await page.locator('.react-flow__node[data-id="internetBanking"]').hover()
  await wheel(page, -120, 10)
  await expect.poll(() => zoom(page)).toBeGreaterThan(4)
  await page.waitForTimeout(600)
  await toggleZoom(page)
  expect(await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().rendererMode)).toBe('diagram')

  const views = await workspace.getViews()
  await workspace.setView(views.find(v => v.type === 'container')!.key)
  await workspace.setView(views[0].key)
  // Back on the landscape with Zoom off: fitted again, not left 6x into a card.
  await expect.poll(() => zoom(page)).toBeCloseTo(fitted, 1)
  await expect(page.locator('.react-flow__node[data-id="internetBanking"]')).toBeInViewport()
})
