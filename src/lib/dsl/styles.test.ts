import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import type { Workspace, ElementStyle, RelationshipStyle, ModelElement } from '@/types/model'

// ─── DSL Parsing: stroke & strokeWidth ─────────────────────────────

describe('Element style parsing', () => {
  it('parses stroke and strokeWidth properties', () => {
    const dsl = `
workspace {
  model {
    softwareSystem "My App"
  }
  views {
    styles {
      element "Software System" {
        stroke #ff0000
        strokeWidth 4
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const style = workspace.views.configuration.styles.elements[0]
    expect(style.tag).toBe('Software System')
    expect(style.stroke).toBe('#ff0000')
    expect(style.strokeWidth).toBe(4)
  })

  it('parses all element style properties together', () => {
    const dsl = `
workspace {
  model {
    softwareSystem "My App"
  }
  views {
    styles {
      element "Software System" {
        background #1168bd
        color #ffffff
        shape RoundedBox
        fontSize 18
        border Dashed
        opacity 75
        stroke #333333
        strokeWidth 3
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const style = workspace.views.configuration.styles.elements[0]
    expect(style.background).toBe('#1168bd')
    expect(style.color).toBe('#ffffff')
    expect(style.shape).toBe('RoundedBox')
    expect(style.fontSize).toBe(18)
    expect(style.border).toBe('Dashed')
    expect(style.opacity).toBe(75)
    expect(style.stroke).toBe('#333333')
    expect(style.strokeWidth).toBe(3)
  })

  it('parses multiple element styles', () => {
    const dsl = `
workspace {
  model {
    person "User"
    softwareSystem "App"
  }
  views {
    styles {
      element "Person" {
        background #08427b
        shape Person
      }
      element "Software System" {
        background #1168bd
        stroke #0b4884
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.configuration.styles.elements).toHaveLength(2)
    expect(workspace.views.configuration.styles.elements[0].tag).toBe('Person')
    expect(workspace.views.configuration.styles.elements[1].tag).toBe('Software System')
    expect(workspace.views.configuration.styles.elements[1].stroke).toBe('#0b4884')
  })
})

// ─── DSL Serialization: stroke & strokeWidth ───────────────────────

describe('Element style serialization', () => {
  function makeWsWithStyles(styles: ElementStyle[]): Workspace {
    return {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: styles, relationships: [] } },
      },
    }
  }

  it('serializes stroke and strokeWidth', () => {
    const ws = makeWsWithStyles([
      { tag: 'Database', stroke: '#ff0000', strokeWidth: 4 },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('stroke #ff0000')
    expect(dsl).toContain('strokeWidth 4')
  })

  it('serializes all element style properties', () => {
    const ws = makeWsWithStyles([
      {
        tag: 'Custom',
        background: '#1168bd',
        color: '#ffffff',
        shape: 'Cylinder',
        fontSize: 16,
        border: 'Dashed',
        opacity: 50,
        icon: 'db-icon',
        stroke: '#333333',
        strokeWidth: 3,
      },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('background #1168bd')
    expect(dsl).toContain('color #ffffff')
    expect(dsl).toContain('shape Cylinder')
    expect(dsl).toContain('fontSize 16')
    expect(dsl).toContain('border Dashed')
    expect(dsl).toContain('opacity 50')
    expect(dsl).toContain('icon "db-icon"')
    expect(dsl).toContain('stroke #333333')
    expect(dsl).toContain('strokeWidth 3')
  })

  it('omits undefined style properties', () => {
    const ws = makeWsWithStyles([
      { tag: 'Minimal', background: '#111' },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('background #111')
    expect(dsl).not.toContain('stroke')
    expect(dsl).not.toContain('strokeWidth')
    expect(dsl).not.toContain('opacity')
  })
})

// ─── DSL Round-trip ────────────────────────────────────────────────

describe('Element style round-trip', () => {
  it('preserves stroke and strokeWidth through serialize → parse', () => {
    const dsl = `
workspace {
  model {
    softwareSystem "My App"
  }
  views {
    styles {
      element "Software System" {
        background #1168bd
        color #ffffff
        stroke #ff0000
        strokeWidth 4
        border Dashed
        opacity 80
        fontSize 16
      }
    }
  }
}
`
    const { workspace: parsed1 } = parseDSL(dsl)
    const reserialized = serializeDSL(parsed1)
    const { workspace: parsed2, errors } = parseDSL(reserialized)

    expect(errors).toHaveLength(0)
    const style = parsed2.views.configuration.styles.elements[0]
    expect(style.background).toBe('#1168bd')
    expect(style.color).toBe('#ffffff')
    expect(style.stroke).toBe('#ff0000')
    expect(style.strokeWidth).toBe(4)
    expect(style.border).toBe('Dashed')
    expect(style.opacity).toBe(80)
    expect(style.fontSize).toBe(16)
  })
})

// ─── Icon serialization ────────────────────────────────────────────

describe('Icon serialization', () => {
  function makeWsWithIcon(icon: string): Workspace {
    return {
      name: 'Test',
      model: { people: [], softwareSystems: [], relationships: [], groups: [] },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [{ tag: 'Custom', icon }], relationships: [] } },
      },
    }
  }

  it('serializes icon as a quoted string', () => {
    const dsl = serializeDSL(makeWsWithIcon('db-icon'))
    expect(dsl).toContain('icon "db-icon"')
    expect(dsl).not.toContain('icon db-icon\n')
  })

  it('serializes path-style icon without breaking DSL', () => {
    const dsl = serializeDSL(makeWsWithIcon('icons/user.png'))
    expect(dsl).toContain('icon "icons/user.png"')
  })

  it('path-style icon survives serialize → parse roundtrip', () => {
    const ws = makeWsWithIcon('icons/user.png')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.configuration.styles.elements[0].icon).toBe('icons/user.png')
  })

  it('plain icon name survives serialize → parse roundtrip', () => {
    const ws = makeWsWithIcon('db-icon')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.configuration.styles.elements[0].icon).toBe('db-icon')
  })
})

// ─── Style Cascade Logic ──────────────────────────────────────────
// Mirrors the getElementStyle() logic from Canvas.tsx

function buildStyleIndex(styles: ElementStyle[]): Map<string, ElementStyle> {
  const map = new Map<string, ElementStyle>()
  for (const style of styles) map.set(style.tag, style)
  return map
}

function getElementStyle(
  element: ModelElement,
  styleIndex: Map<string, ElementStyle>,
): ElementStyle | undefined {
  const typeTag =
    element.type === 'person' ? 'Person'
    : element.type === 'softwareSystem' ? 'Software System'
    : element.type === 'container' ? 'Container'
    : 'Component'

  let matched: ElementStyle | undefined
  const baseStyle = styleIndex.get('Element')
  if (baseStyle) matched = { ...baseStyle }

  const typeStyle = styleIndex.get(typeTag)
  if (typeStyle) matched = { ...matched, ...typeStyle }

  for (const tag of element.tags) {
    if (tag === typeTag || tag === 'Element') continue
    const style = styleIndex.get(tag)
    if (style) matched = { ...matched, ...style }
  }

  return matched
}

describe('Style cascade', () => {
  it('returns undefined when no styles match', () => {
    const element: ModelElement = {
      id: '1', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {},
    }
    const styleIndex = buildStyleIndex([])
    expect(getElementStyle(element, styleIndex)).toBeUndefined()
  })

  it('applies "Element" base tag to all element types', () => {
    const styles: ElementStyle[] = [
      { tag: 'Element', background: '#000000', fontSize: 14 },
    ]
    const styleIndex = buildStyleIndex(styles)

    const person: ModelElement = {
      id: '1', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {},
    }
    const system: ModelElement = {
      id: '2', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [],
    }

    const personStyle = getElementStyle(person, styleIndex)!
    const systemStyle = getElementStyle(system, styleIndex)!
    expect(personStyle.background).toBe('#000000')
    expect(personStyle.fontSize).toBe(14)
    expect(systemStyle.background).toBe('#000000')
    expect(systemStyle.fontSize).toBe(14)
  })

  it('type tag overrides Element base tag', () => {
    const styles: ElementStyle[] = [
      { tag: 'Element', background: '#000000', color: '#ffffff' },
      { tag: 'Person', background: '#08427b' },
    ]
    const styleIndex = buildStyleIndex(styles)

    const person: ModelElement = {
      id: '1', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {},
    }
    const result = getElementStyle(person, styleIndex)!
    expect(result.background).toBe('#08427b') // Person overrides Element
    expect(result.color).toBe('#ffffff')       // Inherited from Element
  })

  it('custom tags override type tag (last tag wins)', () => {
    const styles: ElementStyle[] = [
      { tag: 'Person', background: '#08427b', color: '#ffffff' },
      { tag: 'VIP', background: '#ff0000' },
    ]
    const styleIndex = buildStyleIndex(styles)

    const person: ModelElement = {
      id: '1', type: 'person', name: 'User', tags: ['Element', 'Person', 'VIP'], properties: {},
    }
    const result = getElementStyle(person, styleIndex)!
    expect(result.background).toBe('#ff0000') // VIP overrides Person
    expect(result.color).toBe('#ffffff')       // Inherited from Person
  })

  it('full cascade: Element → type → custom tags in order', () => {
    const styles: ElementStyle[] = [
      { tag: 'Element', fontSize: 12, opacity: 100 },
      { tag: 'Container', background: '#2dd4bf', color: '#ffffff' },
      { tag: 'Database', background: '#4444ff', shape: 'Cylinder' },
      { tag: 'Legacy', border: 'Dashed', opacity: 50 },
    ]
    const styleIndex = buildStyleIndex(styles)

    const container: ModelElement = {
      id: '1', type: 'container', name: 'DB',
      tags: ['Element', 'Container', 'Database', 'Legacy'],
      properties: {}, technology: 'PostgreSQL', components: [],
    }
    const result = getElementStyle(container, styleIndex)!
    expect(result.fontSize).toBe(12)          // From Element
    expect(result.color).toBe('#ffffff')       // From Container
    expect(result.background).toBe('#4444ff')  // Database overrides Container
    expect(result.shape).toBe('Cylinder')      // From Database
    expect(result.border).toBe('Dashed')       // From Legacy
    expect(result.opacity).toBe(50)            // Legacy overrides Element
  })

  it('later custom tags override earlier ones', () => {
    const styles: ElementStyle[] = [
      { tag: 'Red', background: '#ff0000' },
      { tag: 'Blue', background: '#0000ff' },
    ]
    const styleIndex = buildStyleIndex(styles)

    const system: ModelElement = {
      id: '1', type: 'softwareSystem', name: 'App',
      tags: ['Element', 'Software System', 'Red', 'Blue'],
      properties: {}, containers: [],
    }
    const result = getElementStyle(system, styleIndex)!
    expect(result.background).toBe('#0000ff') // Blue is last → wins
  })

  it('does not apply styles for tags the element does not have', () => {
    const styles: ElementStyle[] = [
      { tag: 'Person', background: '#08427b' },
      { tag: 'Database', shape: 'Cylinder' },
    ]
    const styleIndex = buildStyleIndex(styles)

    const person: ModelElement = {
      id: '1', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {},
    }
    const result = getElementStyle(person, styleIndex)!
    expect(result.background).toBe('#08427b')
    expect(result.shape).toBeUndefined()  // Person doesn't have Database tag
  })
})

// ─── Relationship Style Parsing ────────────────────────────────────

describe('Relationship style parsing', () => {
  it('parses all relationship style properties', () => {
    const dsl = `
workspace {
  model {
    person "User"
    softwareSystem "App"
    User -> App "calls"
  }
  views {
    styles {
      relationship "Relationship" {
        color #ff0000
        thickness 3
        dashed true
        fontSize 14
        opacity 75
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const style = workspace.views.configuration.styles.relationships[0]
    expect(style.tag).toBe('Relationship')
    expect(style.color).toBe('#ff0000')
    expect(style.thickness).toBe(3)
    expect(style.dashed).toBe(true)
    expect(style.fontSize).toBe(14)
    expect(style.opacity).toBe(75)
  })

  it('parses dashed false correctly', () => {
    const dsl = `
workspace {
  model { }
  views {
    styles {
      relationship "Async" {
        dashed false
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const style = workspace.views.configuration.styles.relationships[0]
    expect(style.dashed).toBe(false)
  })

  it('parses multiple relationship styles', () => {
    const dsl = `
workspace {
  model { }
  views {
    styles {
      relationship "Relationship" {
        color #111111
      }
      relationship "Async" {
        dashed true
        thickness 2
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.configuration.styles.relationships).toHaveLength(2)
    expect(workspace.views.configuration.styles.relationships[0].tag).toBe('Relationship')
    expect(workspace.views.configuration.styles.relationships[1].tag).toBe('Async')
    expect(workspace.views.configuration.styles.relationships[1].dashed).toBe(true)
  })
})

// ─── Relationship Style Serialization ──────────────────────────────

describe('Relationship style serialization', () => {
  function makeWsWithRelStyles(styles: RelationshipStyle[]): Workspace {
    return {
      name: 'Test',
      model: { people: [], softwareSystems: [], relationships: [], groups: [] },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: styles } },
      },
    }
  }

  it('serializes all relationship style properties', () => {
    const ws = makeWsWithRelStyles([
      { tag: 'Relationship', color: '#ff0000', thickness: 3, dashed: true, fontSize: 14, opacity: 75 },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('relationship "Relationship"')
    expect(dsl).toContain('color #ff0000')
    expect(dsl).toContain('thickness 3')
    expect(dsl).toContain('dashed true')
    expect(dsl).toContain('fontSize 14')
    expect(dsl).toContain('opacity 75')
  })

  it('serializes dashed false', () => {
    const ws = makeWsWithRelStyles([
      { tag: 'Async', dashed: false },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('dashed false')
  })

  it('omits undefined relationship style properties', () => {
    const ws = makeWsWithRelStyles([
      { tag: 'Minimal', color: '#000' },
    ])
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('color #000')
    expect(dsl).not.toContain('thickness')
    expect(dsl).not.toContain('dashed')
    expect(dsl).not.toContain('opacity')
  })
})

// ─── Relationship Style Round-trip ─────────────────────────────────

describe('Relationship style round-trip', () => {
  it('preserves all relationship style properties through serialize → parse', () => {
    const dsl = `
workspace {
  model { }
  views {
    styles {
      relationship "Relationship" {
        color #ff0000
        thickness 3
        dashed true
        fontSize 14
        opacity 75
      }
    }
  }
}
`
    const { workspace: parsed1 } = parseDSL(dsl)
    const reserialized = serializeDSL(parsed1)
    const { workspace: parsed2, errors } = parseDSL(reserialized)

    expect(errors).toHaveLength(0)
    const style = parsed2.views.configuration.styles.relationships[0]
    expect(style.tag).toBe('Relationship')
    expect(style.color).toBe('#ff0000')
    expect(style.thickness).toBe(3)
    expect(style.dashed).toBe(true)
    expect(style.fontSize).toBe(14)
    expect(style.opacity).toBe(75)
  })

  it('dashed false survives roundtrip', () => {
    const dsl = `
workspace {
  model { }
  views {
    styles {
      relationship "Async" {
        dashed false
      }
    }
  }
}
`
    const { workspace: parsed1 } = parseDSL(dsl)
    const reserialized = serializeDSL(parsed1)
    const { workspace: parsed2, errors } = parseDSL(reserialized)

    expect(errors).toHaveLength(0)
    const style = parsed2.views.configuration.styles.relationships[0]
    expect(style.dashed).toBe(false)
  })
})
