import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test('children fit their parent after view switches and saving a compact layout', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  for (const stage of ['initial', 'switch', 'legacy', 'save-compact']) {
    if (stage === 'switch') {
      await page.evaluate(() => {
        const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
        s.setActiveView(s.workspace!.views.containerViews[0].key)
      })
      await page.waitForTimeout(250)
      await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('apiApp'))
      await page.waitForTimeout(250)
      await page.evaluate(() => {
        const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
        s.setActiveView(s.workspace!.views.systemLandscapeViews[0].key)
      })
      await page.waitForTimeout(250)
    }
    if (stage === 'legacy') {
      await host.evaluate(el => {
        const c = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
        ;(window as unknown as { __testStore(): WorkspaceState }).__testStore().updateExploreLayout({
          elements: Object.fromEntries(c.layoutState.nodes.filter(n => n.parent).map(n => [n.id, { x: 0, y: 0, pinned: true }])),
        })
      })
    }
    if (stage === 'save-compact') {
      await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().clearSelection())
      await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(.05))
      await page.waitForTimeout(300)
      await host.evaluate(el => {
        const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
        ;(window as unknown as { __testStore(): WorkspaceState }).__testStore().updateExploreLayout(camera.layout())
      })
    }
    await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('internetBanking'))
    await page.waitForTimeout(500)
    const result = await host.evaluate(el => {
      const c = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
      const p = c.layoutState.byId.get('internetBanking')!
      return { parent: { x: p.x, y: p.y, width: p.width, height: p.height, header: p.headerHeight! }, children: p.children.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })) }
    })
    const width = Math.max(...result.children.map(n => n.x + n.width)) - Math.min(...result.children.map(n => n.x))
    const height = Math.max(...result.children.map(n => n.y + n.height)) - Math.min(...result.children.map(n => n.y))
    expect(Math.max(width / (result.parent.width - 28), height / (result.parent.height - result.parent.header - 14)), `${stage} children should fill available body`).toBeGreaterThan(.8)
    for (const n of result.children) {
      expect(n.y, `${stage} ${n.id}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(result.parent.y + result.parent.header)
      expect(n.x).toBeGreaterThanOrEqual(result.parent.x)
      expect(n.x + n.width, `${stage} ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.parent.x + result.parent.width)
      expect(n.y + n.height).toBeLessThanOrEqual(result.parent.y + result.parent.height)
    }
  }
})
