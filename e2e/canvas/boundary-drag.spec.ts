import type { Page } from '@playwright/test'
import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

/**
 * Regression (TEA-396): the software-system boundary on a Container view
 * showed a grab cursor on its label but was not draggable, so a left drag
 * there panned the canvas. Its label now moves the boundary and every member
 * together. The body stays click-through.
 */

const DSL = `workspace "BoundaryDrag" {
  model {
    user = person "User"
    shop = softwareSystem "Web Shop" {
      api = container "Shop API"
      db = container "Shop DB"
      api -> db "Persists orders"
    }
    user -> api "Uses"
  }
  views {
    container shop "Containers" {
      include *
      autolayout lr
    }
  }
}`

const BOUNDARY = '.react-flow__node[data-id="__scope_boundary__shop"]'

async function pan(page: Page) {
  return page.locator('.react-flow__viewport').evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: m.e, y: m.f, zoom: m.a }
  })
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox()
  if (!b) throw new Error(`no box for ${selector}`)
  return b
}

const node = (id: string) => `.react-flow__node[data-id="${id}"]`

async function leftDrag(page: Page, from: { x: number; y: number }, delta: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 12 })
  await page.mouse.up()
}

async function labelPoint(page: Page) {
  const label = await box(page, `${BOUNDARY} .c4-overlay-drag-handle`)
  return { x: label.x + 12, y: label.y + label.height / 2 }
}

/** Store-side position of an element in the active view. */
async function storedPosition(workspace: WorkspaceHelper, id: string) {
  return workspace.page.evaluate((elementId) => {
    const store = (window as Record<string, unknown>).__testStore as () => {
      workspace: { views: Record<string, Array<{ key: string; elements: Array<{ id: string; x?: number; y?: number }> }>> }
      activeViewKey: string | null
    }
    const state = store()
    for (const views of Object.values(state.workspace.views)) {
      if (!Array.isArray(views)) continue
      const el = views.find(v => v.key === state.activeViewKey)?.elements.find(e => e.id === elementId)
      if (el) return { x: el.x ?? 0, y: el.y ?? 0 }
    }
    return null
  }, id)
}

async function expectBoundaryDragMovesMembers(workspace: WorkspaceHelper) {
  const { page } = workspace
  const delta = { x: 120, y: 80 }
  const before = {
    pan: await pan(page),
    boundary: await box(page, BOUNDARY),
    api: await box(page, node('api')),
    db: await box(page, node('db')),
    user: await box(page, node('user')),
  }

  const from = await labelPoint(page)
  await leftDrag(page, from, delta)
  await workspace.waitForCanvasSettled()

  // The viewport stayed put: this was a node drag, not a pan.
  const after = await pan(page)
  expect(after.x).toBeCloseTo(before.pan.x, 0)
  expect(after.y).toBeCloseTo(before.pan.y, 0)
  expect(after.zoom).toBeCloseTo(before.pan.zoom, 5)
  // The boundary and both members moved together (snap may round the delta).
  for (const key of ['boundary', 'api', 'db'] as const) {
    const moved = await box(page, key === 'boundary' ? BOUNDARY : node(key))
    expect(Math.abs(moved.x - before[key].x - delta.x), key).toBeLessThan(40)
    expect(Math.abs(moved.y - before[key].y - delta.y), key).toBeLessThan(40)
    expect(moved.x - before[key].x, key).toBeGreaterThan(40)
  }
  // The person outside the boundary did not.
  const user = await box(page, node('user'))
  expect(user.x).toBeCloseTo(before.user.x, 0)
  expect(user.y).toBeCloseTo(before.user.y, 0)
}

test.describe('System boundary drag (TEA-396)', () => {
  test('dragging the boundary label moves it and its containers, not the viewport', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Containers')
    await workspace.waitForCanvasSettled()
    const storedBefore = await storedPosition(workspace, 'api')

    await expectBoundaryDragMovesMembers(workspace)

    // The new member positions are saved, so they survive a rebuild.
    const storedAfter = await storedPosition(workspace, 'api')
    expect(storedAfter!.x - storedBefore!.x).toBeGreaterThan(40)
    expect(storedAfter!.y - storedBefore!.y).toBeGreaterThan(40)
  })

  test('the same drag works in Zoom mode', async ({ page, workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Containers')
    await workspace.waitForCanvasSettled()
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await expect(page.locator('[data-semantic-zoom="true"]')).toBeVisible()
    await workspace.waitForCanvasSettled()

    await expectBoundaryDragMovesMembers(workspace)
  })

  test('a left drag on the boundary body still pans the canvas', async ({ page, workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Containers')
    await workspace.waitForCanvasSettled()
    const b = await box(page, BOUNDARY)
    // An empty spot inside the boundary, below its members.
    const from = await page.evaluate(({ x, y, width, height }) => {
      for (let fy = 0.95; fy > 0.3; fy -= 0.05) {
        for (let fx = 0.05; fx < 0.95; fx += 0.05) {
          const p = { x: x + width * fx, y: y + height * fy }
          if (document.elementFromPoint(p.x, p.y)?.classList.contains('react-flow__pane')) return p
        }
      }
      return null
    }, b)
    expect(from).not.toBeNull()
    const before = await pan(page)
    const api = await storedPosition(workspace, 'api')

    await leftDrag(page, from!, { x: 90, y: 50 })

    const after = await pan(page)
    expect(after.x - before.x).toBeCloseTo(90, 0)
    expect(after.y - before.y).toBeCloseTo(50, 0)
    expect(await storedPosition(workspace, 'api')).toEqual(api)
  })

  test('a locked view keeps the boundary pinned', async ({ page, workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Containers')
    await workspace.waitForCanvasSettled()
    await page.getByRole('button', { name: 'Auto-arrange' }).click()
    await page.getByRole('button', { name: /Lock view layout/ }).click()
    await workspace.clickCanvas()
    const api = await storedPosition(workspace, 'api')
    const before = await box(page, BOUNDARY)
    const beforePan = await pan(page)

    await leftDrag(page, await labelPoint(page), { x: 120, y: 80 })
    await workspace.waitForCanvasSettled()

    expect(await storedPosition(workspace, 'api')).toEqual(api)
    // With the boundary pinned, the press falls through to the pane and pans.
    const after = await box(page, BOUNDARY)
    const afterPan = await pan(page)
    expect(after.x - before.x).toBeCloseTo(afterPan.x - beforePan.x, 0)
  })
})
