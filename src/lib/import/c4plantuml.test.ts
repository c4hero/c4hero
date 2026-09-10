import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseC4PlantUML } from './c4plantuml'
import { importForeign, detectFormat, ImportError } from './index'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('parseC4PlantUML', () => {
  it('maps every element macro, variants, boundaries and relationships', () => {
    const r = parseC4PlantUML(`@startuml
title Shop
Person(user, "Shopper", "Buys things")
Person_Ext(courier, "Courier")
System_Ext(payments, "Payment Provider", "Takes cards")
SystemDb(warehouse, "Warehouse DB")
SystemQueue_Ext(events, "Event Bus")
System_Boundary(shop, "Shop") {
  Container(web, "Web App", "React", "The storefront")
  ContainerDb(db, "Shop DB", "Postgres")
  ContainerQueue(q, "Orders Queue", "Kafka")
  Container_Ext(cdn, "CDN")
  Container_Boundary(api, "API") {
    Component(orders, "Orders", "Go", "Order handling")
    Component_Ext(auth, "Auth Lib")
  }
}
Rel(user, web, "Uses", "HTTPS")
Rel_R(web, db, "Reads")
BiRel(web, payments, "Charges")
Rel_Back(courier, web, "Gets jobs from")
@enduml`)
    const ws = r.workspace
    expect(ws.name).toBe('Shop')
    expect(ws.model.people.map((p) => [p.id, p.name, p.location])).toEqual([
      ['user', 'Shopper', undefined], ['courier', 'Courier', 'External'],
    ])
    expect(ws.model.softwareSystems.map((s) => [s.id, s.location, s.tags.filter((t) => t !== 'Element' && t !== 'Software System')])).toEqual([
      ['payments', 'External', []], ['warehouse', undefined, ['Database']], ['events', 'External', ['Queue']], ['shop', undefined, []],
    ])
    const shop = ws.model.softwareSystems.find((s) => s.id === 'shop')!
    expect(shop.containers.map((c) => c.id)).toEqual(['web', 'db', 'q', 'cdn', 'api'])
    expect(shop.containers[0].technology).toBe('React')
    expect(shop.containers[0].description).toBe('The storefront')
    expect(shop.containers[1].tags).toContain('Database')
    expect(shop.containers[2].tags).toContain('Queue')
    expect(shop.containers[3].tags).toContain('External')
    const api = shop.containers[4]
    expect(api.components.map((c) => [c.id, c.technology])).toEqual([['orders', 'Go'], ['auth', undefined]])
    expect(api.components[1].tags).toContain('External')
    expect(ws.model.relationships.map((r) => `${r.sourceId}->${r.destinationId}:${r.description ?? ''}:${r.technology ?? ''}`)).toEqual([
      'user->web:Uses:HTTPS', 'web->db:Reads:', 'web->payments:Charges:', 'payments->web:Charges:', 'courier->web:Gets jobs from:',
    ])
    expect(ws.views.configuration.styles.elements).toEqual([{ tag: 'Database', shape: 'Cylinder' }, { tag: 'Queue', shape: 'Pipe' }])
    expect(r.warnings.map((w) => w.message)).toEqual(['BiRel: bidirectional relationship split into two one-way relationships'])
    expect(r.viewHint).toBe('component')
  })

  it('supports $named arguments in any order', () => {
    const r = parseC4PlantUML(`Person($label="Someone", $alias=p1, $descr="d")
System($alias="s", $label="Sys")
Rel($to="s", $from="p1", $label="uses", $techn="HTTP")`)
    expect(r.workspace.model.people[0]).toMatchObject({ id: 'p1', name: 'Someone', description: 'd' })
    expect(r.workspace.model.relationships[0]).toMatchObject({ sourceId: 'p1', destinationId: 's', description: 'uses', technology: 'HTTP' })
  })

  it('turns Boundary / Enterprise_Boundary into groups over the elements inside', () => {
    const r = parseC4PlantUML(`Enterprise_Boundary(ent, "Acme") {
  Person(a, "A")
  Boundary(team, "Team X", "team") {
    System(s1, "S1")
    System(s2, "S2")
  }
}
System(outside, "Outside")`)
    // A parent group contains everything its child groups contain — the
    // serializer's nesting rule.
    expect(r.workspace.model.groups.map((g) => [g.name, g.elementIds, g.parentId])).toEqual([
      ['Acme', ['a', 's1', 's2'], undefined],
      ['Team X', ['s1', 's2'], 'ent'],
    ])
  })

  it('warns, with line numbers, for everything it skips', () => {
    const r = parseC4PlantUML(`@startuml
!include <C4/C4_Context>
!includeurl https://example.com/x.puml
LAYOUT_LEFT_RIGHT()
SHOW_LEGEND()
AddElementTag("x", $bgColor="red")
skinparam backgroundColor white
Person(u, "U", $sprite="person2")
note right of u
  a note
end note
Deployment_Node(n, "Node") {
  Container(c, "C")
}
Lay_D(u, u)
Frobnicate(u)
@enduml`)
    expect(r.warnings.map((w) => `${w.line}: ${w.message}`)).toEqual([
      '2: !include skipped — includes are not resolved (no file or network access)',
      '3: !includeurl skipped — includes are not resolved (no file or network access)',
      '4: LAYOUT_LEFT_RIGHT(…): layout directive skipped',
      '5: SHOW_LEGEND(…): display directive skipped',
      '6: AddElementTag(…): styling macro (not imported yet) skipped',
      '7: skinparam skipped',
      '8: Person(u): sprite "person2" not imported',
      '9: note block skipped',
      '12: Deployment_Node(…): deployment node (deployment import is a follow-up) skipped',
      '15: Lay_D(…): manual layout hint skipped',
      '16: Unrecognised macro Frobnicate(…) skipped',
    ])
    // The container inside the skipped deployment node was skipped with it.
    expect(r.workspace.model.softwareSystems).toEqual([])
    expect(r.workspace.model.people).toHaveLength(1)
  })

  it('gives orphan containers and components a synthesised parent instead of dropping them', () => {
    const r = parseC4PlantUML(`title Orphans
Container(web, "Web", "React")
Component(comp, "Comp", "Go")`)
    const sys = r.workspace.model.softwareSystems[0]
    expect(sys.name).toBe('Orphans')
    expect(sys.containers.map((c) => c.name)).toEqual(['Web', 'Orphans components'])
    expect(sys.containers[1].components[0].name).toBe('Comp')
    expect(r.warnings.map((w) => w.message)).toEqual([
      'Container "Web" declared outside a System_Boundary — placed in a synthesised software system "Orphans"',
      'Component "Comp" declared outside a Container_Boundary — placed in a synthesised container "Orphans components"',
      'No @startuml found — imported as a bare macro list',
    ])
  })

  it('reports unknown relationship ends, missing aliases and unclosed boundaries rather than crashing', () => {
    const r = parseC4PlantUML(`Person(a, "A")
Rel(a, ghost, "Haunts")
Person("", "Nameless")
System_Boundary(open, "Open") {`)
    expect(r.warnings.map((w) => `${w.line}: ${w.message}`)).toEqual([
      '2: Rel: unknown element "ghost" — skipped',
      '3: Person: missing alias — skipped',
      '1: No @startuml found — imported as a bare macro list',
      '4: Boundary never closed — closed at end of input',
    ])
  })

  it('makes aliases DSL-safe and unique', () => {
    const r = parseC4PlantUML(`Person(1st-user, "One")
Person(1st-user, "Two")
System(a.b, "Dotted")`)
    expect(r.workspace.model.people.map((p) => p.id)).toEqual(['e_1st_user', 'e_1st_user2'])
    expect(r.workspace.model.softwareSystems[0].id).toBe('a_b')
  })
})

