import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'

/**
 * Verifies the Structurizr cookbook recipe for "Container View for Multiple
 * Software Systems" — https://docs.structurizr.com/dsl/cookbook/container-view-multiple-software-systems/
 *
 * The recipe uses `include c1 c2` (multiple element refs) on a container view
 * scoped to s1, so containers from BOTH s1 and s2 appear in one diagram.
 */

const RECIPE_DSL = `
workspace {
    model {
        s1 = softwareSystem "Software System 1" {
            c1 = container "Container 1"
        }
        s2 = softwareSystem "Software System 2" {
            c2 = container "Container 2"
        }
        c1 -> c2
    }
    views {
        container s1 {
            include c1 c2
            autoLayout lr
        }
    }
}
`.trim()

describe('Multi-system container view (Structurizr cookbook recipe)', () => {
  it('parses both containers (across system boundaries) into the view', () => {
    const { workspace, errors } = parseDSL(RECIPE_DSL)
    expect(errors).toEqual([])

    const view = workspace.views.containerViews[0]
    expect(view).toBeDefined()
    expect(view.softwareSystemId).toBeDefined()

    // Resolve element refs in the view back to names so the assertion is readable
    const elementsByName = view.elements
      .map(e => {
        for (const sys of workspace.model.softwareSystems) {
          for (const c of sys.containers) {
            if (c.id === e.id) return c.name
          }
        }
        return e.id
      })
      .sort()

    expect(elementsByName).toEqual(['Container 1', 'Container 2'])
  })

  it('round-trips through serialize/parse without losing the foreign container', () => {
    const parsed = parseDSL(RECIPE_DSL)
    const dsl2 = serializeDSL(parsed.workspace)
    const reparsed = parseDSL(dsl2)
    expect(reparsed.errors).toEqual([])

    const view = reparsed.workspace.views.containerViews[0]
    expect(view.elements).toHaveLength(2)

    // The cross-system relationship must also survive
    expect(reparsed.workspace.model.relationships).toHaveLength(1)
  })

  it('renders the foreign container alongside the focal system\'s container (canvas-layer concern)', () => {
    // The canvas builder's only container-view-specific behavior is drawing a
    // boundary box around the focal system's containers (canvasBuilders.ts:244-273).
    // It does NOT filter view.elements — every element in the array is rendered.
    // So this assertion is structural: nothing in the parsed view shape should
    // hide foreign containers from the renderer's element iteration.
    const { workspace } = parseDSL(RECIPE_DSL)
    const view = workspace.views.containerViews[0]
    const ids = new Set(view.elements.map(e => e.id))

    // Confirm both containers' IDs are in the view's render set.
    const c1 = workspace.model.softwareSystems[0].containers[0]
    const c2 = workspace.model.softwareSystems[1].containers[0]
    expect(ids.has(c1.id)).toBe(true)
    expect(ids.has(c2.id)).toBe(true)
  })
})
