import { describe, expect, it } from 'vitest'
import {
  diffWorkspaces,
  formatDiffSummary,
  formatElementPath,
  matchByIdentity,
  type ElementDiffEntry,
} from './workspaceDiff'
import { makeWorkspace } from './ai/testFixture'
import { parseDSL } from './dsl'
import type { Container, Component, Person, Workspace } from '@/types/model'

/** Deep clone helper — keeps each test's mutation isolated from the shared fixture. */
function clone(ws: Workspace): Workspace {
  return JSON.parse(JSON.stringify(ws)) as Workspace
}

function entryFor(entries: ElementDiffEntry[], name: string): ElementDiffEntry | undefined {
  return entries.find((entry) => entry.name === name)
}

function changeFor(entry: ElementDiffEntry | undefined, field: string) {
  return entry?.changes.find((change) => change.field === field)
}

const person = (id: string, name: string): Person => ({
  id, type: 'person', name, tags: [], properties: {},
})

describe('matchByIdentity', () => {
  it('pairs on id + name before anything else', () => {
    const result = matchByIdentity(
      [person('a', 'Alice'), person('b', 'Bob')],
      [person('b', 'Bob'), person('a', 'Alice')],
    )
    expect(result.pairs).toHaveLength(2)
    expect(result.addedOnly).toEqual([])
    expect(result.removedOnly).toEqual([])
  })

  it('pairs on name when the DSL identifier was renamed', () => {
    const result = matchByIdentity([person('oldId', 'Alice')], [person('newId', 'Alice')])
    expect(result.pairs).toEqual([{ base: person('oldId', 'Alice'), head: person('newId', 'Alice') }])
  })

  it('pairs on an authored id when the element was renamed', () => {
    const result = matchByIdentity([person('alice', 'Alice')], [person('alice', 'Alice Smith')])
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0].head.name).toBe('Alice Smith')
  })

  it('never pairs two unrelated elements that share a parser-generated id', () => {
    // `p1` is what the DSL parser hands an anonymous declaration. The counter
    // restarts per parse, so the same id in two files means nothing.
    const result = matchByIdentity([person('p1', 'Alice')], [person('p1', 'Zach')])
    expect(result.pairs).toEqual([])
    expect(result.addedOnly.map((p) => p.name)).toEqual(['Zach'])
    expect(result.removedOnly.map((p) => p.name)).toEqual(['Alice'])
  })

  it('matches names case- and whitespace-insensitively', () => {
    const result = matchByIdentity([person('a', ' Alice ')], [person('b', 'alice')])
    expect(result.pairs).toHaveLength(1)
  })

  it('pairs same-named siblings in source order, deterministically', () => {
    const base = [person('a1', 'API'), person('a2', 'API')]
    const head = [person('b1', 'API'), person('b2', 'API')]
    const result = matchByIdentity(base, head)
    expect(result.pairs.map((p) => [p.base.id, p.head.id])).toEqual([['a1', 'b1'], ['a2', 'b2']])
  })
})

describe('diffWorkspaces — no change', () => {
  it('reports two identical workspaces as identical', () => {
    const diff = diffWorkspaces(makeWorkspace(), makeWorkspace())
    expect(diff.identical).toBe(true)
    expect(diff.summary).toEqual({ added: 0, removed: 0, changed: 0, total: 0 })
    expect(diff.elements).toEqual([])
    expect(diff.relationships).toEqual([])
    expect(diff.views).toEqual([])
    expect(diff.workspaceChanges).toEqual([])
    expect(formatDiffSummary(diff)).toBe('No architectural differences')
  })

  it('ignores tag order and property order', () => {
    const base = clone(makeWorkspace())
    const head = clone(makeWorkspace())
    base.model.people[0].tags = ['Element', 'Person']
    head.model.people[0].tags = ['Person', 'Element']
    base.model.people[0].properties = { a: '1', b: '2' }
    head.model.people[0].properties = { b: '2', a: '1' }
    expect(diffWorkspaces(base, head).identical).toBe(true)
  })
})

