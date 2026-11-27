import { test, expect } from '../fixtures/workspace'

/** TEA-381: the logo catalog is a lazily loaded chunk. A node must not change
 *  size when it arrives, or anything measured before (a pending connection,
 *  auto-arrange) lands in the wrong place. */
const DSL = `workspace "Logos" {
  model {
    shop = softwareSystem "Web Shop" {
      api = container "Shop API" "Serves orders" "Kotlin, Micronaut"
      db = container "Shop DB" "Stores orders" "PostgreSQL"
      api -> db "Reads"
    }
  }
  views {
    container shop "Containers" {
      include *
      autolayout lr
    }
  }
}`

test('a node keeps its size while its logo loads', async ({ workspace, page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route(/techIcons\/catalog|\/catalog-[\w-]+\.js/, async (route) => {
    await held
    await route.continue()
  })
  await workspace.parseAndLoad(DSL)
  const card = page.locator('.react-flow__node[data-id="api"] .c4-node')
  // Before the catalog: a placeholder tile holding the type glyph.
  await expect(card.locator('.c4-node-tech-icon-pending')).toHaveCount(1)
  // Layout size, not the on-screen box: the viewport may refit meanwhile.
  const size = () => card.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }))
  const before = await size()

  release()
  await expect(card.locator('.c4-node-tech-icon[data-tech-icon="kotlin"]')).toHaveCount(1)
  expect(await size()).toEqual(before)
})
