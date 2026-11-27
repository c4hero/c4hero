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

  test('a plain right click on a node opens the canvas menu instead of panning', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const menus = await watchContextMenus(page)
    const id = await workspace.getVisibleNodeByName('Mainframe Banking System').getAttribute('data-id')
    const start = await nodeCenter(page, id!)
    const before = await pan(page)

    // A right click that wobbles less than the threshold is still a click.
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(start.x + 2, start.y + 1)
    await page.mouse.up({ button: 'right' })
    expect(await pan(page)).toEqual(before)

    const menu = page.getByRole('menu', { name: 'Canvas actions' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Zoom in', /^Duplicate/, 'Lock position', 'What breaks if I remove this?', /^Remove from view/, /^Delete from model/,
    ])
    // It opens where the pointer let go (flipped left near the window's edge),
    // and the node it was opened on is selected.
    const box = await menu.boundingBox()
    expect(Math.min(Math.abs(box!.x - (start.x + 2)), Math.abs(box!.x + box!.width - (start.x + 2)))).toBeLessThan(2)
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveClass(/selected/)
    // The browser's own menu never opened.
    expect(await menus()).not.toContain(false)

    // Escape closes the menu but keeps the selection.
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveClass(/selected/)

    // A menu item does what its shortcut does.
    await page.mouse.click(start.x, start.y, { button: 'right' })
    await menu.getByRole('menuitem', { name: 'Lock position' }).click()
    await expect(menu).toHaveCount(0)
    const locked = await page.evaluate((elementId) => {
      const s = (window as unknown as { __testStore(): { workspace: { views: { systemLandscapeViews: { elements: { id: string; locked?: boolean }[] }[] } } } }).__testStore()
      return s.workspace.views.systemLandscapeViews[0].elements.find(e => e.id === elementId)?.locked
    }, id!)
    expect(locked).toBe(true)
  })

  test('a right click on empty canvas opens canvas actions, and one after a drag opens nothing', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const pane = await page.locator('.react-flow__pane').boundingBox()
    const point = { x: pane!.x + 200, y: pane!.y + pane!.height - 120 }
    const menu = page.getByRole('menu', { name: 'Canvas actions' })

    await rightDrag(page, point, { x: 80, y: -40 })
    await page.waitForTimeout(200)
    await expect(menu).toHaveCount(0)

    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect(menu.getByRole('menuitem')).toHaveText([/^Add element/, /^Select All/, /^Zoom to Fit/, /^Auto-Arrange/])
    await menu.getByRole('menuitem', { name: /Add element/ }).click()
    await expect(page.getByText('Create new')).toBeVisible()
  })

  test('Shift+F10 opens the menu for the focused node, with the first item focused', async ({ page, workspace }) => {
    await workspace.loadSample()
    await workspace.waitForCanvasSettled()
    const menus = await watchContextMenus(page)
    const id = await workspace.getVisibleNodeByName('Internet Banking System').getAttribute('data-id')
    await page.locator(`.react-flow__node[data-id="${id}"]`).focus()
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu', { name: 'Canvas actions' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused()
    expect(await menus()).toEqual([true])
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
    await expect(page.getByRole('menu', { name: 'Canvas actions' })).toHaveCount(0)

    // A plain right click on a card opens the menu, whose Zoom in focuses it.
    const now = await nodeCenter(page, id!)
    await page.mouse.click(now.x, now.y, { button: 'right' })
    await page.getByRole('menu', { name: 'Canvas actions' }).getByRole('menuitem', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())?.width ?? 0).toBeGreaterThan(now.box.width * 1.5)
  })
})
