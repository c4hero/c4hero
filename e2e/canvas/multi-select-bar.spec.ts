import { test, expect, type WorkspaceHelper } from '../fixtures/workspace'

/**
 * Regressions covered:
 *  - PR #39 (multiselect-align-persists): handleAlign relied on
 *    reactFlow.setNodes(fn) running its callback synchronously to populate
 *    the alignedPositions array passed to updateNodePositions. RF defers
 *    the callback, so the persist step silently no-op'd and the canvas
 *    didn't move.
 *  - PR #40 (align-prevents-overlap): aligning two nodes that happened to
 *    share the OTHER axis stacked them on top of each other. After-align
 *    pass now sorts by the preserved axis and nudges any pair that would
 *    overlap apart by the predecessor's size + a 24px gap.
 */
test.describe('multi-select bar — align', () => {
  test('toolbar waits for primary pointer release before appearing', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await workspace.page.evaluate(() => {
      type S = { selectElements: (ids: string[]) => void }
      document.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
      const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
      store?.selectElements(['customer', 'atm'])
    })

    await expect(workspace.page.locator('[data-canvas-chrome="multi-select-bar"]')).toBeHidden()
    await workspace.page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
    })
    await expect(workspace.page.getByText('2 selected')).toBeVisible()
  })

  test('shift-drag selection commits once on mouse release', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)
    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 100, y: 80 },
      { id: 'atm', x: 460, y: 180 },
      { id: 'internetBanking', x: 980, y: 80 },
      { id: 'mainframe', x: 980, y: 360 },
      { id: 'email', x: 1220, y: 640 },
      { id: 'supportStaff', x: 1380, y: 120 },
      { id: 'backoffice', x: 1380, y: 420 },
    ])

    const customer = await getNodeBox(workspace.page, 'customer')
    const atm = await getNodeBox(workspace.page, 'atm')
    const startX = Math.max(8, Math.min(customer.x, atm.x) - 28)
    const startY = Math.max(8, Math.min(customer.y, atm.y) - 28)
    const endX = Math.max(customer.x + customer.width, atm.x + atm.width) + 28
    const endY = Math.max(customer.y + customer.height, atm.y + atm.height) + 28

    await workspace.page.keyboard.down('Shift')
    await workspace.page.mouse.move(startX, startY)
    await workspace.page.mouse.down()
    await workspace.page.mouse.move(endX, endY, { steps: 8 })

    await expect.poll(() => readSelectedElementIds(workspace.page)).toEqual([])
    await expect(workspace.page.locator('[data-canvas-chrome="multi-select-bar"]')).toBeHidden()

    await workspace.page.mouse.up()
    await workspace.page.keyboard.up('Shift')

    await expect.poll(async () => {
      const ids = await readSelectedElementIds(workspace.page)
      return ids.includes('customer') && ids.includes('atm') && ids.length >= 2
    }).toBe(true)
    await expect(workspace.page.getByText(/\d+ selected/)).toBeVisible()
  })

  test('toolbar clears accidental browser text selection when it appears', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await workspace.page.evaluate(() => {
      const target = document.createElement('div')
      target.dataset.testid = 'temporary-selectable-text'
      target.textContent = 'temporary selected text'
      target.style.position = 'fixed'
      target.style.left = '0'
      target.style.top = '0'
      target.style.userSelect = 'text'
      document.body.appendChild(target)
      const range = document.createRange()
      range.selectNodeContents(target)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    await expect.poll(() => workspace.page.evaluate(() => window.getSelection()?.toString() ?? '')).not.toBe('')

    await workspace.page.evaluate(() => {
      type S = { selectElements: (ids: string[]) => void }
      const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
      store?.selectElements(['customer', 'atm'])
    })

    await expect(workspace.page.locator('[data-canvas-chrome="multi-select-bar"]')).toBeVisible()
    await expect.poll(() => workspace.page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  })

  test('Align top makes both selected nodes share the same y AND persists', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('Internet Banking System')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    const before = await readPositions(workspace.page, ['customer', 'internetBanking'])
    expect(before.find((p) => p.id === 'customer')!.y)
      .not.toBe(before.find((p) => p.id === 'internetBanking')!.y)

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align top' }).click()
    await workspace.page.waitForTimeout(300)

    const after = await readPositions(workspace.page, ['customer', 'internetBanking'])
    const yA = after.find((p) => p.id === 'customer')!.y
    const yB = after.find((p) => p.id === 'internetBanking')!.y
    expect(Math.abs(yA - yB)).toBeLessThan(0.5)
    // The persist step actually wrote new positions to the store.
    expect(after).not.toEqual(before)
  })

  test('Align top spreads two close-x nodes apart so they do not overlap', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => (window as unknown as { __testSetView?: (k: string) => void }).__testSetView?.('SystemContext'))
    await workspace.page.waitForTimeout(300)

    // Force the two nodes to be very close on the x axis but far on y so
    // an Align top would naively stack them.
    await workspace.page.evaluate(() => {
      type S = { updateNodePositions: (u: { id: string; x: number; y: number }[]) => void }
      const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
      store?.updateNodePositions([
        { id: 'customer', x: 100, y: 50 },
        { id: 'internetBanking', x: 110, y: 400 },
      ])
    })
    await workspace.page.waitForTimeout(200)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('Internet Banking System')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align top' }).click()
    await workspace.page.waitForTimeout(300)

    const after = await readPositions(workspace.page, ['customer', 'internetBanking'])
    const a = after.find((p) => p.id === 'customer')!
    const b = after.find((p) => p.id === 'internetBanking')!
    // Same y after Align top.
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.5)
    // But x-distance must be at least the (default) node width so they do
    // NOT visually overlap. We don't have measured widths in the store, so
    // assert the distance is more than 100 — the broken behavior would
    // have left them at x=100 and x=110 (a 10px gap on the same y).
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(100)
  })

  test('Align middle Y uses rendered node centers for differently sized nodes', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 100, y: 80 },
      { id: 'atm', x: 560, y: 280 },
    ])

    const beforeCustomer = await getNodeBox(workspace.page, 'customer')
    const beforeAtm = await getNodeBox(workspace.page, 'atm')
    expect(Math.abs(beforeCustomer.height - beforeAtm.height)).toBeGreaterThan(20)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('ATM')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align middle Y' }).click()
    await workspace.page.waitForTimeout(300)

    const customer = await getNodeBox(workspace.page, 'customer')
    const atm = await getNodeBox(workspace.page, 'atm')
    expect(Math.abs(centerY(customer) - centerY(atm))).toBeLessThan(1)
  })

  test('Align center X uses rendered node centers for differently sized nodes', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 120, y: 80 },
      { id: 'atm', x: 620, y: 360 },
    ])

    const beforeCustomer = await getNodeBox(workspace.page, 'customer')
    const beforeAtm = await getNodeBox(workspace.page, 'atm')
    expect(Math.abs(beforeCustomer.width - beforeAtm.width)).toBeGreaterThan(20)

    await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
    await workspace.clickNode('Personal Banking Customer')
    await workspace.clickNode('ATM')
    await expect(workspace.page.getByText('2 selected')).toBeVisible()

    await workspace.page.locator('button[title="Align elements"]').click()
    await workspace.page.getByRole('button', { name: 'Align center X' }).click()
    await workspace.page.waitForTimeout(300)

    const customer = await getNodeBox(workspace.page, 'customer')
    const atm = await getNodeBox(workspace.page, 'atm')
    expect(Math.abs(centerX(customer) - centerX(atm))).toBeLessThan(1)
  })

  test('Align top leaves a locked node in the selection untouched', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 100, y: 80 },
      { id: 'atm', x: 460, y: 500 },
      { id: 'mainframe', x: 820, y: 200 },
    ])
    await lockElements(workspace.page, ['atm'])

    const atmBefore = await getNodeBox(workspace.page, 'atm')

    await selectNodes(workspace, ['Personal Banking Customer', 'ATM', 'Mainframe Banking System'])
    await clickAlignAction(workspace.page, 'Align top')

    const customer = await getNodeBox(workspace.page, 'customer')
    const mainframe = await getNodeBox(workspace.page, 'mainframe')
    const atmAfter = await getNodeBox(workspace.page, 'atm')

    // The two unlocked nodes aligned to each other...
    expect(Math.abs(customer.y - mainframe.y)).toBeLessThan(0.5)
    // ...but the locked node was excluded from the alignment entirely — it
    // never moved, on screen or in the store — even though it was part of
    // the selection Align top ran on.
    expect(Math.abs(atmAfter.y - atmBefore.y)).toBeLessThan(0.5)
    expect(Math.abs(atmAfter.x - atmBefore.x)).toBeLessThan(0.5)
    expect(Math.abs(atmAfter.y - customer.y)).toBeGreaterThan(5)
  })

  test('Distribute horizontally spaces rendered node gaps evenly', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 100, y: 80 },
      { id: 'atm', x: 650, y: 260 },
      { id: 'mainframe', x: 1080, y: 140 },
    ])

    await selectNodes(workspace, ['Personal Banking Customer', 'ATM', 'Mainframe Banking System'])
    await clickAlignAction(workspace.page, 'Distribute horizontally')

    const boxes = await getSortedNodeBoxes(workspace.page, ['customer', 'atm', 'mainframe'], 'x')
    const gaps = [
      boxes[1].box.x - (boxes[0].box.x + boxes[0].box.width),
      boxes[2].box.x - (boxes[1].box.x + boxes[1].box.width),
    ]
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(2)
  })

  test('Distribute vertically spaces rendered node gaps evenly', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 100, y: 80 },
      { id: 'atm', x: 620, y: 420 },
      { id: 'mainframe', x: 360, y: 760 },
    ])

    await selectNodes(workspace, ['Personal Banking Customer', 'ATM', 'Mainframe Banking System'])
    await clickAlignAction(workspace.page, 'Distribute vertically')

    const boxes = await getSortedNodeBoxes(workspace.page, ['customer', 'atm', 'mainframe'], 'y')
    const gaps = [
      boxes[1].box.y - (boxes[0].box.y + boxes[0].box.height),
      boxes[2].box.y - (boxes[1].box.y + boxes[1].box.height),
    ]
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(2)
  })

  test('Straighten path horizontal uses relationship order and rendered centers', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 520, y: 300 },
      { id: 'atm', x: 100, y: 80 },
      { id: 'mainframe', x: 940, y: 520 },
    ])

    await selectNodes(workspace, ['ATM', 'Mainframe Banking System', 'Personal Banking Customer'])
    await clickAlignAction(workspace.page, 'Straighten path horizontal')

    const boxes = await getSortedNodeBoxes(workspace.page, ['customer', 'atm', 'mainframe'], 'x')
    expect(boxes.map((item) => item.id)).toEqual(['customer', 'atm', 'mainframe'])
    const centers = boxes.map((item) => centerY(item.box))
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2)
  })

  test('Straighten path vertical uses relationship order and rendered centers', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await setActiveViewPositions(workspace.page, [
      { id: 'customer', x: 620, y: 360 },
      { id: 'atm', x: 100, y: 80 },
      { id: 'mainframe', x: 940, y: 520 },
    ])

    await selectNodes(workspace, ['ATM', 'Mainframe Banking System', 'Personal Banking Customer'])
    await clickAlignAction(workspace.page, 'Straighten path vertical')

    const boxes = await getSortedNodeBoxes(workspace.page, ['customer', 'atm', 'mainframe'], 'y')
    expect(boxes.map((item) => item.id)).toEqual(['customer', 'atm', 'mainframe'])
    const centers = boxes.map((item) => centerX(item.box))
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2)
  })
})

