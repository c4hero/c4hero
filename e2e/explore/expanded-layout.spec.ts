import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test('expanded parents keep their titles and child cards fit at every text detail level', async ({ page, workspace }, testInfo) => {
  await workspace.loadSample()
  await page.evaluate(() => {
    const state = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    const workspace = structuredClone(state.workspace!)
    for (const system of workspace.model.softwareSystems) for (const container of system.containers) {
      container.name += ' with a longer descriptive title'
      container.description = 'Long descriptions must fit without changing the child layout during zoom. '.repeat(8)
      container.technology = 'TypeScript, Java, PostgreSQL, Spring Framework, Messaging, OpenTelemetry'
      for (const component of container.components) {
        component.description = container.description
        component.technology = container.technology
      }
    }
    state.loadWorkspace(workspace)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('apiApp'))
  await expect(page.locator('.react-flow__node[data-id="apiApp"] .c4-node-header')).toBeVisible()
  await page.waitForTimeout(300)
  let previousGeometry: unknown
  for (const factor of [1, 1.3, 1.5, .65]) {
    await host.evaluate((el, factor) => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(factor), factor)
    await page.waitForTimeout(150)
    const geometry = await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.layoutState.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]))
    if (previousGeometry) expect(geometry).toEqual(previousGeometry)
    previousGeometry = geometry
    await expect.poll(() => host.evaluate(el => {
      const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
      const errors: string[] = []
      for (const node of camera.layoutState.nodes) {
        const card = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.id}"] .c4-node`)
        if (!card) continue
        const header = card.querySelector<HTMLElement>('.c4-node-header')!
        if ((camera.reveal.get(node.id) ?? 0) > .5 && Number(getComputedStyle(header).opacity) < .99) errors.push(`hidden title: ${node.id}`)
        if (!node.parent) continue
        const zoom = camera.getZoom(), bounds = card.getBoundingClientRect()
        if (Math.abs(bounds.height - node.height * zoom) > 2) errors.push(`wrong height: ${node.id}: ${bounds.height} vs ${node.height * zoom}`)
        const wrapper = card.closest<HTMLElement>('.react-flow__node')!
        const parentWrapper = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.parent.id}"]`)!
        if (Number(getComputedStyle(wrapper).zIndex) <= Number(getComputedStyle(parentWrapper).zIndex)) errors.push(`child behind parent: ${node.id}`)
        if (Number(getComputedStyle(wrapper).opacity) < .99) errors.push(`unmeasured child: ${node.id}`)
        const parent = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.parent.id}"] .c4-node`)!.getBoundingClientRect()
        const parentHeader = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.parent.id}"] .c4-node-header`)!.getBoundingClientRect()
        if (bounds.left < parent.left - 1 || bounds.right > parent.right + 1 || bounds.bottom > parent.bottom + 1 || bounds.top < parentHeader.bottom - 1) errors.push(`outside parent body: ${node.id}`)
      }
      return errors
    })).toEqual([])
  }
  await page.screenshot({ path: testInfo.outputPath('expanded-titles-and-children.png') })
})
