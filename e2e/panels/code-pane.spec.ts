import { test, expect } from '../fixtures/workspace'

const DSL = `workspace "CodePane" {
  model {
    u = person "User"
    sys = softwareSystem "Sys"
    u -> sys "Uses"
  }
  views {
    systemLandscape "Land" {
      include *
    }
  }
}`

// Typed flush-left so CodeMirror's indent-preserving Enter doesn't drift lines.
const REPLACEMENT_LINES = [
  'workspace "CodePane" {',
  'model {',
  'u = person "User"',
  'sys = softwareSystem "Sys"',
  'pay = softwareSystem "Payments"',
  'u -> sys "Uses"',
  '}',
  'views {',
  'systemLandscape "Land" {',
  'include *',
  '}',
  '}',
  '}',
]

test.describe('DSL code pane', () => {
  test('edits round-trip between the code pane and the canvas', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(DSL)

    // Open via the tool rail; the editor shows the serialized workspace.
    await page.getByRole('button', { name: 'Show DSL code pane' }).click()
    const editor = page.locator('[data-code-pane-editor] .cm-content')
    await expect(editor).toBeVisible()
    await expect(editor).toContainText('softwareSystem')

    // Replace the whole document with a version that adds a system.
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    for (const [i, line] of REPLACEMENT_LINES.entries()) {
      if (i > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(line)
    }

    // The debounced apply lands and the canvas gains the node.
    await expect(await workspace.getNodeByName('Payments')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-code-pane-errors]')).toBeHidden()

    // Break the document — errors surface, canvas stays on the last good state.
    // (`person` without a name is a real parse error; many truncated documents
    // parse "cleanly" to an empty model and are rejected by the empty-model
    // guard instead, which also keeps the badge visible.)
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('workspace "Broken" { model { u = person } }')
    await expect(page.locator('[data-code-pane-errors]')).toBeVisible({ timeout: 5000 })
    await expect(await workspace.getNodeByName('Payments')).toBeVisible()

    // One undo step (on the canvas) reverts the whole text apply.
    await workspace.clickCanvas()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(await workspace.getNodeByName('Payments')).toBeHidden()
    await expect(await workspace.getNodeByName('Sys')).toBeVisible()

    // mod+e closes the pane again.
    await page.keyboard.press('ControlOrMeta+e')
    await expect(editor).toBeHidden()
  })

  test('behaves as a movable, resizable window with min/max and editor undo', async ({ workspace }) => {
    const page = workspace.page
    await workspace.parseAndLoad(DSL)
    await page.getByRole('button', { name: 'Show DSL code pane' }).click()

    const pane = page.locator('[data-canvas-chrome="code-pane"]')
    const header = page.locator('[data-code-pane-header]')
    const editor = page.locator('[data-code-pane-editor] .cm-content')
    await expect(editor).toBeVisible()

    // Drag the header — the window moves. Small vertical delta so the
    // bottom-right resize corner stays inside the viewport for the next step.
    const before = (await pane.boundingBox())!
    await header.hover({ position: { x: 40, y: 12 } })
    await page.mouse.down()
    await page.mouse.move(before.x + 40 - 120, before.y + 12 + 20, { steps: 5 })
    await page.mouse.up()
    const moved = (await pane.boundingBox())!
    expect(Math.round(moved.x)).toBeLessThan(Math.round(before.x))
    expect(Math.round(moved.y)).toBeGreaterThan(Math.round(before.y))

    // Resize from the left edge (the bottom corners can sit under the
    // bottom highlighter bar's higher z-index, which would eat the grab).
    await page.mouse.move(moved.x + 3, moved.y + moved.height / 2)
    await page.mouse.down()
    await page.mouse.move(moved.x - 60, moved.y + moved.height / 2, { steps: 4 })
    await page.mouse.up()
    const resized = (await pane.boundingBox())!
    expect(resized.width).toBeGreaterThan(moved.width + 30)

    // Minimize collapses to the header; restore brings the editor back.
    await page.getByRole('button', { name: 'Minimize DSL pane' }).click()
    await expect(editor).toBeHidden()
    await page.getByRole('button', { name: 'Restore DSL pane' }).click()
    await expect(editor).toBeVisible()

    // Maximize fills (almost) the viewport; restore returns to the old size.
    await page.getByRole('button', { name: 'Maximize DSL pane' }).click()
    const maxed = (await pane.boundingBox())!
    const viewport = page.viewportSize()!
    expect(maxed.width).toBeGreaterThan(viewport.width - 40)
    await page.getByRole('button', { name: 'Restore DSL pane size' }).click()
    const restored = (await pane.boundingBox())!
    expect(Math.abs(restored.width - resized.width)).toBeLessThan(4)

    // Header undo/redo drive the editor's own history.
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' // scratch')
    await expect(editor).toContainText('// scratch')
    await page.getByRole('button', { name: 'Undo DSL edit' }).click()
    await expect(editor).not.toContainText('// scratch')
    await page.getByRole('button', { name: 'Redo DSL edit' }).click()
    await expect(editor).toContainText('// scratch')

    // In-editor search: header button opens the find panel and highlights hits;
    // mod+f inside the editor goes to the find panel, not app search.
    await page.getByRole('button', { name: 'Find in DSL' }).click()
    const searchPanel = page.locator('.cm-panel.cm-search')
    await expect(searchPanel).toBeVisible()
    await searchPanel.locator('input[name="search"]').pressSequentially('softwareSystem')
    await expect(page.locator('.cm-searchMatch').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(searchPanel).toBeHidden()
    await editor.click()
    await page.keyboard.press('ControlOrMeta+f')
    await expect(searchPanel).toBeVisible()
    await expect(page.getByLabel('Search elements and views')).toBeHidden()
  })
})
