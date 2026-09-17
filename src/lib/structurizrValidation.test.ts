import { describe, it, expect } from 'vitest'
import { validateForStructurizr, isStructurizrUrl, type StructurizrWarningCode } from './structurizrValidation'
import type {
  Workspace, SoftwareSystem, Container, Component, Person, Relationship, View,
  DeploymentNode, DeploymentEnvironment,
} from '@/types/model'

// Every expectation in this file mirrors a behaviour confirmed against the
// real Structurizr CLI; `structurizr-conformance.test.ts` runs the same rules
// past the CLI itself when it is installed.

function person(id: string, name: string, over: Partial<Person> = {}): Person {
  return { id, type: 'person', name, tags: ['Element', 'Person'], properties: {}, ...over }
}
function component(id: string, name: string, over: Partial<Component> = {}): Component {
  return { id, type: 'component', name, tags: ['Element', 'Component'], properties: {}, ...over }
}
function container(id: string, name: string, components: Component[] = [], over: Partial<Container> = {}): Container {
  return { id, type: 'container', name, tags: ['Element', 'Container'], properties: {}, components, ...over }
}
function system(id: string, name: string, containers: Container[] = [], over: Partial<SoftwareSystem> = {}): SoftwareSystem {
  return { id, type: 'softwareSystem', name, tags: ['Element', 'Software System'], properties: {}, containers, ...over }
}
function rel(id: string, sourceId: string, destinationId: string, over: Partial<Relationship> = {}): Relationship {
  return { id, sourceId, destinationId, tags: ['Relationship'], properties: {}, ...over }
}
function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    name: 'T',
    model: { people: [], softwareSystems: [], relationships: [], groups: [], deploymentEnvironments: [] },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      dynamicViews: [], deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
    ...over,
  }
}
function view(key: string): View {
  return { type: 'systemLandscape', key, elements: [], relationships: [] }
}
function node(id: string, name: string, over: Partial<DeploymentNode> = {}): DeploymentNode {
  return {
    id, type: 'deploymentNode', name, tags: ['Element', 'Deployment Node'], properties: {},
    children: [], infrastructureNodes: [], containerInstances: [], softwareSystemInstances: [], ...over,
  }
}
function env(id: string, name: string, deploymentNodes: DeploymentNode[]): DeploymentEnvironment {
  return { id, name, deploymentNodes }
}

const codes = (w: Workspace): StructurizrWarningCode[] => validateForStructurizr(w).map(x => x.code)

