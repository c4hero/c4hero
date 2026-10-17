import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test.use({ hasTouch: true, viewport: { width: 1100, height: 800 } })
const dsl = `workspace "Node pinch" {
 model {
  p = person "Customer"
  s = softwareSystem "Service" {
   api = container "API" { component "Handler" }
  }
  p -> s "Uses"
 }
 views { systemLandscape "landscape" { include * } }
}`

for (const zoomMode of [false, true]) {
  for (const id of ['p', 's', ...(zoomMode ? ['api'] : [])]) {
    test(`pinch starting on ${id} uses the viewport with Zoom ${zoomMode ? 'on' : 'off'}`, async ({ page, workspace }) => {
      await workspace.parseAndLoad(dsl)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForTimeout(500)
      if (zoomMode) await page.getByRole('button', { name: 'Zoom', exact: true }).click()
      if (id === 'api') {
        await page.locator('[data-semantic-zoom="true"]').evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('api'))
        await page.waitForTimeout(150)
      }
      const node = page.locator(`.react-flow__node[data-id="${id}"] .c4-node`)
      const bounds = (await node.boundingBox())!
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.react-flow__node')?.getAttribute('data-id'), center)).toBe(id)
      const state = () => page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); return { workspace: JSON.stringify(s.workspace), undo: s.undoStack.length, selection: s.selectedElementIds } })
      const before = await state()
      const camera = () => page.locator('.react-flow__viewport').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.e, y: m.f, zoom: m.a } })
      const start = await camera()
      const client = await page.context().newCDPSession(page)
      const touch = (x: number, identifier: number) => ({ x, y: center.y, id: identifier })
      // The first finger initially belongs to native node dragging. The second
      // must transfer the whole gesture to viewport zoom without moving nodes.
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x - 20, 0)] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x - 20, 0), touch(center.x + 20, 1)] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x - 35, 0), touch(center.x + 35, 1)] })
      await expect.poll(async () => (await camera()).zoom).toBeGreaterThan(start.zoom * 1.5)
      const enlarged = await camera()
      const anchor = { x: (center.x - start.x) / start.zoom, y: (center.y - start.y) / start.zoom }
      expect(anchor.x * enlarged.zoom + enlarged.x).toBeCloseTo(center.x, 0)
      expect(anchor.y * enlarged.zoom + enlarged.y).toBeCloseTo(center.y, 0)
      // Lifting one finger must not reactivate its cancelled node drag.
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touch(center.x - 35, 0)] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x - 15, 0)] })
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(200)
      expect(await state()).toEqual(before)
      await expect(page.locator('.react-flow')).toHaveCount(1)
    })
  }
}

test('pinch cancels a tentative node drag, handles cancellation, then allows one-finger editing', async ({ page, workspace }) => {
  await workspace.parseAndLoad(dsl)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const node = page.locator('.react-flow__node[data-id="p"] .c4-node')
  const bounds = (await node.boundingBox())!
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const state = () => page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); return { workspace: JSON.stringify(s.workspace), undo: s.undoStack.length } })
  const before = await state()
  const transform = await page.locator('.react-flow__node[data-id="p"]').getAttribute('style')
  const client = await page.context().newCDPSession(page)
  const touch = (x: number, id: number) => ({ x, y: center.y, id })
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x, 0)] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x + 30, 0)] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x + 80, 0)] })
  await expect(page.locator('.react-flow__node[data-id="p"]')).not.toHaveAttribute('style', transform!)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(center.x + 80, 0), touch(center.x + 120, 1)] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(center.x + 60, 0), touch(center.x + 140, 1)] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.waitForTimeout(200)
  expect(await state()).toEqual(before)
  await expect(page.locator('.react-flow__node[data-id="p"]')).toHaveAttribute('style', transform!)
  const updated = (await node.boundingBox())!
  const p = { x: updated.x + updated.width / 2, y: updated.y + updated.height / 2 }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 2 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 20, y: p.y, id: 2 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 100, y: p.y, id: 2 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await state()).undo).toBe(before.undo + 1)
  expect((await state()).workspace).not.toBe(before.workspace)
})
