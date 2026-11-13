import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

for (const parent of ['internetBanking', 'apiApp']) {
  test(`nested edge endpoints track visible handle centres inside ${parent}`, async ({ page, workspace }) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    const host = page.locator('[data-semantic-zoom="true"]')
    await host.evaluate((el, id) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus(id), parent)
    await page.waitForTimeout(300)
    for (const factor of [1, 1.5, .7]) {
      await host.evaluate((el, factor) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(factor), factor)
      await page.waitForTimeout(200)
      const result = await page.evaluate(() => {
        const relationships = (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships
        const errors: string[] = []
        let checked = 0
        for (const path of document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
          const r = relationships.find(r => r.id === path.id)
          if (!r) continue
          for (const [id, type, distance] of [[r.sourceId, 'source', 0], [r.destinationId, 'target', path.getTotalLength()]] as const) {
            const card = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"] .c4-node`)
            if (!card || getComputedStyle(card).transform === 'none') continue
            const point = path.getPointAtLength(distance)
            const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!)
            const handles = [...card.querySelectorAll<HTMLElement>(`.react-flow__handle.${type}`)]
            const gap = Math.min(...handles.map(h => {
              const b = h.getBoundingClientRect()
              return Math.hypot(screen.x - b.x - b.width / 2, screen.y - b.y - b.height / 2)
            }))
            checked++
            if (gap > 1) errors.push(`${path.id} ${type}: ${gap.toFixed(2)}px off border`)
          }
        }
        return { checked, errors }
      })
      expect(result.checked).toBeGreaterThan(5)
      expect(result.errors).toEqual([])
    }
  })
}
