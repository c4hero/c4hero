import { test, expect } from '../fixtures/workspace'

/** Both new view types in one workspace: a deployment environment with a
 *  nested single-child chain (the boundary-containment regression shape) and
 *  a dynamic view with a repeated step and a response step. */
const DSL = `workspace "Complete" {
  model {
    user = person "User"
    shop = softwareSystem "Web Shop" {
      spa = container "Storefront SPA"
      api = container "Shop API"
      db = container "Shop DB"
      spa -> api "Submits order"
      api -> db "Persists order"
    }
    user -> spa "Uses"

    deploymentEnvironment "Live" {
      deploymentNode "AWS" "" "Amazon Web Services" {
        deploymentNode "eu-west-1" "" "AWS region" {
          lb = infrastructureNode "Load Balancer" "Routes" "ELB"
          deploymentNode "App Server" "" "Ubuntu" "" 3 {
            liveApi = containerInstance api
          }
          deploymentNode "DB Server" "" "Ubuntu" {
            liveDb = containerInstance db
          }
        }
      }
      lb -> liveApi "Forwards to"
    }
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout tb
    }
    deployment * "Live" "LiveAll" {
      include *
      autolayout lr
    }
    dynamic shop "Checkout" {
      spa -> api "Submits order"
      api -> db "Persists order"
      api -> spa "Returns confirmation"
      spa -> api "Retries on timeout"
      autolayout lr
    }
  }
}`

test.describe('Deployment views', () => {
  test('renders instances inside nested deployment-node boundaries', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)

    const views = await workspace.getViews()
    const deployment = views.find((v) => v.key === 'LiveAll')
    expect(deployment).toBeTruthy()
    await workspace.setView('LiveAll')

    // Content nodes: the two container instances + the infrastructure node,
    // identified by their deployment-element ids.
    for (const id of ['liveApi', 'liveDb', 'lb']) {
      await expect(workspace.page.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible()
    }

    // Nested boundaries: AWS wraps eu-west-1 wraps the servers. Boundary ids
    // are __scope_boundary__<deploymentNodeId>; resolve ids from the store.
    const boundaryBoxes = await workspace.page.evaluate(() => {
      const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const el of document.querySelectorAll('.react-flow__node')) {
        const id = el.getAttribute('data-id') ?? ''
        if (!id.startsWith('__scope_boundary__')) continue
        const r = (el as HTMLElement).getBoundingClientRect()
        boxes[id] = { x: r.x, y: r.y, w: r.width, h: r.height }
      }
      return boxes
    })
    const rects = Object.values(boundaryBoxes)
    // AWS, eu-west-1, App Server, DB Server → four boundaries.
    expect(rects.length).toBe(4)

    // Containment: some boundary (AWS) must strictly contain another
    // (eu-west-1). With the inverted-padding bug the inner box stuck out.
    const contains = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
      b.x > a.x && b.y > a.y && b.x + b.w < a.x + a.w && b.y + b.h < a.y + a.h
    const nestedPairs = rects.filter((outer) => rects.some((inner) => inner !== outer && contains(outer, inner)))
    expect(nestedPairs.length).toBeGreaterThanOrEqual(2)

    // The instance count from the positional argument surfaces in the sublabel.
    await expect(workspace.page.getByText('Ubuntu · ×3')).toBeVisible()

    // Edges: the explicit lb edge plus the derived api -> db instance edge.
    const edgeCount = await workspace.page.locator('.react-flow__edge').count()
    expect(edgeCount).toBeGreaterThanOrEqual(2)
  })
})

test.describe('Dynamic views', () => {
  test('numbers every step, including repeats and the response', async ({ workspace }) => {
    await workspace.parseAndLoad(DSL)
    await workspace.setView('Checkout')

    // All three participating containers render.
    for (const name of ['Storefront SPA', 'Shop API', 'Shop DB']) {
      await expect(workspace.page.getByText(name, { exact: true })).toBeVisible()
    }

    // Four steps -> four edges with order badges 1..4, even though steps 1
    // and 4 repeat the same model relationship.
    await expect(workspace.page.locator('.react-flow__edge')).toHaveCount(4)
    for (const order of ['1', '2', '3', '4']) {
      await expect(workspace.page.getByLabel(`Step ${order}`)).toBeVisible()
    }

    // Step descriptions override the relationship's own on the edge label.
    await expect(workspace.page.getByText('Returns confirmation')).toBeVisible()
    await expect(workspace.page.getByText('Retries on timeout')).toBeVisible()
  })
})
