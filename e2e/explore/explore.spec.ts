import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test('Zoom toggles behavior without replacing native nodes, edges or the viewport', async ({ page, workspace }) => {
  const errors: string[] = []
  page.on('pageerror', e => { if (!e.message.includes('WebSocket')) errors.push(e.message) })
  await workspace.loadSample()
  await page.waitForTimeout(500)
  const result = await page.evaluate(async () => {
    const viewport = document.querySelector('.react-flow__viewport')!
    const nodes = [...document.querySelectorAll('.c4-node')]
    const edges = [...document.querySelectorAll('.react-flow__edge-path')]
    const initial = getComputedStyle(viewport).transform
    const before = nodes.map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })
    for (let i = 0; i < 6; i++) {
      ;(document.querySelector('button[aria-label="Zoom"]') as HTMLButtonElement).click()
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (document.querySelector('.react-flow__viewport') !== viewport || nodes.some((n, i) => n !== document.querySelectorAll('.c4-node')[i])) return { error: 'remounted nodes' }
      if (getComputedStyle(viewport).transform !== initial) return { error: 'camera changed' }
      if (edges.some(e => !e.isConnected)) return { error: 'remounted edges' }
      const after = nodes.map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })
      if (after.some((values, i) => values.some((v, j) => Math.abs(v - before[i][j]) > .1))) return { error: 'geometry changed' }
    }
    return { error: null }
  })
  expect(result.error).toBeNull()
  await expect(page.locator('.react-flow')).toHaveCount(1)
  await expect(page.locator('canvas[data-explore-canvas]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('nested focus reveals native containers and components with native relationships', async ({ page, workspace }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', e => { if (!e.message.includes('WebSocket')) errors.push(e.message) })
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await page.locator('[data-semantic-zoom="true"]').evaluate(el => (el as HTMLDivElement & { __semantic: SemanticCamera }).__semantic.focus('signinController'))
  await expect(page.locator('.react-flow__node[data-id="signinController"]')).toBeVisible()
  await expect.poll(() => page.locator('.react-flow__node[data-id="signinController"]').boundingBox().then(b => b?.width ?? 0)).toBeGreaterThan(100)
  await expect(page.locator('.react-flow__node[data-id="apiApp"]')).toBeVisible()
  const relationships = await page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships.filter(r => r.sourceId === 'signinController' || r.destinationId === 'signinController').map(r => r.id))
  expect(relationships.length).toBeGreaterThan(0)
  for (const id of relationships) await expect(page.locator(`.react-flow__edge-path[id="${id}"]`)).toHaveAttribute('d', /^M/)
  await page.screenshot({ path: testInfo.outputPath('native-nested-focus.png') })
  expect(errors).toEqual([])
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="signinController"]')).toHaveCount(0)
})

test('selection freezes reveal and clearing it settles detail without moving the camera', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  await host.evaluate(async el => {
    const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
    camera.reveal.set('internetBanking', .4);
    (window as unknown as { __testStore(): WorkspaceState }).__testStore().selectElements(['customer'])
    camera.zoomBy(1.1)
  })
  await page.waitForTimeout(350)
  expect(await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.reveal.get('internetBanking'))).toBe(.4)
  const camera = await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.getViewport())
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.escape())
  await expect.poll(() => host.evaluate(el => [0, 1].includes((el as HTMLElement & { __semantic: SemanticCamera }).__semantic.reveal.get('internetBanking')!))).toBe(true)
  expect(await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.getViewport())).toEqual(camera)
})

test.describe('touch input', () => {
test.use({ hasTouch: true })
test('native touch pinch, resize and presentation preserve Zoom behavior', async ({ page, workspace }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await workspace.loadSample()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  const zoom = () => host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.getZoom())
  const before = await zoom()
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 650, id: 0 }, { x: 600, y: 650, id: 1 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 450, y: 650, id: 0 }, { x: 650, y: 650, id: 1 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(zoom).toBeGreaterThan(before)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 650, id: 0 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.keyboard.press('p')
  await expect(host).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Zoom', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

})

test('navigation preserves authored state and search focuses through a frozen selection', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(500)
  const authored = () => page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); return { workspace: JSON.stringify(s.workspace), undo: s.undoStack.length, view: s.activeViewKey } })
  const before = await authored()
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.focus('apiApp'))
  await expect(page.locator('.react-flow__node[data-id="apiApp"]')).toBeVisible()
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Search elements and views' }).fill('Security Component')
  await page.getByRole('button').filter({ hasText: 'Security Component' }).last().click()
  await expect.poll(() => host.evaluate(el => {
    const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
    const selected = (window as unknown as { __testStore(): WorkspaceState }).__testStore().selectedElementIds[0]
    const node = camera.layoutState.byId.get(selected)
    return node ? node.width * camera.getZoom() : 0
  })).toBeGreaterThan(120)
  const camera = await host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.getViewport())
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  expect(await page.locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(camera.zoom, 4)
  expect(await authored()).toEqual(before)
})

