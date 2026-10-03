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
  await expect(host).not.toHaveAttribute('data-zoom-pulse', 'true')
  await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  await expect(card.locator('.semantic-frame')).toHaveCSS('opacity', '0.52')
  // Observe the transient state inside the browser so a slow protocol round
  // trip cannot miss the 240ms hint and turn a valid fade-out into a failure.
  await host.evaluate(el => {
    const observer = new MutationObserver(() => {
      if (el.getAttribute('data-zoom-active') !== 'true') return
      const card = el.querySelector('.react-flow__node[data-id="internetBanking"] .c4-node')!
      const frame = getComputedStyle(card.querySelector('.semantic-frame')!)
      el.setAttribute('data-test-hint', JSON.stringify({ shadow: getComputedStyle(card, '::after').boxShadow, width: frame.borderWidth, opacity: frame.opacity }))
      observer.disconnect()
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-zoom-active'] })
  })
  await page.mouse.move(100, 400)
  await page.mouse.wheel(0, -40)
  await expect(host).toHaveAttribute('data-test-hint', JSON.stringify({ shadow: 'none', width: '2px', opacity: '1' }))
  await expect(page.locator('.react-flow__node[data-id="customer"] .c4-node')).not.toHaveAttribute('data-semantic-expandable')
  await expect(host).not.toHaveAttribute('data-zoom-active', 'true')
  await expect(card.locator('.semantic-frame')).toHaveCSS('border-width', '1px')
  await expect(card.locator('.semantic-frame')).toHaveCSS('opacity', '0.52')
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

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`enabling Zoom pulses all expandable cards for two seconds (${reducedMotion})`, async ({ page, workspace }) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion })
    await page.waitForTimeout(400)
    const toggle = page.getByRole('button', { name: 'Zoom', exact: true })
    await toggle.click()
    const host = page.locator('[data-semantic-zoom="true"]')
    await expect(host).toHaveAttribute('data-zoom-pulse', 'true')
    const leaf = page.locator('.react-flow__node[data-id="customer"] .c4-node')
    const treatment = await host.evaluate(el => {
      // Sample CSS animations at their plateau instead of racing a two-second
      // deadline across several browser round trips on a slower mobile device.
      for (const animation of el.getAnimations({ subtree: true })) {
        if (animation instanceof CSSAnimation && animation.animationName.startsWith('zoom-')) {
          animation.pause(); animation.currentTime = 800
        }
      }
      const cards = [...el.querySelectorAll('.c4-node[data-semantic-expandable]')]
      const leaf = el.querySelector('.react-flow__node[data-id="customer"] .c4-node')!
      return { cards: cards.map(card => {
        const css = getComputedStyle(card)
        return { name: css.animationName, duration: css.animationDuration, shadow: css.boxShadow, inset: getComputedStyle(card.querySelector('.semantic-frame')!).animationName }
      }), opacity: getComputedStyle(leaf).opacity, filter: getComputedStyle(leaf).filter }
    })
    expect(treatment.cards.length).toBeGreaterThan(0)
    for (const card of treatment.cards) {
      expect(card.name).toBe(reducedMotion === 'reduce' ? 'none' : 'zoom-highlight-pulse')
      if (reducedMotion !== 'reduce') expect(card.duration).toBe('2s')
      expect(card.inset).toBe('none')
      expect(card.shadow).not.toBe('none')
    }
    expect(treatment.opacity).toBe('0.28')
    expect(treatment.filter).toBe('saturate(0.7)')
    await expect(host).not.toHaveAttribute('data-zoom-pulse', 'true')
    await expect(leaf).toHaveCSS('opacity', '1')
    await expect(leaf).toHaveCSS('filter', 'none')
    await toggle.click()
    await toggle.click()
    await expect(host).toHaveAttribute('data-zoom-pulse', 'true')
    await toggle.click()
    await expect(page.locator('[data-zoom-pulse="true"]')).toHaveCount(0)
  })
}
