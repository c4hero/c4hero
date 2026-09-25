import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

for (const nested of [false, true]) {
  test(`node magnifier opens its view with Zoom enabled (${nested ? 'nested' : 'root'})`, async ({ page, workspace }) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    const host = page.locator('[data-semantic-zoom="true"]')
    const id = nested ? 'apiApp' : 'internetBanking'
    await host.evaluate((el, id) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus(id), id)
    await page.waitForTimeout(400)
    const view = await page.evaluate(nested => {
      const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
      return nested ? s.workspace!.views.componentViews[0].key : s.workspace!.views.containerViews[0].key
    }, nested)
    await page.getByRole('button', { name: `Zoom into ${nested ? 'API Application' : 'Internet Banking System'}`, exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().activeViewKey)).toBe(view)
    await expect(host).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().rendererMode)).toBe('explore')
  })
}