test('drag release glides, pointer input interrupts and reduced motion stops immediately', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  const x = () => host.evaluate(el => (el as HTMLElement & { __semantic: SemanticCamera }).__semantic.getViewport().x)
  await page.locator('.react-flow__pane').click({ position: { x: 1000, y: 650 } })
  await page.keyboard.down('Space')
  await page.mouse.move(600, 650); await page.mouse.down()
  await page.mouse.move(680, 650, { steps: 5 }); await page.mouse.up()
  const released = await x()
  await expect.poll(x).toBeGreaterThan(released + 1)
  await page.mouse.down()
  const interrupted = await x()
  await page.waitForTimeout(150)
  expect(await x()).toBeCloseTo(interrupted)
  await page.mouse.up()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(600, 650); await page.mouse.down()
  await page.mouse.move(680, 650, { steps: 5 }); await page.mouse.up()
  const stopped = await x()
  await page.waitForTimeout(150)
  expect(await x()).toBeCloseTo(stopped)
  await page.keyboard.up('Space')
})

test('Zoom follows the selected static view and reconciles model deletion', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await page.getByRole('button', { name: 'Switch view' }).click()
  await expect(page.getByRole('button', { name: 'Explore workspace' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Containers', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Zoom', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const host = page.locator('[data-semantic-zoom="true"]')
  await expect.poll(() => host.evaluate(el => {
    const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    const view = s.workspace!.views.containerViews.find(v => v.key === s.activeViewKey)!
    const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
    return camera.layoutState.roots.every(n => view.elements.some(e => e.id === n.id)) && camera.layoutState.roots.some(n => n.element.type === 'container')
  })).toBe(true)
  await page.evaluate(() => {
    const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    s.selectElements(['apiApp']); s.deleteElements(['apiApp'])
  })
  await expect(page.locator('.react-flow__node[data-id="apiApp"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().selectedElementIds.length)).toBe(0)
  await expect(host).toBeVisible()
})

test('native leaf text scales continuously and stays inside the person card', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const host = page.locator('[data-semantic-zoom="true"]')
  const samples = []
  for (const zoom of [1.8, 1.99, 2.01, 2.2, 3.2]) {
    await host.evaluate((el, zoom) => { const c = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic; c.zoomBy(zoom / c.getZoom()) }, zoom)
    await page.waitForTimeout(100)
    samples.push(await page.locator('.react-flow__node[data-id="customer"] .c4-node').evaluate(el => {
      const p = el.querySelector('p')!, range = document.createRange()
      range.selectNodeContents(p)
      const card = el.getBoundingClientRect(), bounds = p.getBoundingClientRect()
      const scale = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform).a
      return { text: p.textContent, lines: range.getClientRects().length, width: bounds.width / scale, height: bounds.height / scale,
        inside: bounds.left >= card.left && bounds.right <= card.right && bounds.top >= card.top && bounds.bottom <= card.bottom }
    }))
  }
  expect(samples[0].text).toBe('A customer of the bank, with personal bank accounts.')
  for (const sample of samples) {
    expect(sample.inside).toBe(true)
    expect(sample.lines).toBe(samples[0].lines)
    expect(sample.width).toBeCloseTo(samples[0].width, 2)
    expect(sample.height).toBeCloseTo(samples[0].height, 2)
  }
})

test.describe('mobile appearance', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  for (const zoom of [.47, .98]) test(`same cards, text, borders and camera at ${zoom} despite stale legacy coordinates`, async ({ page, workspace }, testInfo) => {
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await page.locator('[data-semantic-zoom="true"]').evaluate((el, zoom) => { const c = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic; c.zoomBy(zoom / c.getZoom()) }, zoom)
    await page.waitForTimeout(100)
    await page.getByRole('button', { name: 'Zoom', exact: true }).click()
    await page.evaluate(() => {
      const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
      const view = s.workspace!.views.systemLandscapeViews.find(v => v.key === s.activeViewKey)!
      s.updateExploreLayout({ elements: Object.fromEntries(view.elements.map(e => [e.id, { x: 9999, y: 9999 }])) })
    })
    const result = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('.c4-node')]
      const snapshot = () => cards.map(card => [card, ...card.querySelectorAll('.c4-node-name, p, .c4-type-chip, .c4-node-view-count, svg')].map(el => {
        const s = getComputedStyle(el)
        return { box: el.getBoundingClientRect().toJSON(), text: el.textContent, color: s.color, border: s.border, font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight], clamp: s.webkitLineClamp }
      }))
      const before = snapshot(), camera = getComputedStyle(document.querySelector('.react-flow__viewport')!).transform
      ;(document.querySelector('button[aria-label="Zoom"]') as HTMLButtonElement).click()
      const frames = []
      for (let i = 0; i < 12; i++) {
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        frames.push({ cards: snapshot(), camera: getComputedStyle(document.querySelector('.react-flow__viewport')!).transform })
      }
      return { before, camera, frames, retained: cards.every(c => c.isConnected), count: cards.length, renderedCount: document.querySelectorAll('.c4-node').length }
    })
    expect(result.retained).toBe(true)
    // Hidden descendants may be present in React Flow, but roots are never duplicated.
    await expect(page.locator('.react-flow')).toHaveCount(1)
    await expect(page.locator('.react-flow__node[data-id="customer"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Zoom into / })).toHaveCount(0)
    for (const frame of result.frames) {
      expect(frame.cards).toEqual(result.before)
      expect(frame.camera).toBe(result.camera)
    }
    await page.screenshot({ path: testInfo.outputPath(`mobile-${zoom}.png`) })
  })
})

