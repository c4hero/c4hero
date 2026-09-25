import { test, expect } from '../fixtures/workspace'
import { THEMES } from '../../src/lib/themes'
import type { ColorTheme } from '../../src/store/settings'
import type { WorkspaceState } from '../../src/store/workspace-types'
import type { SemanticCamera } from '../../src/lib/explore/semanticCamera'

test.use({ viewport: { width: 2400, height: 1800 } })

for (const theme of Object.keys(THEMES) as ColorTheme[]) {
  test(`all C4 cards and relationship styles match in ${theme}`, async ({ page, workspace }) => {
    test.setTimeout(90000)
    await workspace.loadSample()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(async theme => {
      const settingsPath = '/src/store/settings.ts'
      const { useSettingsStore } = await import(/* @vite-ignore */ settingsPath)
      useSettingsStore.getState().update({ colorTheme: theme })
      const s = (window as unknown as { __testStore(): WorkspaceState }).__testStore()
      const ws = structuredClone(s.workspace!)
      const system = ws.model.softwareSystems.find(n => n.id === 'internetBanking')!
      const tags = ['', 'Database', 'Web Application', 'Service', 'Queue', 'Mobile App', 'File System']
      system.containers = tags.map((tag, i) => ({ id: `c${i}`, type: 'container', name: `Container ${tag || 'default'}`, description: 'Shared spacing and typography.', technology: 'HTTP, JSON', tags: tag ? [tag] : [], properties: {}, components: [] }))
      const shapes = ['', 'Cylinder', 'Circle', 'Ellipse', 'Hexagon', 'Diamond', 'Person', 'Robot', 'Folder', 'WebBrowser', 'MobileDevicePortrait', 'MobileDeviceLandscape']
      system.containers[0].components = shapes.map((shape, i) => ({ id: `m${i}`, type: 'component', name: `Component ${shape || 'default'}`, description: 'Shared spacing and typography.', technology: 'TypeScript', tags: shape ? [`shape${i}`] : [], properties: {} }))
      ws.views.configuration.styles.elements.push(...shapes.flatMap((shape, i) => shape ? [{ tag: `shape${i}`, shape }] : []))
      ws.views.configuration.styles.relationships = [{ tag: 'Custom', thickness: 3, color: '#a855f7', dashed: true, opacity: .4 }]
      const rootIds = ['customer', 'supportStaff', 'internetBanking', 'email']
      const groups = [rootIds, tags.map((_, i) => `c${i}`), shapes.map((_, i) => `m${i}`)]
      ws.model.relationships = groups.flatMap((ids, group) => ids.slice(1).map((id, i) => ({
        id: `edge${group}-${i}`, sourceId: ids[i], destinationId: id, description: `Relationship ${group}-${i}`, technology: 'HTTPS',
        tags: i % 4 === 3 ? ['Custom'] : [], properties: {},
        interactionStyle: i % 4 === 2 ? 'Asynchronous' as const : 'Synchronous' as const,
        lineStyle: ['Curved', 'Straight', 'Orthogonal'][i % 3] as 'Curved' | 'Straight' | 'Orthogonal',
      })))
      const viewData = (group: number) => ({
        elements: groups[group].map((id, i) => ({ id, x: 150 + (i % 4) * 480, y: 150 + Math.floor(i / 4) * 350 })),
        relationships: ws.model.relationships.filter(r => r.id.startsWith(`edge${group}-`)).map(r => ({ id: r.id })),
      })
      ws.views.systemLandscapeViews = [{ key: 'AllSystems', type: 'systemLandscape', ...viewData(0) }]
      ws.views.systemContextViews = []
      ws.views.containerViews = [{ key: 'AllContainers', type: 'container', softwareSystemId: system.id, ...viewData(1) }]
      ws.views.componentViews = [{ key: 'AllComponents', type: 'component', containerId: 'c0', ...viewData(2) }]
      s.loadWorkspace(ws)
    }, theme)

    for (const view of ['AllSystems', 'AllContainers', 'AllComponents']) {
      await page.evaluate(view => (window as unknown as { __testStore(): WorkspaceState }).__testStore().setActiveView(view), view)
      await page.waitForTimeout(350)
      for (const zoom of [.47, .98, 1.3]) {
        await page.getByRole('button', { name: 'Zoom', exact: true }).click()
        await page.locator('[data-semantic-zoom="true"]').evaluate((el, zoom) => {
          const camera = (el as HTMLElement & { __semantic: SemanticCamera }).__semantic
          camera.zoomBy(zoom / camera.getZoom())
        }, zoom)
        await page.waitForTimeout(100)
        await page.getByRole('button', { name: 'Zoom', exact: true }).click()
        await page.waitForTimeout(100)
        const result = await page.evaluate(async () => {
          const cards = [...document.querySelectorAll('.c4-node')]
          const edges = [...document.querySelectorAll('.react-flow__edge-path')]
          const snapshot = () => ({
            cards: cards.map(card => {
              const elements = [card, ...card.querySelectorAll('.c4-node-name, p, .c4-type-chip, svg, svg path')]
              return elements.map(el => {
                const s = getComputedStyle(el), r = el.getBoundingClientRect()
                return { box: [r.x, r.y, r.width, r.height], color: s.color, background: s.backgroundColor,
                  border: [s.borderWidth, s.borderColor, s.borderStyle, s.borderRadius],
                  font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing],
                  spacing: [s.padding, s.margin, s.gap], path: el.getAttribute('d') }
              })
            }),
            edges: edges.map(el => { const s = getComputedStyle(el); return [el.id, el.getAttribute('d'), s.stroke, s.strokeWidth, s.strokeDasharray, s.opacity] }),
            labels: [...document.querySelectorAll('[data-relationship-label]')].map(el => { const s = getComputedStyle(el); return [el.textContent, s.transform, s.fontSize, s.color, s.opacity] }),
            camera: getComputedStyle(document.querySelector('.react-flow__viewport')!).transform,
          })
          const before = snapshot()
          ;(document.querySelector('button[aria-label="Zoom"]') as HTMLButtonElement).click()
          await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
          return { before, after: snapshot(), sameNodes: cards.every(n => n.isConnected), sameEdges: edges.every(n => n.isConnected), count: edges.length, ids: edges.map(e => e.id).sort(),
            unique: new Set(edges.map(e => e.id)).size, canvases: document.querySelectorAll('.react-flow').length }
        })
        expect(result.after, `${theme}/${view}/${zoom}`).toEqual(result.before)
        expect(result.sameNodes).toBe(true)
        expect(result.sameEdges).toBe(true)
        expect(result.count).toBeGreaterThan(0)
        const expectedIds = await page.evaluate(view => {
          const ws = (window as unknown as { __testStore(): WorkspaceState }).__testStore().workspace!
          return [...ws.views.systemLandscapeViews, ...ws.views.containerViews, ...ws.views.componentViews].find(v => v.key === view)!.relationships.map(r => r.id).sort()
        }, view)
        expect(result.ids).toEqual(expectedIds)
        expect(result.unique).toBe(result.count)
        expect(result.canvases).toBe(1)
        await page.getByRole('button', { name: 'Zoom', exact: true }).click()
      }
    }
  })
}

