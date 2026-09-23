import { test, expect } from '../fixtures/workspace'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { ExploreController } from '../../src/lib/explore/controller'
import { readFileSync, writeFileSync } from 'node:fs'
const fixture = readFileSync(new URL('../fixtures/northstar-commerce.dsl', import.meta.url), 'utf8')

test('description lines remain stable across zoom and scale continuously', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await canvas.evaluate(el => (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.focus('internetBanking'))
  await page.waitForTimeout(150)
  const samples = []
  for (const zoom of [1.8, 1.99, 2.01, 2.2, 3.2]) {
    await canvas.evaluate((el, zoom) => {
      const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
      engine.state.reveal.set('internetBanking', 0)
      engine.zoomBy(zoom / engine.state.camera.zoom)
    }, zoom)
    await page.waitForTimeout(100)
    samples.push(await canvas.evaluate(el => {
      const s = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.state
      const text = s.textLayouts!.get('internetBanking')!
      return { lines: text.lines, scale: text.descriptionScale / s.camera.zoom }
    }))
  }
  for (const sample of samples) {
    expect(sample.lines).toEqual(samples[0].lines)
    expect(sample.scale).toBeCloseTo(samples[0].scale, 8)
  }
})

test('nested edge labels never overlap other captions or leaf cards', async ({ page, workspace }, testInfo) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await expect(canvas).toHaveAttribute('data-camera', /zoom/)
  const overview = await canvas.evaluate(el => (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.exportSVG('current'))
  expect(overview).not.toContain('zoom in')
  expect(overview).toContain('data-expandable="true"')
  await canvas.evaluate(el => (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.focus('internetBanking'))
  await page.waitForTimeout(150)
  for (const zoom of [3.5, 6, 10]) {
    await canvas.evaluate((el, zoom) => { const e = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore; e.zoomBy(zoom / e.state.camera.zoom) }, zoom)
    await page.waitForTimeout(100)
    const collisions = await canvas.evaluate(el => {
      const s = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.state
      const labels = s.edgeLabels ?? []
      const cards = s.layout.nodes.filter(n => !n.children.length).map(n => ({ x: n.x * s.camera.zoom + s.camera.x, y: n.y * s.camera.zoom + s.camera.y, width: n.width * s.camera.zoom, height: n.height * s.camera.zoom }))
      const intersects = (a: typeof cards[number], b: typeof cards[number]) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      const overlapping = labels.some((label, i) => labels.slice(i + 1).some(other => intersects(label, other)) || cards.some(card => intersects(label, card)))
      const misplaced = labels.some((label, i) => label.y + label.height >= s.edgeLabelAnchors![i].y)
      return overlapping || misplaced
    })
    expect(collisions).toBe(false)
    if (zoom === 3.5) await page.screenshot({ path: testInfo.outputPath('nested-labels.png') })
  }
})

test('leaf text grows with zoom and person descriptions fit inside rounded cards', async ({ page, workspace }, testInfo) => {
  await workspace.loadSample()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await canvas.evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    engine.focus('customer')
  })
  await page.waitForTimeout(150)
  await canvas.evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    engine.zoomBy(3.5 / engine.state.camera.zoom)
  })
  await page.waitForTimeout(150)
  const label = await canvas.evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    return engine.state.textLayouts?.get('customer')
  })
  expect(label?.scale).toBeGreaterThan(2)
  expect(label!.lines.join(' ')).toBe('A customer of the bank, with personal bank accounts.')
  await page.screenshot({ path: testInfo.outputPath('explore-person-text.png') })
})