describe('diffWorkspaces — elements', () => {
  it('reports an added person', () => {
    const head = clone(makeWorkspace())
    head.model.people.push(person('ops', 'Ops Engineer'))
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.elements).toEqual([
      { kind: 'added', headId: 'ops', type: 'person', name: 'Ops Engineer', parentPath: [], changes: [] },
    ])
    expect(diff.elementStatus.get('ops')).toBe('added')
    expect(diff.summary.added).toBe(1)
  })

  it('reports a removed container along with its components', () => {
    const base = clone(makeWorkspace())
    const head = clone(makeWorkspace())
    head.model.softwareSystems[0].containers = head.model.softwareSystems[0].containers.filter(
      (c) => c.id !== 'web',
    )
    const diff = diffWorkspaces(base, head)
    const removed = diff.elements.filter((entry) => entry.kind === 'removed')
    expect(removed.map((entry) => entry.name)).toEqual(['Web App', 'Cart'])
    expect(removed[1].parentPath).toEqual(['Shop', 'Web App'])
    // Nothing removed can be tinted on a canvas that no longer contains it.
    expect(diff.elementStatus.size).toBe(0)
  })

  it('reports an added component nested under its container path', () => {
    const head = clone(makeWorkspace())
    const webApp = head.model.softwareSystems[0].containers[0]
    webApp.components.push({ id: 'checkout', type: 'component', name: 'Checkout', tags: [], properties: {} } as Component)
    const diff = diffWorkspaces(makeWorkspace(), head)
    const added = entryFor(diff.elements, 'Checkout')
    expect(added?.kind).toBe('added')
    expect(added?.parentPath).toEqual(['Shop', 'Web App'])
    expect(formatElementPath(added!)).toBe('Shop / Web App / Checkout')
  })

  it('reports every scalar field change on a matched element', () => {
    const head = clone(makeWorkspace())
    const db = head.model.softwareSystems[0].containers[1]
    db.description = 'Stores orders'
    db.technology = 'PostgreSQL'
    db.owner = 'Platform'
    db.url = 'https://example.test/db'
    db.status = 'Deprecated'
    db.tags = ['Database']
    db.properties = { tier: 'gold' }
    const diff = diffWorkspaces(makeWorkspace(), head)
    const changed = entryFor(diff.elements, 'Database')
    expect(changed?.kind).toBe('changed')
    expect(changed?.changes.map((c) => c.field).sort()).toEqual(
      ['description', 'owner', 'properties', 'status', 'tags', 'technology', 'url'],
    )
    expect(changeFor(changed, 'technology')).toEqual({ field: 'technology', before: '', after: 'PostgreSQL' })
    expect(diff.elementStatus.get('db')).toBe('changed')
  })

  it('reports a rename as a change, not a remove + add', () => {
    const head = clone(makeWorkspace())
    head.model.people[0].name = 'Shopper'
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.elements).toHaveLength(1)
    expect(diff.elements[0]).toMatchObject({
      kind: 'changed',
      headId: 'cust',
      baseId: 'cust',
      changes: [{ field: 'name', before: 'Customer', after: 'Shopper' }],
    })
  })

  it('reports a location change on a software system', () => {
    const head = clone(makeWorkspace())
    head.model.softwareSystems[0].location = 'External'
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(changeFor(entryFor(diff.elements, 'Shop'), 'location')).toEqual({
      field: 'location', before: '', after: 'External',
    })
  })

  it('treats a container moved to another system as removed + added', () => {
    const head = clone(makeWorkspace())
    const [moved] = head.model.softwareSystems[0].containers.splice(1, 1)
    head.model.softwareSystems.push({
      id: 'analytics', type: 'softwareSystem', name: 'Analytics', tags: [], properties: {},
      containers: [moved as Container],
    })
    const diff = diffWorkspaces(makeWorkspace(), head)
    const database = diff.elements.filter((entry) => entry.name === 'Database')
    expect(database.map((entry) => entry.kind).sort()).toEqual(['added', 'removed'])
  })
})