// Opt-in, isolated to avoid concurrent browser CPU contention.
test('50-system / 500-element / 1000-relationship navigation benchmark', async ({ page, workspace }, testInfo) => {
  test.skip(!process.env.EXPLORE_BENCHMARK, 'Run with EXPLORE_BENCHMARK=1')
  test.setTimeout(90000)
  await workspace.loadBlank()
  await page.evaluate(() => {
    const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    const ws = structuredClone(s.workspace!)
    ws.name = 'Explore benchmark: 50 systems / 500 elements / 1000 relationships'
    ws.model.softwareSystems = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`, type: 'softwareSystem', name: `System ${i}`, tags: [], properties: {},
      containers: Array.from({ length: 3 }, (_, j) => ({ id: `s${i}c${j}`, type: 'container', name: `Service ${i}.${j}`, tags: [], properties: {},
        components: Array.from({ length: 2 }, (_, k) => ({ id: `s${i}c${j}m${k}`, type: 'component', name: `Module ${i}.${j}.${k}`, tags: [], properties: {} })),
      })),
    }))
    ws.model.relationships = Array.from({ length: 1000 }, (_, i) => {
      const system = i % 50, container = Math.floor(i / 50) % 3, toSystem = i < 400 ? system : (system + 1 + Math.floor(i / 200) % 3) % 50
      return { id: `r${i}`, sourceId: `s${system}c${container}m0`, destinationId: `s${toSystem}c${(container + 1) % 3}m1`, description: `Request ${i}`, interactionStyle: i % 5 ? 'Synchronous' : 'Asynchronous', tags: [], properties: {} }
    })
    ws.views.systemLandscapeViews = [{ key: 'benchmark', type: 'systemLandscape', elements: ws.model.softwareSystems.map(s => ({ id: s.id })), relationships: [] }]
    s.loadWorkspace(ws)
  })
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await page.waitForTimeout(1000)
  const result = await page.locator('[data-semantic-zoom="true"]').evaluate(async el => {
    const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
    const intervals: number[] = [], longTasks: number[] = []
    const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(e.duration) })
    observer.observe({ type: 'longtask' })
    let previous = performance.now()
    for (let i = 0; i < 120; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(now => {
        intervals.push(now - previous); previous = now
        camera.pan(Math.sin(i / 15) * 8, Math.cos(i / 23) * 5)
        if (i % 8 === 0) camera.zoomBy(i < 60 ? 1.09 : 1 / 1.09)
        resolve()
      }))
    }
    observer.disconnect()
    return { roots: camera.layoutState.roots.length, elements: camera.layoutState.nodes.length,
      relationships: (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!.model.relationships.length,
      medianInterval: intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)], longTasks }
  })
  await testInfo.attach('benchmark.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.roots).toBe(50); expect(result.elements).toBe(500); expect(result.relationships).toBe(1000)
  // Allow timer jitter around a 60 Hz frame interval.
  expect(result.medianInterval).toBeLessThan(20)
  expect(result.longTasks).toEqual([])
})