test('drag release glides, new input interrupts, and reduced motion stops immediately', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await expect(canvas).toHaveAttribute('data-camera', /zoom/)
  const readX = () => canvas.evaluate(el => (el as HTMLCanvasElement & { __explore: ExploreController }).__explore.state.camera.x)
  await page.mouse.move(700, 350); await page.mouse.down()
  await page.mouse.move(780, 350, { steps: 5 }); await page.mouse.up()
  const released = await readX()
  await expect.poll(readX).toBeGreaterThan(released + 1)
  await page.mouse.down()
  const interrupted = await readX()
  await page.waitForTimeout(150)
  expect(await readX()).toBeCloseTo(interrupted)
  await page.mouse.up()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(700, 350); await page.mouse.down()
  await page.mouse.move(780, 350, { steps: 5 }); await page.mouse.up()
  const stopped = await readX()
  await page.waitForTimeout(150)
  expect(await readX()).toBeCloseTo(stopped)
})

test('Explore preserves authored state, supports focus through lock and restores Diagram', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.waitForTimeout(500)
  const before = await page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); return { workspace: JSON.stringify(s.workspace), undo: s.undoStack.length, view: s.activeViewKey } })
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style')
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('Workspace architecture', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Browse architecture' }).click()
  await page.getByRole('button', { name: /API Application · container/ }).click()
  await expect(page.getByText('Detail frozen · clear selection to resume', { exact: true })).toBeVisible()
  const reveal = await canvas.getAttribute('data-reveal')
  await canvas.focus(); await page.keyboard.press('+'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800)
  await page.keyboard.down('Space')
  await page.mouse.move(650, 380); await page.mouse.down(); await page.mouse.move(710, 410, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400)
  await page.keyboard.up('Space')
  await expect(page.getByText('Detail frozen · clear selection to resume', { exact: true })).toBeVisible()
  expect(await canvas.getAttribute('data-reveal')).toBe(reveal)
  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Search elements and views' }).fill('Security Component')
  await page.getByRole('button').filter({ hasText: 'Security Component' }).last().click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().selectedElementIds[0])).toBeTruthy()
  await page.waitForTimeout(800)
  const focusedWidth = await canvas.evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const selected = [...engine.state.selected][0]
    return engine.state.layout.byId.get(selected)!.width * engine.state.camera.zoom
  })
  expect(focusedWidth).toBeGreaterThan(120)
  await page.getByRole('button', { name: 'Diagram', exact: true }).click()
  await expect(page.locator('.react-flow')).toBeVisible(); await page.waitForTimeout(400)
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewport)
  const after = await page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); return { workspace: JSON.stringify(s.workspace), undo: s.undoStack.length, view: s.activeViewKey } })
  expect(after).toEqual(before)
})

test('partial reveal freezes on selection; idle completion and Escape never move camera', async ({ page, workspace }, testInfo) => {
  await workspace.loadSample(); await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await page.waitForTimeout(800)
  await page.screenshot({ path: testInfo.outputPath('explore-big-bank-overview.png') })
  // Begin above the reveal threshold, then cross it with actual wheel input.
  // The compact overview intentionally starts with every system closed.
  await canvas.evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const parent = engine.state.layout.roots.find(n => n.children.length)!
    engine.zoomBy(400 / (parent.width * engine.state.camera.zoom))
  })
  await page.waitForTimeout(900)
  // Exercise actual wheel input, select during its transition, then redirect it.
  await page.mouse.move(600, 400); await page.mouse.wheel(0, 300)
  const snapshot = await canvas.evaluate(async el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const state = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
    const deadline = performance.now() + 2500
    while (![...engine.state.reveal.values()].some(v => v > 0 && v < 1)) {
      if (performance.now() > deadline) throw new Error('Wheel navigation never produced a partial reveal')
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    state.selectElements([engine.state.layout.roots[0].id])
    return Object.fromEntries(engine.state.reveal)
  })
  expect(Object.values(snapshot).some(v => v > 0 && v < 1)).toBe(true)
  await page.waitForTimeout(200)
  await page.screenshot({ path: testInfo.outputPath('explore-partial.png') })
  await page.mouse.wheel(0, -160); await page.waitForTimeout(1400)
  expect(await canvas.evaluate(el => Object.fromEntries((el as HTMLCanvasElement & { __explore: ExploreController }).__explore.state.reveal))).toEqual(snapshot)
  const camera = await canvas.getAttribute('data-camera')
  await canvas.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(650)
  expect(await canvas.getAttribute('data-camera')).toBe(camera)
  const values = await canvas.evaluate(el => [...(el as HTMLCanvasElement & { __explore: ExploreController }).__explore.state.reveal.values()])
  expect(values.every(v => v === 0 || v === 1)).toBe(true)
})

