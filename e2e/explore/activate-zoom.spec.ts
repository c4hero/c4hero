import { test, expect } from '../fixtures/workspace'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`enabling Zoom reveals the current close-up without moving the camera (${reducedMotion})`, async ({ page, workspace }) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion })
    await page.waitForTimeout(500)
    // Zoom the normal renderer before ever enabling semantic detail.
    const parent = page.locator('.react-flow__node[data-id="internetBanking"]')
    await parent.hover()
    // Mobile fit starts much farther out: establish the same physical close-up
    // rather than assuming a fixed wheel delta reaches the reveal threshold.
    for (let i = 0; i < 5 && (await parent.boundingBox())!.width < 600; i++) {
      await page.mouse.wheel(0, -1200)
      await page.waitForTimeout(500)
    }
    expect((await parent.boundingBox())!.width).toBeGreaterThanOrEqual(600)
    const camera = () => page.locator('.react-flow__viewport').evaluate(el => getComputedStyle(el).transform)
    const before = await camera()
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    const host = page.locator('[data-semantic-zoom="true"]')
    await expect.poll(() => host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.reveal.get('internetBanking'))).toBe(1)
    const child = page.locator('.react-flow__node[data-id="apiApp"]')
    await expect(child).toBeVisible()
    await expect(child).toHaveCSS('opacity', '1')
    expect(await camera()).toBe(before)
    await page.waitForTimeout(300)
    const detail = () => host.evaluate(el => {
      const c = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
      return c.layoutState.nodes.filter(n => n.children.length).map(n => [n.id, c.reveal.get(n.id) ?? 0])
    })
    const enabled = await detail()
    // A gesture at the same scale should produce exactly the same settled detail.
    await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(1))
    await expect.poll(detail).toEqual(enabled)
    await page.waitForTimeout(500)
    expect(await detail()).toEqual(enabled)
    expect(await camera()).toBe(before)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await expect(child).toHaveCount(0)
    expect(await camera()).toBe(before)
  })
}