describe('golden: internet-banking.puml', () => {
  it('imports to the checked-in DSL, which parses clean and round-trips', () => {
    const result = importForeign(fixture('internet-banking.puml'))
    const dsl = serializeDSL(result.workspace)
    expect(dsl).toBe(fixture('internet-banking.golden.dsl'))
    const { errors, workspace } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.length).toBe(result.workspace.model.softwareSystems.length)
    expect(workspace.model.relationships.length).toBe(result.workspace.model.relationships.length)
    expect(result.summary).toEqual({ people: 1, systems: 3, containers: 5, components: 0, relationships: 10 })
    expect(result.viewHint).toBe('container')
    expect(result.initialViewKey).toBeDefined()
    expect(result.workspace.views.containerViews.some((v) => v.key === result.initialViewKey)).toBe(true)
    expect(result.warnings.map((w) => w.line)).toEqual([2, 7])
  })
})

describe('detectFormat / importForeign', () => {
  it('detects each format', () => {
    expect(detectFormat('@startuml\nPerson(a, "A")\n@enduml')).toBe('c4plantuml')
    expect(detectFormat('!include <C4/C4_Context>\nPerson(a,"A")')).toBe('c4plantuml')
    expect(detectFormat('Person(a, "A")')).toBe('c4plantuml')
    expect(detectFormat('C4Context\n  Person(a, "A")')).toBe('mermaid-c4')
    expect(detectFormat('```mermaid\nC4Container\n```')).toBe('mermaid-c4')
    expect(detectFormat('workspace "x" {\n model {} }')).toBe('structurizr')
    expect(detectFormat('hello world')).toBe('unknown')
  })

  it('refuses empty, unknown and Structurizr input with a clear error', () => {
    expect(() => importForeign('   ')).toThrow(ImportError)
    expect(() => importForeign('just prose')).toThrow(/Not recognised/)
    expect(() => importForeign('workspace { model { } }')).toThrow(/already Structurizr DSL/)
    expect(() => importForeign('@startuml\nLAYOUT_TOP_DOWN()\n@enduml')).toThrow(/No people or software systems/)
  })
})