test('Northstar portals, keyboard inspection, model reconciliation and screenshots', async ({ page, workspace }, testInfo) => {
  await workspace.parseAndLoad(fixture)
  await page.screenshot({ path: testInfo.outputPath('diagram-before.png') })
  await page.getByRole('button', { name: 'Explore', exact: true }).click(); await page.waitForTimeout(750)
  await page.screenshot({ path: testInfo.outputPath('explore-overview.png') })
  await page.getByRole('button', { name: 'Browse architecture' }).click()
  await page.getByRole('button', { name: 'Storefront · Software system', exact: true }).click(); await expect(page.getByText('Detail frozen · clear selection to resume', { exact: true })).toBeVisible(); await page.waitForTimeout(150)
  await expect.poll(() => page.getByTestId('explore-canvas').evaluate(el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const node = engine.state.layout.byId.get('storefront')!
    const inspector = document.querySelector('[data-canvas-chrome="inspector"]')!.getBoundingClientRect()
    return (node.x + node.width) * engine.state.camera.zoom + engine.state.camera.x <= inspector.left - 10
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('explore-expanded.png') })
  await page.getByText('Cross-system connections', { exact: true }).click()
  const bundles = page.getByRole('button').filter({ hasText: /Storefront → Identity .*Synchronous/ })
  await bundles.first().click()
  await expect(page.getByRole('region', { name: 'Boundary connections' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unpin connections' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('explore-connections.png') })
  await page.getByRole('region', { name: 'Boundary connections' }).getByRole('button').nth(1).click()
  await expect(page.getByText('Cross-system relationship', { exact: true })).toBeVisible()
  await page.getByTestId('explore-canvas').focus(); await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Boundary connections' })).toHaveCount(0)
  await page.evaluate(() => { const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore(); s.selectElements(['storefront']); s.deleteElements(['storefront']) })
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testStore(): WorkspaceState }).__testStore().selectedElementIds.length)).toBe(0)
  await expect(page.getByTestId('explore-canvas')).toBeVisible()
})


test('touch pinch, cancellation, reduced motion, resize and presentation retain Explore', async ({ page, workspace }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await workspace.loadSample(); await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas')
  await expect(canvas).toHaveAttribute('data-camera', /zoom/)
  const client = await page.context().newCDPSession(page)
  const before = JSON.parse((await canvas.getAttribute('data-camera'))!).zoom
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 300, id: 0 }, { x: 600, y: 300, id: 1 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 450, y: 300, id: 0 }, { x: 650, y: 300, id: 1 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-camera'))!).zoom).toBeGreaterThan(before)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 300, id: 0 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.setViewportSize({ width: 1000, height: 800 })
  await canvas.focus(); await page.keyboard.press('0'); await page.keyboard.press('p')
  await expect(canvas).toBeVisible(); await expect(page.locator('.react-flow')).toHaveCount(0)
  await page.keyboard.press('Escape'); await expect(page.getByRole('group', { name: 'Canvas mode' })).toBeVisible()
})