test.describe('multi-select bar — delete', () => {
  test('Delete from model button text fits when many nodes are selected', async ({ workspace }) => {
    await workspace.loadSample()
    const landscape = (await workspace.getViews()).find((view) => view.type === 'systemLandscape')
    expect(landscape).toBeTruthy()
    await workspace.setView(landscape!.key)

    await selectNodes(workspace, [
      'Personal Banking Customer',
      'Internet Banking System',
      'Mainframe Banking System',
      'E-mail System',
      'ATM',
      'Customer Service Staff',
      'Back Office Staff',
    ])

    const deleteButton = workspace.page
      .locator('[data-canvas-chrome="multi-select-bar"]')
      .getByRole('button', { name: 'Delete 7 elements from the model' })
    await expect(deleteButton).toBeVisible()
    await expect.poll(() => buttonContentsFit(deleteButton)).toBe(true)
  })

  test('Delete from model shows impact-aware confirm dialog', async ({ workspace }) => {
    await workspace.loadSample()
    const views = await workspace.getViews()
    const landscape = views.find(v => v.type === 'systemLandscape')
    test.skip(!landscape, 'sample workspace has no landscape view')
    await workspace.setView(landscape!.key)

    // Pick two systems with containers (so cascade is visible)
    const ws = await workspace.getWorkspace()
    const systems = ws!.model.softwareSystems.filter(s => s.containers.length > 0).slice(0, 2)
    test.skip(systems.length < 2, 'sample workspace has fewer than 2 systems with containers')

    // Multi-select via shift-click
    await workspace.clickNode(systems[0].name)
    await workspace.page.keyboard.down('Shift')
    await workspace.clickNode(systems[1].name)
    await workspace.page.keyboard.up('Shift')

    // Click "Delete from model" in the toolbar
    await workspace.page.locator('[data-canvas-chrome="multi-select-bar"]').getByRole('button', { name: /delete from model/i }).click()

    // Confirm dialog appears with impact list
    const dialog = workspace.page.getByRole('dialog', { name: /confirm delete/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('list', { name: /cascade impact/i })).toBeVisible()
  })
})

async function readPositions(page: import('@playwright/test').Page, ids: string[]) {
  return page.evaluate(({ ids }) => {
    type WS = { views: { systemContextViews: Array<{ elements: Array<{ id: string; x?: number; y?: number }> }> } }
    const ws = (window as unknown as { __testGetWorkspace?: () => WS }).__testGetWorkspace?.()
    const view = ws?.views.systemContextViews[0]
    return view!.elements
      .filter((e) => ids.includes(e.id))
      .map((e) => ({ id: e.id, x: e.x ?? 0, y: e.y ?? 0 }))
  }, { ids })
}

async function readSelectedElementIds(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    type S = { selectedElementIds: string[] }
    return (window as unknown as { __testStore?: () => S }).__testStore?.().selectedElementIds ?? []
  })
}