describe('diffWorkspaces — relationships', () => {
  it('reports an added relationship with resolved endpoint names', () => {
    const head = clone(makeWorkspace())
    head.model.relationships.push({
      id: 'r3', sourceId: 'admin', destinationId: 'web', description: 'Configures', tags: [], properties: {},
    })
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.relationships).toEqual([
      {
        kind: 'added', headId: 'r3', sourceName: 'Admin', destinationName: 'Web App',
        description: 'Configures', changes: [],
      },
    ])
    expect(diff.relationshipStatus.get('r3')).toBe('added')
  })

  it('reports a removed relationship using the base revision names', () => {
    const head = clone(makeWorkspace())
    head.model.relationships = head.model.relationships.filter((rel) => rel.id !== 'r1')
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.relationships).toEqual([
      {
        kind: 'removed', baseId: 'r1', sourceName: 'Customer', destinationName: 'Web App',
        description: 'Browses', changes: [],
      },
    ])
  })

  it('reports a re-described relationship as changed', () => {
    const head = clone(makeWorkspace())
    head.model.relationships[0].description = 'Shops on'
    head.model.relationships[0].technology = 'HTTPS'
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.relationships).toHaveLength(1)
    expect(diff.relationships[0]).toMatchObject({ kind: 'changed', headId: 'r1', baseId: 'r1' })
    expect(diff.relationships[0].changes.map((c) => c.field)).toEqual(['description', 'technology'])
  })

  it('keeps parallel relationships apart by description', () => {
    const base = clone(makeWorkspace())
    const head = clone(makeWorkspace())
    for (const ws of [base, head]) {
      ws.model.relationships.push({
        id: 'r9', sourceId: 'cust', destinationId: 'web', description: 'Uploads to', tags: [], properties: {},
      })
    }
    head.model.relationships[0].technology = 'HTTPS'
    const diff = diffWorkspaces(base, head)
    expect(diff.relationships).toHaveLength(1)
    expect(diff.relationships[0]).toMatchObject({ kind: 'changed', headId: 'r1' })
  })

  it('reports relationships orphaned by a removed element as removed', () => {
    const head = clone(makeWorkspace())
    head.model.softwareSystems[0].containers = head.model.softwareSystems[0].containers.filter(
      (c) => c.id !== 'db',
    )
    head.model.relationships = head.model.relationships.filter((rel) => rel.destinationId !== 'db')
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.relationships).toEqual([
      {
        kind: 'removed', baseId: 'r2', sourceName: 'Web App', destinationName: 'Database',
        description: '', changes: [],
      },
    ])
  })

  it('follows a renamed endpoint instead of reporting a rewire', () => {
    const head = clone(makeWorkspace())
    head.model.people[0].name = 'Shopper'
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.relationships).toEqual([])
  })
})

describe('diffWorkspaces — views', () => {
  function withView(ws: Workspace, key: string, elementIds: string[]): Workspace {
    ws.views.containerViews.push({
      type: 'container',
      key,
      title: 'Containers',
      softwareSystemId: 'shop',
      elements: elementIds.map((id) => ({ id })),
      relationships: [],
    })
    return ws
  }

  it('reports an added view with its members', () => {
    const diff = diffWorkspaces(makeWorkspace(), withView(clone(makeWorkspace()), 'containers', ['web', 'db']))
    expect(diff.views).toEqual([
      {
        kind: 'added', key: 'containers', title: 'Containers', type: 'container',
        addedElements: ['Web App', 'Database'], removedElements: [], changes: [],
      },
    ])
  })

  it('reports a removed view', () => {
    const diff = diffWorkspaces(withView(clone(makeWorkspace()), 'containers', ['web']), makeWorkspace())
    expect(diff.views).toEqual([
      {
        kind: 'removed', key: 'containers', title: 'Containers', type: 'container',
        addedElements: [], removedElements: [], changes: [],
      },
    ])
  })

  it('reports membership changes on a matched view', () => {
    const base = withView(clone(makeWorkspace()), 'containers', ['web'])
    const head = withView(clone(makeWorkspace()), 'containers', ['db'])
    const diff = diffWorkspaces(base, head)
    expect(diff.views).toEqual([
      {
        kind: 'changed', key: 'containers', title: 'Containers', type: 'container',
        addedElements: ['Database'], removedElements: ['Web App'], changes: [],
      },
    ])
  })

  it('reports a retitled view', () => {
    const base = withView(clone(makeWorkspace()), 'containers', ['web'])
    const head = withView(clone(makeWorkspace()), 'containers', ['web'])
    head.views.containerViews[0].title = 'Shop containers'
    const diff = diffWorkspaces(base, head)
    expect(diff.views[0].changes).toEqual([
      { field: 'title', before: 'Containers', after: 'Shop containers' },
    ])
  })

  it('does not treat a renamed DSL identifier as a view membership change', () => {
    const base = withView(clone(makeWorkspace()), 'containers', ['web'])
    const head = clone(makeWorkspace())
    head.model.softwareSystems[0].containers[0].id = 'webApp'
    withView(head, 'containers', ['webApp'])
    const diff = diffWorkspaces(base, head)
    expect(diff.views).toEqual([])
  })
})

