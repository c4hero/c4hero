import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test('container relationship gives way to child detail and returns when zooming out', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => {
    const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    s.setActiveView(s.workspace!.views.containerViews[0].key)
  })
  await page.waitForTimeout(500)
  const overview = page.locator('.react-flow__edge-path[id="r16"]')
  const detail = page.locator('.react-flow__edge-path[id="r26"]')
  await expect(overview).toBeVisible()
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('apiApp'))
  await expect(detail).toBeVisible()
  await expect(overview).toHaveCount(0)
  await expect(page.locator('[data-relationship-label="r16"]')).toHaveCount(0)
  await expect(page.locator('[data-relationship-label="r26"]')).toHaveCSS('opacity', '1')
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().clearSelection())
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(.08))
  await expect(overview).toBeVisible()
  await expect(overview).toHaveCSS('opacity', '1')
  await expect(detail).toHaveCount(0)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect(overview).toBeVisible()
})