describe('validateForStructurizr', () => {
  it('passes a clean workspace', () => {
    const w = ws({
      model: {
        people: [person('p1', 'Ops')],
        softwareSystems: [system('s1', 'Payments', [container('c1', 'API', [component('k1', 'Router')])])],
        relationships: [rel('r1', 'p1', 's1', { description: 'uses' })],
        groups: [], deploymentEnvironments: [],
      },
      views: { ...ws().views, systemLandscapeViews: [view('Landscape')] },
    })
    expect(validateForStructurizr(w)).toEqual([])
  })

  describe('empty names', () => {
    it('flags a name that is blank', () => {
      expect(codes(ws({ model: { ...ws().model, softwareSystems: [system('s1', '')] } }))).toEqual(['empty-name'])
    })

    it('flags a whitespace-only name — Structurizr trims before testing', () => {
      expect(codes(ws({ model: { ...ws().model, softwareSystems: [system('s1', '   ')] } }))).toEqual(['empty-name'])
    })

    it('flags a name that encodes to nothing even though the raw string is not empty', () => {
      // A lone backslash has no representation the DSL reads back, so the
      // serializer drops it and Structurizr sees `softwareSystem ""`.
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', '\\')] } })
      expect(codes(w)).toEqual(['empty-name'])
      expect(validateForStructurizr(w)[0].message).toContain('encodes to nothing')
    })

    it('accepts a padded name — the padding survives the round trip', () => {
      expect(codes(ws({ model: { ...ws().model, softwareSystems: [system('s1', '  padded  ')] } }))).toEqual([])
    })

    it('reaches containers and components, not just top-level elements', () => {
      const w = ws({
        model: {
          ...ws().model,
          softwareSystems: [system('s1', 'Sys', [container('c1', '', [component('k1', '\\')])])],
        },
      })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['c1', 'k1'])
    })
  })

  describe('urls', () => {
    it.each([
      'https://example.com/x',
      'https://example.com/a?b=c&d=%22e%22',
      'https://例え.jp/path',
      'https://例え.jp/a b',
      'https://example.com/<x>',
      'file:///C:/share',
      'file://host/share',
      'mailto:a@b.com',
      'ftp://example.com/x',
      'jar:file:///x!/y',
      'HTTPS://example.com/x',
      'https://example.com:99999/x',
      'https://',
    ])('accepts %s', (url) => {
      expect(isStructurizrUrl(url)).toBe(true)
    })

    it.each([
      'example.com',       // no scheme
      'not a url',
      '//example.com/x',   // protocol-relative
      'file://C:\\share',  // authority "C:\share" — port is not numeric
      'http://C:\\share',
      'https://a:b/x',
      'urn:isbn:1',        // no java.net.URL handler
      'data:text/plain,hi',
      'news:comp.lang',
      'gopher://example.com',
    ])('rejects %s', (url) => {
      expect(isStructurizrUrl(url)).toBe(false)
    })

    it('flags an element url and a relationship url alike', () => {
      const w = ws({
        model: {
          ...ws().model,
          softwareSystems: [system('s1', 'A', [], { url: 'example.com' }), system('s2', 'B')],
          relationships: [rel('r1', 's1', 's2', { url: 'file://C:\\share' })],
        },
      })
      const warnings = validateForStructurizr(w)
      expect(warnings.map(x => x.code)).toEqual(['invalid-url', 'invalid-url'])
      expect(warnings[0].elementId).toBe('s1')
      expect(warnings[1].relationshipId).toBe('r1')
    })
  })

  describe('duplicate sibling names', () => {
    it('flags two containers of the same system', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [container('c1', 'A'), container('c2', 'A')])] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['c2'])
    })

    it('does not flag the same component name in different containers', () => {
      const w = ws({
        model: {
          ...ws().model,
          softwareSystems: [system('s1', 'Sys', [
            container('c1', 'A', [component('k1', 'K')]),
            container('c2', 'B', [component('k2', 'K')]),
          ])],
        },
      })
      expect(codes(w)).toEqual([])
    })

    it('treats people and software systems as one top-level namespace', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'X')], softwareSystems: [system('s1', 'X')] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['s1'])
    })

    it('compares exactly — a trailing space makes a different name', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [container('c1', 'A'), container('c2', 'A ')])] } })
      expect(codes(w)).toEqual([])
    })

    it('compares the stored name, so two names that encode alike collide', () => {
      // A backslash before `n` is unrepresentable, so `\n` is written out as
      // plain `n` and collides with a sibling actually named `n`.
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [container('c1', 'n'), container('c2', '\\n')])] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['c2'])
    })

    it('does not double-report an empty name as a duplicate', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', ''), system('s2', '')] } })
      expect(codes(w)).toEqual(['empty-name', 'empty-name'])
    })
  })

  describe('relationships', () => {
    const nested = () => ws({
      model: {
        ...ws().model,
        softwareSystems: [
          system('s1', 'Sys', [container('c1', 'C', [component('k1', 'K')])]),
          system('s2', 'Other'),
        ],
        relationships: [],
        groups: [], deploymentEnvironments: [],
      },
    })

    it('flags a relationship from a component to its own system', () => {
      const w = nested()
      w.model.relationships = [rel('r1', 'k1', 's1', { description: 'uses' })]
      expect(codes(w)).toEqual(['ancestor-relationship'])
    })

    it('flags the descendant direction too', () => {
      const w = nested()
      w.model.relationships = [rel('r1', 's1', 'c1', { description: 'uses' })]
      expect(codes(w)).toEqual(['ancestor-relationship'])
    })

    it('allows a relationship between siblings', () => {
      const w = nested()
      w.model.relationships = [rel('r1', 'c1', 's2', { description: 'uses' })]
      expect(codes(w)).toEqual([])
    })

    it('flags an explicit relationship that duplicates an implied one', () => {
      const w = nested()
      w.model.relationships = [
        rel('r1', 'c1', 's2', { description: 'uses' }), // implies s1 -> s2 "uses"
        rel('r2', 's1', 's2', { description: 'uses' }),
      ]
      expect(codes(w)).toEqual(['implied-duplicate-relationship'])
      expect(validateForStructurizr(w)[0].relationshipId).toBe('r2')
    })

    it('does not flag it when the description differs', () => {
      const w = nested()
      w.model.relationships = [
        rel('r1', 'c1', 's2', { description: 'uses' }),
        rel('r2', 's1', 's2', { description: 'reports to' }),
      ]
      expect(codes(w)).toEqual([])
    })

    it('does not flag it when the broad relationship is declared first', () => {
      // Nothing is implied over an existing relationship, so this order is fine.
      const w = nested()
      w.model.relationships = [
        rel('r1', 's1', 's2', { description: 'uses' }),
        rel('r2', 'c1', 's2', { description: 'uses' }),
      ]
      expect(codes(w)).toEqual([])
    })

    it('flags two identical explicit relationships', () => {
      const w = nested()
      w.model.relationships = [
        rel('r1', 'c1', 's2', { description: 'uses' }),
        rel('r2', 'c1', 's2', { description: 'uses' }),
      ]
      expect(codes(w)).toEqual(['duplicate-relationship'])
    })

    it('allows two relationships between the same pair with different descriptions', () => {
      const w = nested()
      w.model.relationships = [
        rel('r1', 'c1', 's2', { description: 'reads' }),
        rel('r2', 'c1', 's2', { description: 'writes' }),
      ]
      expect(codes(w)).toEqual([])
    })

    it('does not imply anything from a relationship Structurizr already refused', () => {
      const w = nested()
      w.model.relationships = [
        rel('r1', 'k1', 'c1', { description: 'uses' }), // rejected outright
        rel('r2', 's1', 's2', { description: 'uses' }),
      ]
      expect(codes(w)).toEqual(['ancestor-relationship'])
    })
  })

  describe('view keys', () => {
    it('flags a key with a space', () => {
      const w = ws({ views: { ...ws().views, systemContextViews: [{ ...view('Label 602'), type: 'systemContext' }] } })
      const warnings = validateForStructurizr(w)
      expect(warnings.map(x => x.code)).toEqual(['view-key-charset'])
      expect(warnings[0].viewKey).toBe('Label 602')
    })

    it('does not flag a missing key — the serializer omits it and Structurizr generates one', () => {
      expect(codes(ws({ views: { ...ws().views, systemLandscapeViews: [view('')] } }))).toEqual([])
    })

    it('accepts letters, digits, underscore and dash', () => {
      expect(codes(ws({ views: { ...ws().views, systemLandscapeViews: [view('A_b-9')] } }))).toEqual([])
    })

    it('flags two views sharing a key', () => {
      const w = ws({
        views: {
          ...ws().views,
          systemContextViews: [{ ...view('Dup'), type: 'systemContext' }],
          containerViews: [{ ...view('Dup'), type: 'container' }],
        },
      })
      expect(codes(w)).toEqual(['duplicate-view-key'])
    })

    it('ignores views and keys c4hero generated — neither reaches the DSL', () => {
      const w = ws({
        views: {
          ...ws().views,
          // An autoKey key is not emitted and an autoView view is not emitted
          // at all, so neither can collide with, or be rejected by, anything.
          systemContextViews: [{ ...view('Dup'), type: 'systemContext', autoKey: true }],
          containerViews: [{ ...view('Dup'), type: 'container', autoKey: true }],
          componentViews: [{ ...view('bad key'), type: 'component', autoView: true }],
        },
      })
      expect(codes(w)).toEqual([])
    })

    it('checks every view collection, not just the landscape', () => {
      const w = ws({
        views: {
          ...ws().views,
          dynamicViews: [{ ...view('dyn amic'), type: 'dynamic' }],
          deploymentViews: [{ ...view('dep loy'), type: 'deployment' }],
        },
      })
      expect(codes(w)).toEqual(['view-key-charset', 'view-key-charset'])
    })
  })

  describe('deployment topology', () => {
    it('flags an empty deployment-node name', () => {
      const w = ws({ model: { ...ws().model, deploymentEnvironments: [env('e1', 'Live', [node('n1', '')])] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['n1'])
    })

    it('flags two sibling nodes sharing a name', () => {
      const w = ws({ model: { ...ws().model, deploymentEnvironments: [env('e1', 'Live', [node('n1', 'N'), node('n2', 'N')])] } })
      expect(codes(w)).toEqual(['duplicate-sibling-name'])
    })

    it('treats deployment and infrastructure nodes as one namespace', () => {
      const parent = node('n1', 'Parent', {
        children: [node('n2', 'X')],
        infrastructureNodes: [{ id: 'i1', type: 'infrastructureNode', name: 'X', tags: [], properties: {} }],
      })
      const w = ws({ model: { ...ws().model, deploymentEnvironments: [env('e1', 'Live', [parent])] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['n2'])
    })

    it('scopes names per environment', () => {
      const w = ws({
        model: {
          ...ws().model,
          deploymentEnvironments: [env('e1', 'Live', [node('n1', 'N')]), env('e2', 'Dev', [node('n2', 'N')])],
        },
      })
      expect(codes(w)).toEqual([])
    })

    it('validates urls on nodes and on instances', () => {
      const n = node('n1', 'N', {
        url: 'example.com',
        containerInstances: [{ id: 'ci1', type: 'containerInstance', containerId: 'c1', tags: [], properties: {}, url: 'urn:isbn:1' }],
      })
      const w = ws({ model: { ...ws().model, deploymentEnvironments: [env('e1', 'Live', [n])] } })
      expect(validateForStructurizr(w).map(x => x.elementId)).toEqual(['n1', 'ci1'])
    })
  })

  it('never throws on a partially-built workspace', () => {
    for (const broken of [{ name: 'x' }, { name: 'x', model: {}, views: {} }, { name: 'x', model: { softwareSystems: [{}] } }]) {
      expect(() => validateForStructurizr(broken as unknown as Workspace)).not.toThrow()
    }
  })
})