describe('diffWorkspaces — workspace fields', () => {
  it('reports name, description and scope changes', () => {
    const head = clone(makeWorkspace())
    head.name = 'Shop v2'
    head.description = 'A better store'
    head.scope = 'landscape'
    const diff = diffWorkspaces(makeWorkspace(), head)
    expect(diff.workspaceChanges).toEqual([
      { field: 'name', before: 'Shop', after: 'Shop v2' },
      { field: 'description', before: 'An e-commerce platform', after: 'A better store' },
      { field: 'scope', before: '', after: 'landscape' },
    ])
    expect(diff.identical).toBe(false)
    expect(formatDiffSummary(diff)).toBe('3 workspace field changed')
  })
})

describe('diffWorkspaces — determinism', () => {
  it('produces identical output for repeated runs over the same inputs', () => {
    const base = makeWorkspace()
    const head = clone(makeWorkspace())
    head.model.people.push(person('ops', 'Ops'))
    head.model.softwareSystems[0].containers[1].technology = 'PostgreSQL'
    head.model.relationships.push({
      id: 'r3', sourceId: 'ops', destinationId: 'db', description: 'Backs up', tags: [], properties: {},
    })

    const first = diffWorkspaces(base, head)
    const second = diffWorkspaces(base, head)
    expect(JSON.stringify(second.elements)).toBe(JSON.stringify(first.elements))
    expect(JSON.stringify(second.relationships)).toBe(JSON.stringify(first.relationships))
    expect(JSON.stringify(second.views)).toBe(JSON.stringify(first.views))
    expect(second.summary).toEqual(first.summary)
  })

  it('is not symmetric — swapping the revisions swaps added and removed', () => {
    const head = clone(makeWorkspace())
    head.model.people.push(person('ops', 'Ops'))
    const forward = diffWorkspaces(makeWorkspace(), head)
    const backward = diffWorkspaces(head, makeWorkspace())
    expect(forward.summary.added).toBe(1)
    expect(backward.summary.removed).toBe(1)
  })
})

describe('diffWorkspaces — real DSL revisions', () => {
  const V1 = `
workspace "Bank" {
  model {
    customer = person "Customer" "Banks online"
    banking = softwareSystem "Internet Banking" {
      web = container "Web App" "Serves pages" "Java"
      db = container "Database" "Stores data" "Oracle"
    }
    customer -> web "Uses" "HTTPS"
    web -> db "Reads from"
  }
  views {
    container banking "Containers" { include * }
  }
}`

  const V2 = `
workspace "Bank" {
  model {
    customer = person "Customer" "Banks online"
    banking = softwareSystem "Internet Banking" {
      web = container "Web App" "Serves pages" "Kotlin"
      db = container "Database" "Stores data" "Oracle"
      api = container "API" "Mobile backend" "Kotlin"
    }
    customer -> web "Uses" "HTTPS"
    web -> db "Reads from"
    api -> db "Reads from"
  }
  views {
    container banking "Containers" { include * }
  }
}`

  it('diffs two parsed revisions the way an engineer would read the patch', () => {
    const base = parseDSL(V1).workspace
    const head = parseDSL(V2).workspace

    const diff = diffWorkspaces(base, head)
    expect(entryFor(diff.elements, 'API')?.kind).toBe('added')
    expect(changeFor(entryFor(diff.elements, 'Web App'), 'technology')).toEqual({
      field: 'technology', before: 'Java', after: 'Kotlin',
    })
    expect(diff.relationships).toEqual([
      expect.objectContaining({ kind: 'added', sourceName: 'API', destinationName: 'Database' }),
    ])
    // The container view gained API too, so the view shows up as changed
    // alongside the re-teched Web App.
    expect(diff.views).toEqual([
      expect.objectContaining({ kind: 'changed', addedElements: ['API'], removedElements: [] }),
    ])
    expect(diff.summary).toMatchObject({ added: 2, removed: 0, changed: 2 })
    expect(formatDiffSummary(diff)).toBe('2 added, 2 changed')
  })

  it('finds no differences between a revision and itself', () => {
    expect(diffWorkspaces(parseDSL(V1).workspace, parseDSL(V1).workspace).identical).toBe(true)
  })

  it('survives the DSL parser reusing generated ids across two parses', () => {
    // Anonymous groups get `p1`, `p2`, … from a counter that keeps climbing
    // for the lifetime of the module, so both parses see different ids for
    // structurally identical content. The diff must still come out empty.
    const dsl = `
workspace "Anon" {
  model {
    group "Core" {
      a = softwareSystem "A"
      b = softwareSystem "B"
    }
  }
}`
    expect(diffWorkspaces(parseDSL(dsl).workspace, parseDSL(dsl).workspace).identical).toBe(true)
  })
})
