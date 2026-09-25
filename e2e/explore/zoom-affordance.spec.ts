import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test('zoomable cards stand out only during zoom with no selection', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  const card = page.locator('.react-flow__node[data-id="internetBanking"] .c4-node')
  await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  await page.mouse.move(100, 400)
  await page.mouse.wheel(0, -40)
  await expect(host).toHaveAttribute('data-zoom-active', 'true')
  expect(await card.evaluate(el => getComputedStyle(el, '::after').opacity)).toBe('1')
  await expect(page.locator('.react-flow__node[data-id="customer"] .c4-node')).not.toHaveAttribute('data-semantic-expandable')
  await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  expect(await card.evaluate(el => getComputedStyle(el, '::after').opacity)).toBe('0')
  for (const selection of ['element', 'relationship', 'group']) {
    await page.evaluate(selection => {
      const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
      s.clearSelection()
      if (selection === 'element') s.selectElements(['internetBanking'])
      else if (selection === 'relationship') s.selectRelationship(s.workspace!.model.relationships[0].id)
      else s.selectGroup('test-group')
    }, selection)
    await page.waitForTimeout(200)
    await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(1.1))
    await page.waitForTimeout(50)
    await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  }
  await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().clearSelection())
  await page.waitForTimeout(300)
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.pan(20, 0))
  await page.waitForTimeout(50)
  await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.zoomBy(.9))
  await expect(host).toHaveAttribute('data-zoom-active', 'true')
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect(page.locator('[data-zoom-active="true"]')).toHaveCount(0)
})