test('live theme changes keep native card identity, positions and camera', async ({ page, workspace }) => {
  await workspace.loadSample()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  const colors = new Set<string>()
  for (const theme of Object.keys(THEMES) as ColorTheme[]) {
    const result = await page.evaluate(async theme => {
      const card = document.querySelector('.react-flow__node[data-id="internetBanking"] .c4-node')!
      const camera = getComputedStyle(document.querySelector('.react-flow__viewport')!).transform
      const before = card.getBoundingClientRect().toJSON()
      const path = '/src/store/settings.ts'
      const { useSettingsStore } = await import(/* @vite-ignore */ path)
      useSettingsStore.getState().update({ colorTheme: theme })
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      return { same: card === document.querySelector('.react-flow__node[data-id="internetBanking"] .c4-node'),
        before, after: card.getBoundingClientRect().toJSON(), camera, nextCamera: getComputedStyle(document.querySelector('.react-flow__viewport')!).transform,
        background: getComputedStyle(card).backgroundColor }
    }, theme)
    expect(result.same).toBe(true)
    // Fonts and padding may legitimately resize a card when the theme changes.
    expect(result.after.x).toBe(result.before.x)
    expect(result.after.y).toBe(result.before.y)
    expect(result.nextCamera).toBe(result.camera)
    colors.add(result.background)
  }
  expect(colors.size).toBeGreaterThan(1)
})
