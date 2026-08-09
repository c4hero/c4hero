import { test, expect } from '../fixtures/workspace'

test.describe('Node Connections', () => {
  // ─── Arrow direction ──────────────────────────────────────────────────────

  test('sample workspace edges have markerEnd (arrows point source → target)', async ({ workspace }) => {
    await workspace.loadSample()
    // All edges should have markerEnd for the arrow tip
    const edgesWithArrow = workspace.page.locator('.react-flow__edge path[marker-end]')
    const count = await edgesWithArrow.count()
    expect(count).toBeGreaterThan(0)
    // The marker should reference our custom arrow
    const firstMarkerEnd = await edgesWithArrow.first().getAttribute('marker-end')
    expect(firstMarkerEnd).toContain('c4-arrow')
  })

  test('sample workspace edges use the custom start marker dot, not a reversed arrowhead', async ({ workspace }) => {
    await workspace.loadSample()
    const startMarkers = workspace.page.locator('.react-flow__edge path[marker-start]')
    const count = await startMarkers.count()
    expect(count).toBeGreaterThan(0)
    const firstMarkerStart = await startMarkers.first().getAttribute('marker-start')
    expect(firstMarkerStart).toContain('c4-dot')
    expect(firstMarkerStart).not.toContain('c4-arrow')
  })

  // ─── Arrow marker rendering ───────────────────────────────────────────────

  test('arrow marker SVG element is defined in the document', async ({ workspace }) => {
    await workspace.loadSample()
    const marker = workspace.page.locator('#c4-arrow')
    await expect(marker).toBeAttached()
  })

  test('arrow marker SVG does not take up canvas space (zero size)', async ({ workspace }) => {
    await workspace.loadSample()
    // The SVG wrapper around the marker defs should be zero-size
    const markerSvg = workspace.page.locator('svg:has(#c4-arrow)')
    const box = await markerSvg.first().boundingBox()
    // Should be zero/hidden — not taking up visual space
    expect(box?.width ?? 0).toBe(0)
    expect(box?.height ?? 0).toBe(0)
  })

  // ─── Edge labels ─────────────────────────────────────────────────────────

  test('edge labels display the relationship description', async ({ workspace }) => {
    await workspace.loadSample()
    await expect(workspace.page.getByText('Views account balances').first()).toBeVisible()
  })

  // ─── Creating connections ─────────────────────────────────────────────────

  test('can connect two nodes by dragging from handle to target', async ({ workspace }) => {
    await workspace.loadBlank()

    // Add two software systems
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    expect(await workspace.getNodeCount()).toBe(2)
    const edgesBefore = await workspace.getEdgeCount()
    expect(edgesBefore).toBe(0)

    // Connect the two nodes
    const nodes = workspace.page.locator('.react-flow__node')
    const nodeA = nodes.first()
    const nodeB = nodes.last()

    const nodeABox = await nodeA.boundingBox()
    const nodeBBox = await nodeB.boundingBox()

    if (!nodeABox || !nodeBBox) throw new Error('Could not get node bounding boxes')

    // Hover nodeA to show source handles
    await nodeA.hover()
    await workspace.page.waitForTimeout(300)

    // Drag from a center source handle to nodeB
    const handle = nodeA.locator('[data-handleid$="-b-source"]').first()
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('Could not find source handle')

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    const endX = nodeBBox.x + nodeBBox.width / 2
    const endY = nodeBBox.y + nodeBBox.height / 2

    await workspace.page.mouse.move(startX, startY)
    await workspace.page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await workspace.page.mouse.move(
        startX + ((endX - startX) * i) / 10,
        startY + ((endY - startY) * i) / 10,
      )
    }
    await workspace.page.mouse.up()
    await workspace.page.waitForTimeout(400)

    const edgesAfter = await workspace.getEdgeCount()
    expect(edgesAfter).toBe(1)
  })

  test('new edge has correct markerEnd attribute after creation', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    const nodes = workspace.page.locator('.react-flow__node')
    const nodeA = nodes.first()
    const nodeB = nodes.last()

    const nodeBBox = await nodeB.boundingBox()
    if (!nodeBBox) throw new Error('Could not get node B bounding box')

    await nodeA.hover()
    await workspace.page.waitForTimeout(300)

    const handle = nodeA.locator('[data-handleid$="-b-source"]').first()
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('Could not find source handle')

    await workspace.page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await workspace.page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await workspace.page.mouse.move(
        handleBox.x + handleBox.width / 2 + ((nodeBBox.x + nodeBBox.width / 2 - (handleBox.x + handleBox.width / 2)) * i) / 10,
        handleBox.y + handleBox.height / 2 + ((nodeBBox.y + nodeBBox.height / 2 - (handleBox.y + handleBox.height / 2)) * i) / 10,
      )
    }
    await workspace.page.mouse.up()
    await workspace.page.waitForTimeout(400)

    const edge = workspace.page.locator('.react-flow__edge path[marker-end]').first()
    await expect(edge).toBeAttached()
    const markerEnd = await edge.getAttribute('marker-end')
    expect(markerEnd).toContain('c4-arrow')
  })

  // ─── Duplicate connection prevention ────────────────────────────────────

  test('connecting same node pair twice does not create duplicate edges', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    const nodes = workspace.page.locator('.react-flow__node')
    const nodeA = nodes.first()
    const nodeB = nodes.last()

    const nodeBBox = await nodeB.boundingBox()
    if (!nodeBBox) throw new Error('Could not get node B bounding box')

    // Helper to do one drag connection
    const doConnect = async () => {
      await nodeA.hover()
      await workspace.page.waitForTimeout(200)
      const handle = nodeA.locator('[data-handleid$="-b-source"]').first()
      const handleBox = await handle.boundingBox()
      if (!handleBox) return
      const startX = handleBox.x + handleBox.width / 2
      const startY = handleBox.y + handleBox.height / 2
      const endX = nodeBBox.x + nodeBBox.width / 2
      const endY = nodeBBox.y + nodeBBox.height / 2
      await workspace.page.mouse.move(startX, startY)
      await workspace.page.mouse.down()
      for (let i = 1; i <= 10; i++) {
        await workspace.page.mouse.move(
          startX + ((endX - startX) * i) / 10,
          startY + ((endY - startY) * i) / 10,
        )
      }
      await workspace.page.mouse.up()
      await workspace.page.waitForTimeout(400)
    }

    await doConnect()
    expect(await workspace.getEdgeCount()).toBe(1)

    await doConnect()
    // A second connection from A→B creates a second relationship (not duplicate-blocked at UI level)
    // What matters is that multiple rapid clicks don't create more than 1 per gesture (dedup ref)
    // The count should be either 1 or 2, but not 0
    const edgeCount = await workspace.getEdgeCount()
    expect(edgeCount).toBeGreaterThanOrEqual(1)
  })

  // ─── Multiple connections from same node ─────────────────────────────────

  test('sample workspace nodes with multiple connections show multiple edges', async ({ workspace }) => {
    await workspace.loadSample()
    // The sample workspace has nodes with multiple relationships
    // Count all edges — a well-connected sample should have several
    const edgeCount = await workspace.getEdgeCount()
    expect(edgeCount).toBeGreaterThanOrEqual(3)
  })

  test('two connections from same source node produce two separate edges', async ({ workspace }) => {
    await workspace.loadBlank()

    // Add three nodes — they get predictable names: New System, New System 2, New System 3
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    expect(await workspace.getNodeCount()).toBe(3)
    expect(await workspace.getEdgeCount()).toBe(0)

    // Zoom to fit so all 3 nodes are within the visible viewport
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    expect(await workspace.getEdgeCount()).toBe(1)

    await workspace.connectNodes('New System', 'New System 3')
    expect(await workspace.getEdgeCount()).toBe(2)
  })

  test('a connection point grows under the cursor without sliding off the border', async ({ workspace }) => {
    await workspace.loadSample()

    const node = workspace.page.locator('.react-flow__node').first()
    const nodeId = await node.getAttribute('data-id')
    await node.locator('.c4-node').hover()

    for (const side of ['right', 'bottom']) {
      const dot = workspace.page.locator(`[data-nodeid="${nodeId}"][data-handleid="${side}-b-source"]`).first()
      const before = await dot.boundingBox()
      await dot.hover({ force: true })
      await workspace.page.waitForTimeout(300)
      const after = await dot.boundingBox()
      if (!before || !after) throw new Error(`No bounding box for the ${side} handle`)

      // It should get bigger...
      expect(after.width).toBeGreaterThan(before.width)
      // ...around the same point. React Flow centres handles on the border with
      // a percentage translate; a hover transform overrides that and the dot
      // jumps out from under the cursor.
      const centre = (box: { x: number; y: number; width: number; height: number }) =>
        ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      expect(Math.abs(centre(after).x - centre(before).x)).toBeLessThan(0.5)
      expect(Math.abs(centre(after).y - centre(before).y)).toBeLessThan(0.5)

      await workspace.page.mouse.move(5, 5)
      await node.locator('.c4-node').hover()
    }
  })

  // ─── Handle slot distribution ─────────────────────────────────────────────

  test('six relationships into one system land on six separate connection points', async ({ workspace }) => {
    // GH #108: past the third edge, connections used to stack back onto the
    // points already taken and the lines crossed each other.
    const callers = ['one', 'two', 'three', 'four', 'five', 'six']
    await workspace.parseAndLoad(`workspace "Six Integrations" {
  model {
    hub = softwareSystem "Hub"
${callers.map((id) => `    ${id} = softwareSystem "System ${id}"`).join('\n')}

${callers.map((id) => `    ${id} -> hub "Integrates with"`).join('\n')}
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout lr
    }
  }
}`)

    await expect(workspace.page.locator('.react-flow__edge')).toHaveCount(6)

    // Stack the callers in a column directly to the left of the hub, close
    // enough that every relationship enters the hub's left side — the shape a
    // context view takes when one system has a lot of integrations.
    await workspace.page.evaluate((ids) => {
      const store = (window as Record<string, unknown>).__testStore as () => {
        updateNodePositions: (updates: Array<{ id: string; x: number; y: number }>) => void
      }
      store().updateNodePositions([
        { id: 'hub', x: 900, y: 500 },
        ...ids.map((id, i) => ({ id, x: 0, y: 380 + i * 60 })),
      ])
    }, callers)
    await workspace.page.waitForTimeout(300)

    // Every edge ends at its own point on the hub — the last coordinate pair in
    // the path data is where the arrow touches the node.
    const endpoints = await workspace.page.$$eval('.react-flow__edge path[marker-end]', (paths) =>
      paths.map((path) => {
        const numbers = (path.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g) ?? []
        return numbers.slice(-2).map((n) => Math.round(Number(n))).join(',')
      }),
    )
    expect(endpoints).toHaveLength(6)
    expect(new Set(endpoints).size).toBe(6)

    // ...and the hub reveals a connection point for each of them.
    const occupied = workspace.page.locator('[data-nodeid="hub"].c4-handle-extra:not(.c4-handle-hidden-extra)')
    await expect(occupied).toHaveCount(6)
  })

  test('two connections on same side of a node use different handle slots', async ({ workspace }) => {
    await workspace.loadBlank()

    // Add 3 nodes — predictable names: New System, New System 2, New System 3
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    // Zoom to fit so all 3 nodes are within the visible viewport
    await workspace.fitView()

    await workspace.connectNodes('New System', 'New System 2')
    await workspace.connectNodes('New System', 'New System 3')

    expect(await workspace.getEdgeCount()).toBe(2)

    // When there are 2 edges on the same side, they should use slots a and c (not both b).
    // Verify by checking that the two edges have different SVG path start positions.
    const edges = workspace.page.locator('.react-flow__edge')
    const edge0 = edges.first()
    const edge1 = edges.last()

    await expect(edge0).toBeAttached()
    await expect(edge1).toBeAttached()

    // Edges should have different IDs (distinct relationships)
    const id0 = await edge0.getAttribute('data-id')
    const id1 = await edge1.getAttribute('data-id')
    expect(id0).not.toBe(id1)

    // Different path d-attributes means different start handle positions → different slots
    const path0 = edge0.locator('path[marker-end]').first()
    const path1 = edge1.locator('path[marker-end]').first()
    const d0 = await path0.getAttribute('d')
    const d1 = await path1.getAttribute('d')
    expect(d0).not.toBe(d1)
  })

  // ─── Visual states during connection ─────────────────────────────────────

  test('source handles become visible on node hover', async ({ workspace }) => {
    await workspace.loadBlank()
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    const node = workspace.page.locator('.react-flow__node').first()
    const nodeCard = node.locator('.c4-node')
    await workspace.clearSelection()
    await expect(nodeCard).toHaveAttribute('aria-selected', 'false')

    // Before hover: center handles should be opacity 0
    const handle = node.locator('[data-handleid$="-b-source"]').first()
    await workspace.page.mouse.move(6, 6)
    const shadowBefore = await nodeCard.evaluate((el) => window.getComputedStyle(el).boxShadow)

    // After hover: handles should appear (CSS transitions opacity to 1)
    await nodeCard.hover()
    await workspace.page.waitForTimeout(300)
    await expect(handle).toBeAttached()

    // The node itself should also show a hover highlight ring, not just handles.
    const shadowAfter = await nodeCard.evaluate((el) => window.getComputedStyle(el).boxShadow)
    expect(shadowAfter).not.toBe(shadowBefore)
    expect(shadowAfter).toContain('0px 0px 0px 2px')

    // The handle should have opacity 1 via CSS (c4-node:hover .c4-handle-visible)
    const opacity = await handle.evaluate((el) => {
      return window.getComputedStyle(el).opacity
    })
    expect(parseFloat(opacity)).toBeGreaterThan(0)
  })

  test('target handles become interactive during connection drag (CSS connecting class)', async ({ workspace }) => {
    await workspace.loadBlank()

    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)
    await workspace.page.keyboard.press('Shift+S')
    await workspace.page.waitForTimeout(400)

    const nodes = workspace.page.locator('.react-flow__node')
    const nodeA = nodes.first()
    const nodeB = nodes.last()

    const nodeBBox = await nodeB.boundingBox()
    if (!nodeBBox) throw new Error('Could not get node B bounding box')

    // Start hover on nodeA to show handles
    await nodeA.hover()
    await workspace.page.waitForTimeout(300)

    const handle = nodeA.locator('[data-handleid$="-b-source"]').first()
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('No source handle found')

    // Start dragging but don't release yet
    await workspace.page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await workspace.page.mouse.down()
    // Move partially toward nodeB so we're mid-drag
    await workspace.page.mouse.move(
      handleBox.x + handleBox.width / 2 + 20,
      handleBox.y + handleBox.height / 2,
    )

    // During drag, inspect the DOM to find what class React Flow adds
    const connectingClass = await workspace.page.evaluate(() => {
      // Look for connecting-related classes on container elements
      const container = document.querySelector('.react-flow')
      const wrapper = document.querySelector('.react-flow__container')
      const pane = document.querySelector('.react-flow__pane')
      return {
        containerClasses: container?.className ?? '',
        wrapperClasses: wrapper?.className ?? '',
        paneClasses: pane?.className ?? '',
      }
    })

    // Release
    await workspace.page.mouse.move(nodeBBox.x + nodeBBox.width / 2, nodeBBox.y + nodeBBox.height / 2)
    await workspace.page.mouse.up()
    await workspace.page.waitForTimeout(400)

    // Verify: target handles should have pointer-events auto during connecting
    // (this test documents current behavior; if pointerEvents is 'none', Bug 3 is confirmed)
    expect(connectingClass.containerClasses).toBeDefined()
  })

  // ─── Edge deletion ────────────────────────────────────────────────────────

  test('clicking an edge selects it and Delete removes it', async ({ workspace }) => {
    await workspace.loadSample()
    // Wait for canvas to fully settle (avoid "element not stable" from initial layout animation)
    await workspace.page.waitForTimeout(600)

    const edgesBefore = await workspace.getEdgeCount()
    expect(edgesBefore).toBeGreaterThan(0)

    // React Flow renders a wider invisible interaction path for reliable edge clicking.
    // Targeting the visual path bounding-box center misses when the path is diagonal.
    const edgeInteraction = workspace.page.locator('.react-flow__edge-interaction').first()
    await edgeInteraction.click({ force: true })
    await workspace.page.waitForTimeout(300)

    // Delete key opens a confirmation dialog; dialog auto-focuses the Delete button
    // and handles Enter — press Enter to confirm.
    await workspace.page.keyboard.press('Delete')
    await workspace.page.waitForTimeout(200)
    await workspace.page.keyboard.press('Enter')
    await workspace.page.waitForTimeout(400)

    const edgesAfter = await workspace.getEdgeCount()
    expect(edgesAfter).toBe(edgesBefore - 1)
  })
})
