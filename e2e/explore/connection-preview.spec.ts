import { test, expect } from '../fixtures/workspace'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'
import type { WorkspaceState } from '../../src/store/workspace-types'

for (const [parent, from, to] of [
  ['normal', 'atm', 'email'],
  ['internetBanking', 'webApp', 'mobileApp'],
  ['apiApp', 'accountsSummary', 'resetPassController'],
]) {
  test(`live connection preview anchors inside ${parent} before release`, async ({ page, workspace }) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    if (parent !== 'normal') {
      await page.getByRole('button', { name: 'Zoom', exact: true }).click()
      await page.locator('[data-semantic-zoom="true"]').evaluate((el, id) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus(id), parent)
    }
    await page.waitForTimeout(400)
    const source = page.locator(`.react-flow__node[data-id="${from}"] [data-handleid="bottom-b-source"]`)
    const target = page.locator(`.react-flow__node[data-id="${to}"] [data-handleid="top-b-target"]`)
    const a = (await source.boundingBox())!, b = (await target.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    const path = page.locator('.react-flow__connection-path')
    const end = () => path.evaluate(p => {
      const path = p as SVGPathElement, matrix = path.getScreenCTM()!
      const from = path.getPointAtLength(0), to = path.getPointAtLength(path.getTotalLength())
      const start = new DOMPoint(from.x, from.y).matrixTransform(matrix), finish = new DOMPoint(to.x, to.y).matrixTransform(matrix)
      return { x: finish.x, y: finish.y, fromX: start.x, fromY: start.y }
    })
    // With no target the preview follows the cursor, without a scale correction.
    await page.mouse.move(100, 650, { steps: 5 })
    await expect(path).toBeVisible()
    await expect.poll(async () => {
      const p = await end()
      return Math.hypot(p.x - 100, p.y - 650)
    }).toBeLessThan(1)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
    await expect(page.locator('.react-flow__connection')).toHaveClass(/(?:^|\s)valid(?:$|\s)/)
    expect(await path.getAttribute('data-target-node')).toBe(to)
    await expect.poll(async () => {
      const p = await end()
      return Math.max(Math.hypot(p.x - b.x - b.width / 2, p.y - b.y - b.height / 2),
        Math.hypot(p.fromX - a.x - a.width / 2, p.fromY - a.y - a.height / 2))
    }).toBeLessThan(1)
    // The preview must be painted above the enclosing card.
    expect(await path.evaluate(p => Number(getComputedStyle(p.closest('svg')!).zIndex))).toBeGreaterThan(14)
    await page.mouse.up()
    await expect.poll(() => page.evaluate(([from, to]) => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships.some(r => r.sourceId === from && r.destinationId === to), [from, to])).toBe(true)
  })
}
