import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagramStyleIndex, buildStyleIndex, getElementStyle } from './elementStyles'
import { parseDSL } from '@/lib/dsl'
import { useWorkspaceStore } from '@/store/workspace'
import type { ElementStyle, ModelElement, Person, SoftwareSystem, Workspace } from '@/types/model'

const STYLES: ElementStyle[] = [
  { tag: 'Element', background: '#111111', color: '#eeeeee', fontSize: 14 },
  { tag: 'Software System', background: '#222222', shape: 'RoundedBox' },
  { tag: 'Person', background: '#333333', shape: 'Person' },
  { tag: 'External', background: '#999999', stroke: '#888888' },
  { tag: 'Legacy', background: '#aa0000' },
]

function system(overrides: Partial<SoftwareSystem> = {}): SoftwareSystem {
  return {
    id: 'sys', type: 'softwareSystem', name: 'Sys', properties: {}, containers: [],
    tags: ['Element', 'Software System'],
    ...overrides,
  }
}

const EXTERNAL_DSL = `workspace {
  model {
    payments = softwareSystem "Payments" {
      tags "External"
    }
    customer = person "Customer" {
      tags "External"
    }
    core = softwareSystem "Core"
  }
  views {
    styles {
      element "External" {
        background #123456
        stroke #654321
      }
    }
  }
}`

describe('getElementStyle: base / type / custom-tag precedence', () => {
  const index = buildStyleIndex(STYLES)

  it('cascades Element, then the type tag, then custom tags in order', () => {
    const style = getElementStyle(system({ tags: ['Element', 'Software System', 'Legacy'] }), index)!
    expect(style.background).toBe('#aa0000')
    expect(style.shape).toBe('RoundedBox')
    expect(style.color).toBe('#eeeeee')
    expect(style.fontSize).toBe(14)
  })

  it('applies only base and type styles when there are no custom tags', () => {
    const style = getElementStyle(system(), index)!
    expect(style).toEqual({ tag: 'Software System', background: '#222222', color: '#eeeeee', fontSize: 14, shape: 'RoundedBox' })
  })

  it('returns undefined when nothing matches', () => {
    expect(getElementStyle(system(), buildStyleIndex([]))).toBeUndefined()
  })

  it('leaves an Internal or unset element without an External tag untouched', () => {
    expect(getElementStyle(system({ location: 'Internal' }), index)!.background).toBe('#222222')
    expect(getElementStyle(system({ location: undefined }), index)!.background).toBe('#222222')
  })
})

describe('getElementStyle: External location as an implicit tag (TEA-168)', () => {
  const index = buildStyleIndex(STYLES)

  it('applies the External tag style to an element whose location is External', () => {
    const style = getElementStyle(system({ location: 'External' }), index)!
    expect(style.background).toBe('#999999')
    expect(style.stroke).toBe('#888888')
    // Base and type styles still apply underneath.
    expect(style.shape).toBe('RoundedBox')
    expect(style.color).toBe('#eeeeee')
  })

  it('applies to people as well as software systems', () => {
    const person: Person = { id: 'p', type: 'person', name: 'P', properties: {}, tags: ['Element', 'Person'], location: 'External' }
    const style = getElementStyle(person, index)!
    expect(style.background).toBe('#999999')
    expect(style.shape).toBe('Person')
  })

  it('lets explicit custom tags override the implicit External style', () => {
    const style = getElementStyle(system({ location: 'External', tags: ['Element', 'Software System', 'Legacy'] }), index)!
    expect(style.background).toBe('#aa0000')
    expect(style.stroke).toBe('#888888')
  })

  it('does not double-apply when the External tag is also present', () => {
    const tagged = getElementStyle(system({ location: 'External', tags: ['Element', 'Software System', 'Legacy', 'External'] }), index)!
    // Explicit tag order is kept: External written after Legacy wins.
    expect(tagged.background).toBe('#999999')
  })

  it('lets an explicit Internal location win over a legacy External tag', () => {
    const style = getElementStyle(system({ location: 'Internal', tags: ['Element', 'Software System', 'External'] }), index)!
    expect(style.background).toBe('#222222')
    expect(style.stroke).toBeUndefined()
  })

  it('treats an External tag on an element with no location as a plain tag', () => {
    const container: ModelElement = { id: 'c', type: 'container', name: 'C', properties: {}, components: [], tags: ['Element', 'Container', 'External'] }
    expect(getElementStyle(container, index)!.background).toBe('#999999')
  })
})

describe('External styles on imported and inspector-created elements (TEA-168)', () => {
  function parse(dsl: string): Workspace {
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    return workspace
  }

  it('styles an imported element normalized to location External', () => {
    const ws = parse(EXTERNAL_DSL)
    const payments = ws.model.softwareSystems.find((s) => s.name === 'Payments')!
    const customer = ws.model.people.find((p) => p.name === 'Customer')!
    const core = ws.model.softwareSystems.find((s) => s.name === 'Core')!
    // DSL normalization is unchanged: the tag is hoisted onto location.
    expect(payments.location).toBe('External')
    expect(payments.tags).not.toContain('External')

    const index = buildDiagramStyleIndex(ws, [])
    expect(getElementStyle(payments, index)).toMatchObject({ background: '#123456', stroke: '#654321' })
    expect(getElementStyle(customer, index)).toMatchObject({ background: '#123456', stroke: '#654321' })
    expect(getElementStyle(core, index)).toBeUndefined()
  })

  it('keeps an explicit legacy Internal location winning over an External tag on import', () => {
    const ws = parse(`workspace {
  model {
    core = softwareSystem "Core" {
      location Internal
      tags "External"
    }
  }
  views {
    styles {
      element "External" {
        background #123456
      }
    }
  }
}`)
    const core = ws.model.softwareSystems[0]
    expect(core.location).toBe('Internal')
    expect(getElementStyle(core, buildDiagramStyleIndex(ws, []))).toBeUndefined()
  })

  describe('inspector', () => {
    beforeEach(() => {
      useWorkspaceStore.getState().loadWorkspace(parse(EXTERNAL_DSL))
    })

    it('gives an element set to External in the inspector the same style as an imported one', () => {
      const store = useWorkspaceStore.getState()
      const core = store.workspace!.model.softwareSystems.find((s) => s.name === 'Core')!
      // RightPanel's Location radio calls updateElement with the location field only.
      store.updateElement(core.id, { location: 'External' })

      const ws = useWorkspaceStore.getState().workspace!
      const updated = ws.model.softwareSystems.find((s) => s.id === core.id)!
      const imported = ws.model.softwareSystems.find((s) => s.name === 'Payments')!
      expect(updated.tags).not.toContain('External')

      const index = buildDiagramStyleIndex(ws, [])
      expect(getElementStyle(updated, index)).toEqual(getElementStyle(imported, index))
      expect(getElementStyle(updated, index)).toMatchObject({ background: '#123456' })
    })

    it('drops the External style when the inspector sets an element back to Internal', () => {
      const store = useWorkspaceStore.getState()
      const payments = store.workspace!.model.softwareSystems.find((s) => s.name === 'Payments')!
      store.updateElement(payments.id, { location: 'Internal' })

      const ws = useWorkspaceStore.getState().workspace!
      const updated = ws.model.softwareSystems.find((s) => s.id === payments.id)!
      expect(getElementStyle(updated, buildDiagramStyleIndex(ws, []))).toBeUndefined()
    })
  })
})
