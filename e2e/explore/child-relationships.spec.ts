import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

for (const parent of ['internetBanking', 'apiApp']) {
  test(`child relationships and labels are above the expanded ${parent} card`, async ({ page, workspace }, testInfo) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    const host = page.locator('[data-semantic-zoom="true"]')
    await host.evaluate((el, id) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus(id), parent)
    await page.waitForTimeout(500)
    const result = await host.evaluate((el, id) => {
      const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
      const ids = new Set(camera.layoutState.nodes.filter(n => n.parent?.id === id).map(n => n.id))
      const relationships = (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships
      const errors: string[] = []
      let paths = 0, labels = 0
      for (const group of document.querySelectorAll<SVGGElement>('.react-flow__edge')) {
        const relationship = relationships.find(r => r.id === group.getAttribute('data-id'))
        const from = relationship?.sourceId, to = relationship?.destinationId
        if (!from || !to || !ids.has(from) || !ids.has(to)) continue
        const path = group.querySelector<SVGPathElement>('.react-flow__edge-path')!
        const point = path.getPointAtLength(path.getTotalLength() * .3)
        const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!)
        if (screen.x < 0 || screen.y < 0 || screen.x >= innerWidth || screen.y >= innerHeight) continue
        paths++
        const stack = document.elementsFromPoint(screen.x, screen.y)
        const edgeIndex = stack.findIndex(el => el.closest('.react-flow__edge') === group)
        const parentIndex = stack.findIndex(el => el.closest('.react-flow__node')?.getAttribute('data-id') === id)
        if (edgeIndex < 0 || (parentIndex >= 0 && edgeIndex > parentIndex)) errors.push(`edge behind parent: ${path.id}`)
        const label = document.querySelector<HTMLElement>(`[data-relationship-label="${path.id}"]`)
        if (!label) continue
        const bounds = label.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
        labels++
        const labelStack = document.elementsFromPoint(x, y)
        const labelIndex = labelStack.findIndex(el => label.contains(el))
        const labelParentIndex = labelStack.findIndex(el => el.closest('.react-flow__node')?.getAttribute('data-id') === id)
        if (labelIndex < 0 || (labelParentIndex >= 0 && labelIndex > labelParentIndex)) errors.push(`label behind parent: ${path.id}`)
      }
      return { errors, paths, labels }
    }, parent)
    await page.screenshot({ path: testInfo.outputPath(`${parent}-relationships.png`) })
    expect(result.paths).toBeGreaterThan(0)
    expect(result.labels).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
  })
}
