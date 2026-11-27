import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/workspace'

/** The viewport's pan offset, read from the transform React Flow renders. */
async function pan(page: Page) {
  return page.locator('.react-flow__viewport').evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: m.e, y: m.f, zoom: m.a }
  })
}

/** Records every context menu event after the canvas has handled it. */
async function watchContextMenus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __menus: boolean[] }
    w.__menus = []
    window.addEventListener('contextmenu', e => w.__menus.push(e.defaultPrevented))
  })
  return () => page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus)
}

async function rightDrag(page: Page, from: { x: number; y: number }, delta: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 10 })
  await page.mouse.up({ button: 'right' })
}

async function nodeCenter(page: Page, id: string) {
  const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`no box for ${id}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

test.describe('Right-drag panning', () => {
  test('right-drag over a node pans the canvas without moving the node or opening a menu', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const menus = await watchContextMenus(page)
    const id = await workspace.getVisibleNodeByName('Internet Banking System').getAttribute('data-id')
    const start = await nodeCenter(page, id!)
    const before = await pan(page)

    await rightDrag(page, start, { x: 120, y: 70 })

    const after = await pan(page)
    expect(after.x - before.x).toBeCloseTo(120, 0)
    expect(after.y - before.y).toBeCloseTo(70, 0)
    expect(after.zoom).toBeCloseTo(before.zoom, 5)
    // The node rode along with the viewport: it was panned, not dragged.
    const moved = await nodeCenter(page, id!)
    expect(moved.box.x - start.box.x).toBeCloseTo(120, 0)
    expect(moved.box.y - start.box.y).toBeCloseTo(70, 0)
    // Chromium on Linux fires the menu on press; it must not have opened.
    expect(await menus()).not.toContain(false)
    // A menu the platform opens on release (Windows) is suppressed after a drag.
    const late = await page.evaluate(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      document.querySelector('.react-flow__pane')!.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(late).toBe(true)
  })

  test('right-drag on the empty pane and over an edge pans too', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const pane = await page.locator('.react-flow__pane').boundingBox()
    const before = await pan(page)
    await rightDrag(page, { x: pane!.x + 200, y: pane!.y + pane!.height - 120 }, { x: -60, y: -50 })
    const afterPane = await pan(page)
    expect(afterPane.x - before.x).toBeCloseTo(-60, 0)
    expect(afterPane.y - before.y).toBeCloseTo(-50, 0)

    const edge = page.locator('.react-flow__edge-interaction').first()
    const point = await edge.evaluate(el => {
      const path = el as SVGPathElement
      const p = path.getPointAtLength(path.getTotalLength() / 2)
      const m = path.getScreenCTM()!
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
    })
    await rightDrag(page, point, { x: 50, y: 30 })
    const afterEdge = await pan(page)
    expect(afterEdge.x - afterPane.x).toBeCloseTo(50, 0)
    expect(afterEdge.y - afterPane.y).toBeCloseTo(30, 0)
  })

  test('a plain right click keeps its context menu and does not pan', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const id = await workspace.getVisibleNodeByName('Internet Banking System').getAttribute('data-id')
    const start = await nodeCenter(page, id!)
    const before = await pan(page)

    // A right click that wobbles less than the threshold is still a click.
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(start.x + 2, start.y + 1)
    await page.mouse.up({ button: 'right' })
    expect(await pan(page)).toEqual(before)

    // Where the menu opens on release (Windows), it is left to open.
    const result = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)!
      const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }
      target.dispatchEvent(new PointerEvent('pointerdown', { ...opts, button: 2, buttons: 2 }))
      target.dispatchEvent(new PointerEvent('pointerup', { ...opts, button: 2, buttons: 0 }))
      const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y })
      target.dispatchEvent(menu)
      return menu.defaultPrevented
    }, start)
    expect(result).toBe(false)

    // A keyboard menu is never a pan.
    const menus = await watchContextMenus(page)
    await page.locator(`.react-flow__node[data-id="${id}"]`).focus()
    await page.keyboard.press('Shift+F10')
    expect(await menus()).toEqual([false])
  })

  test('right-drag pans in Zoom mode', async ({ page, workspace }) => {
    await workspace.loadSample()
    // No inertia, so the camera stops where the pointer let go.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await workspace.waitForCanvasSettled()
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await expect(page.locator('[data-semantic-zoom="true"]')).toHaveCount(1)
    const menus = await watchContextMenus(page)
    const id = await workspace.getVisibleNodeByName('Internet Banking System').getAttribute('data-id')
    const start = await nodeCenter(page, id!)
    const before = await pan(page)

    await rightDrag(page, start, { x: -90, y: 60 })

    await expect.poll(async () => {
      const after = await pan(page)
      return [Math.round(after.x - before.x), Math.round(after.y - before.y)]
    }).toEqual([-90, 60])
    expect(await menus()).not.toContain(false)
  })
})