test('50-system / 500-element / 1000-relationship navigation benchmark', async ({ page, workspace, browser }, testInfo) => {
  test.skip(!process.env.EXPLORE_BENCHMARK, 'Run separately with EXPLORE_BENCHMARK=1 to avoid concurrent-suite CPU contention')
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
    s.loadWorkspace(ws)
  })
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  const canvas = page.getByTestId('explore-canvas'); await page.waitForTimeout(1500)
  const traceClient = process.env.EXPLORE_TRACE ? await page.context().newCDPSession(page) : null
  if (traceClient) await traceClient.send('Tracing.start', { categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
  const result = await canvas.evaluate(async el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    engine.frameWork.length = 0
    const longTasks: number[] = [], intervals: number[] = []
    const slowFrames: unknown[] = []
    const frameObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) slowFrames.push(entry.toJSON()) })
    frameObserver.observe({ type: 'long-animation-frame' })
    const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(e.duration) })
    observer.observe({ type: 'longtask' })
    let previous = performance.now()
    for (let i = 0; i < 240; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(now => { intervals.push(now - previous); previous = now; engine.pan(Math.sin(i / 15) * 8, Math.cos(i / 23) * 5); if (i % 8 === 0) engine.zoomBy(i < 120 ? 1.09 : 1 / 1.09); resolve() }))
    }
    await new Promise(resolve => setTimeout(resolve, 300)); observer.disconnect(); frameObserver.disconnect()
    const work = [...engine.frameWork].sort((a, b) => a - b)
    return { systems: engine.state.layout.roots.length, elements: engine.state.layout.nodes.length, relationships: engine.state.connections.length,
      initialLayoutMs: engine.initialLayoutMs, frames: work.length, p95FrameWorkMs: work[Math.floor(work.length * .95)], maxFrameWorkMs: work.at(-1), longTasks, slowFrames,
      medianIntervalMs: intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)], userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }
  })
  if (traceClient) {
    const complete = new Promise<string>(resolve => traceClient.once('Tracing.tracingComplete', data => resolve(data.stream!)))
    await traceClient.send('Tracing.end')
    const stream = await complete; let trace = ''
    for (;;) { const part = await traceClient.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break }
    await traceClient.send('IO.close', { handle: stream })
    writeFileSync(testInfo.outputPath('performance-trace.json'), trace)
    await testInfo.attach('trace.json', { path: testInfo.outputPath('performance-trace.json'), contentType: 'application/json' })
  }
  writeFileSync(testInfo.outputPath('benchmark.json'), JSON.stringify({ ...result, browser: browser.version() }, null, 2))
  await testInfo.attach('benchmark.json', { path: testInfo.outputPath('benchmark.json'), contentType: 'application/json' })
  console.log('EXPLORE_BENCHMARK', JSON.stringify(result))
  expect(result.elements).toBe(500); expect(result.relationships).toBe(1000)
  expect(result.p95FrameWorkMs).toBeLessThanOrEqual(16.7)
  expect(result.longTasks).toEqual([])
})

test('Explore follows Diagram themes live without moving geometry or camera', async ({ page, workspace }, testInfo) => {
  await workspace.loadSample()
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  await page.waitForTimeout(750)
  const result = await page.getByTestId('explore-canvas').evaluate(async el => {
    const engine = (el as HTMLCanvasElement & { __explore: ExploreController }).__explore
    const settingsPath = '/src/store/settings.ts', themesPath = '/src/lib/themes.ts'
    const { useSettingsStore } = await import(/* @vite-ignore */ settingsPath)
    const { THEMES } = await import(/* @vite-ignore */ themesPath)
    const layout = engine.state.layout, camera = JSON.stringify(engine.state.camera)
    const system = layout.roots.find(n => n.element.type === 'softwareSystem')!
    useSettingsStore.getState().update({ colorTheme: 'light' })
    await new Promise(resolve => requestAnimationFrame(resolve))
    return { actual: engine.state.styles.get(system.id)?.background, expected: THEMES.light.find((s: { tag: string }) => s.tag === 'Software System').background,
      sameGeometry: layout === engine.state.layout, sameCamera: camera === JSON.stringify(engine.state.camera) }
  })
  expect(result.actual).toBe(result.expected)
  expect(result.sameGeometry).toBe(true); expect(result.sameCamera).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('explore-light-theme.png') })
})
