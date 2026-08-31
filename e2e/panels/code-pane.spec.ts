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
})