async function setActiveViewPositions(
  page: import('@playwright/test').Page,
  positions: Array<{ id: string; x: number; y: number }>,
) {
  await page.evaluate((updates) => {
    type S = { updateNodePositions: (u: Array<{ id: string; x: number; y: number }>) => void }
    const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
    store?.updateNodePositions(updates)
  }, positions)
  await page.waitForTimeout(250)
}

async function lockElements(page: import('@playwright/test').Page, ids: string[]) {
  await page.evaluate((elementIds) => {
    type S = { activeViewKey: string | null; setElementsLocked: (viewKey: string, ids: string[], locked: boolean) => void }
    const store = (window as unknown as { __testStore?: () => S }).__testStore?.()
    if (store?.activeViewKey) store.setElementsLocked(store.activeViewKey, elementIds, true)
  }, ids)
  await page.waitForTimeout(150)
}

async function getNodeBox(page: import('@playwright/test').Page, id: string) {
  const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`Node ${id} has no bounding box`)
  return box
}

function centerX(box: { x: number; width: number }) {
  return box.x + box.width / 2
}

function centerY(box: { y: number; height: number }) {
  return box.y + box.height / 2
}

async function selectNodes(
  workspace: WorkspaceHelper,
  names: string[],
) {
  await workspace.page.getByRole('button', { name: /Multi-select/ }).click()
  for (const name of names) await workspace.clickNode(name)
  await expect(workspace.page.getByText(`${names.length} selected`)).toBeVisible()
}

async function clickAlignAction(page: import('@playwright/test').Page, name: string) {
  await page.locator('button[title="Align elements"]').click()
  await page.getByRole('button', { name }).click()
  await page.waitForTimeout(300)
}

async function getSortedNodeBoxes(
  page: import('@playwright/test').Page,
  ids: string[],
  axis: 'x' | 'y',
) {
  const boxes = await Promise.all(ids.map(async (id) => ({ id, box: await getNodeBox(page, id) })))
  return boxes.sort((a, b) => {
    const centerA = axis === 'x' ? centerX(a.box) : centerY(a.box)
    const centerB = axis === 'x' ? centerX(b.box) : centerY(b.box)
    return centerA - centerB
  })
}

async function buttonContentsFit(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
}
