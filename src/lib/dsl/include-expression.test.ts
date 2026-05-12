import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'

/**
 * Verifies the Structurizr DSL expression forms for `include`:
 *   - `include element.type==<typename>`
 *   - `include element.parent==<ref>`
 *
 * Both come from the cookbook recipe at
 * https://docs.structurizr.com/dsl/cookbook/container-view-multiple-software-systems/
 *
 * The simpler explicit-id form (`include c1 c2`) is covered by
 * multi-system-container-view.test.ts.
 */

describe('include expression: element.type==X', () => {
  it('expands to every container across all systems', () => {
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
            c2 = container "C2"
          }
          s2 = softwareSystem "S2" {
            c3 = container "C3"
          }
        }
        views {
          container s1 {
            include element.type==container
          }
        }
      }
    `.trim()

    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    const view = workspace.views.containerViews[0]
    const names = view.elements
      .map(e => {
        for (const sys of workspace.model.softwareSystems) {
          for (const c of sys.containers) {
            if (c.id === e.id) return c.name
          }
        }
        return e.id
      })
      .sort()
    expect(names).toEqual(['C1', 'C2', 'C3'])
  })

  it('expands element.type==softwareSystem to every system in the model', () => {
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1"
          s2 = softwareSystem "S2"
          s3 = softwareSystem "S3"
        }
        views {
          systemLandscape "Land" {
            include element.type==softwareSystem
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.systemLandscapeViews[0].elements).toHaveLength(3)
  })

  it('expands element.type==person to every person', () => {
    const dsl = `
      workspace {
        model {
          alice = person "Alice"
          bob = person "Bob"
          s1 = softwareSystem "S1"
        }
        views {
          systemLandscape "Land" {
            include element.type==person
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const view = workspace.views.systemLandscapeViews[0]
    expect(view.elements).toHaveLength(2)
  })
})

describe('include expression: element.parent==X', () => {
  it('expands to every container of the named system', () => {
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
            c2 = container "C2"
          }
          s2 = softwareSystem "S2" {
            c3 = container "C3"
          }
        }
        views {
          container s1 {
            include element.parent==s1
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    const view = workspace.views.containerViews[0]
    const names = view.elements
      .map(e => {
        for (const sys of workspace.model.softwareSystems) {
          for (const c of sys.containers) {
            if (c.id === e.id) return c.name
          }
        }
        return e.id
      })
      .sort()
    // Only S1's containers — c3 (under S2) is excluded because we filtered by parent
    expect(names).toEqual(['C1', 'C2'])
  })

  it('combines multiple element.parent expressions on a single include line', () => {
    // The cookbook recipe explicitly shows: include element.parent==s1 element.parent==s2
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
          }
          s2 = softwareSystem "S2" {
            c2 = container "C2"
          }
        }
        views {
          container s1 {
            include element.parent==s1 element.parent==s2
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    const view = workspace.views.containerViews[0]
    expect(view.elements).toHaveLength(2)
  })
})

describe('include expression: round-trip', () => {
  it('the SERIALIZED output uses explicit refs, not the expression form', () => {
    // Expressions are parse-time syntactic sugar — we resolve them eagerly
    // into the view's elements list, so serialization emits the resolved IDs.
    // Round-tripping is lossless on the resulting element set even though the
    // textual DSL changes shape.
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
            c2 = container "C2"
          }
        }
        views {
          container s1 {
            include element.type==container
          }
        }
      }
    `.trim()
    const first = parseDSL(dsl)
    const dsl2 = serializeDSL(first.workspace)
    const second = parseDSL(dsl2)
    expect(second.errors).toEqual([])
    // Both containers survive the round trip via the explicit-id form
    expect(second.workspace.views.containerViews[0].elements).toHaveLength(2)
  })
})

describe('include expression: degenerate inputs', () => {
  it('unknown type name silently expands to zero elements (no parse error)', () => {
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1"
        }
        views {
          systemLandscape "Land" {
            include element.type==notARealType
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.systemLandscapeViews[0].elements).toEqual([])
  })

  it('unknown parent ref silently expands to zero elements', () => {
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
          }
        }
        views {
          container s1 {
            include element.parent==doesNotExist
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.containerViews[0].elements).toEqual([])
  })

  it('preserves the explicit-id path when an arg is not an expression', () => {
    // Mixed include: one explicit ref + one expression on the same line
    const dsl = `
      workspace {
        model {
          s1 = softwareSystem "S1" {
            c1 = container "C1"
            c2 = container "C2"
          }
        }
        views {
          container s1 {
            include c1 element.parent==s1
          }
        }
      }
    `.trim()
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    // c1 added explicitly, then expanded by expression — c1 may appear twice
    // (we don't dedup; serializer/render layers tolerate duplicates).
    const ids = workspace.views.containerViews[0].elements.map(e => e.id)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    // Both c1 and c2's IDs must be present at least once each
    const c1 = workspace.model.softwareSystems[0].containers.find(c => c.name === 'C1')!
    const c2 = workspace.model.softwareSystems[0].containers.find(c => c.name === 'C2')!
    expect(ids).toContain(c1.id)
    expect(ids).toContain(c2.id)
  })
})
