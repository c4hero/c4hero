import { test, expect } from '../fixtures/workspace'

// Cards are sized to their content (200 to 280 wide). A view's first layout
// must space them by their measured sizes, not the default, or long names leave
// neighbouring cards touching, and Zoom inherits the crowding. Opening a view
// for the first time with Zoom on is the case that got this wrong: Zoom draws
// its own cards, so the view's own were never measured.
const names = ['Gateway', 'Auth', 'Billing', 'Catalog', 'Search', 'Orders', 'Inventory', 'Pricing', 'Reports', 'Notify', 'Audit', 'Profile', 'Media', 'Sync', 'Export', 'Import', 'Scheduler', 'Ledger', 'Quotes', 'Rules', 'Cache', 'Queue', 'Webhooks', 'Admin', 'Metrics', 'Tenant', 'Files']
const dsl = `workspace "Wide cards" {
 model {
  user = person "Learner"
  mail = softwareSystem "Email Provider" "Sends email" "External"
  lake = softwareSystem "Data Lake"
  s = softwareSystem "Platform" {
${names.map((n, i) => `   c${i} = container "${n} Orchestration Service" "Handles ${n.toLowerCase()}" "Kotlin"`).join('\n')}
  }
${names.slice(1).map((_, i) => `  c${Math.floor(i / 3)} -> c${i + 1} "Calls"`).join('\n')}
  user -> c0 "Uses"
  c3 -> mail "Sends"
  c7 -> lake "Reads"
 }
 views {
  systemLandscape "Overview" { include * }
  container s "Containers" { include *
 autoLayout tb }
 }
}`

test('a view first opened in Zoom is laid out by its measured card sizes', async ({ page, workspace }) => {
  await workspace.parseAndLoad(dsl)
  await workspace.setView('Overview')
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await workspace.setView('Containers')
  await page.waitForTimeout(500)
  const saved = async () => (await workspace.getWorkspace())!.views.containerViews[0].elements.filter(e => (e as { x?: number }).x !== undefined).length
  // Nothing is saved for a view while Zoom draws it.
  expect(await saved()).toBe(0)
  await page.getByRole('button', { name: 'Zoom', exact: true }).click()
  await expect.poll(saved).toBe(names.length + 3)
  const result = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].filter(n => /^c\d+$/.test(n.dataset.id ?? ''))
    const cards = nodes.map(n => n.getBoundingClientRect())
    let overlaps = 0
    for (const a of cards) for (const b of cards) if (a !== b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++
    return { cards: cards.length, overlaps: overlaps / 2, narrowest: Math.min(...nodes.map(n => n.offsetWidth)) }
  })
  expect(result.cards).toBe(names.length)
  // The names make every card wider than the 200 default.
  expect(result.narrowest).toBeGreaterThan(220)
  expect(result.overlaps).toBe(0)
})
