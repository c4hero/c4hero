import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMermaidC4, stripMermaidFence } from './mermaidC4'
import { importForeign } from './index'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('parseMermaidC4', () => {
  it('strips a markdown fence', () => {
    expect(stripMermaidFence('intro\n```mermaid\nC4Context\n  Person(a, "A")\n```\nafter')).toBe('C4Context\n  Person(a, "A")\n')
    expect(stripMermaidFence('C4Context')).toBe('C4Context')
  })

  it('imports a C4Container block with boundaries, variants and styling directives skipped', () => {
    const r = parseMermaidC4(`C4Container
    title Container diagram for Internet Banking System
    Person(customer, Customer, "A customer of the bank.")
    Container_Boundary(c1, "Internet Banking") {
        Container(spa, "Single-Page App", "JavaScript, Angular", "Provides all the Internet banking functionality")
        ContainerDb(database, "Database", "SQL Database", "Stores user registration information")
        Container(backend_api, "API Application", "Java, Docker Container", "Provides Internet banking functionality via API")
    }
    System_Ext(email_system, "E-Mail System", "The internal Microsoft Exchange system.")
    Rel(customer, spa, "Uses", "HTTPS")
    Rel(spa, backend_api, "Uses", "async, JSON/HTTPS")
    Rel_Back(database, backend_api, "Reads from and writes to", "sync, JDBC")
    UpdateRelStyle(customer, spa, $offsetY="60", $offsetX="90")
    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")`)
    const ws = r.workspace
    expect(ws.name).toBe('Container diagram for Internet Banking System')
    expect(ws.model.people[0]).toMatchObject({ id: 'customer', name: 'Customer' })
    // A Container_Boundary at the top of a C4Container diagram wraps containers
    // (Mermaid's idiom, where PlantUML uses System_Boundary) — so it becomes
    // the software system that owns them.
    const sys = ws.model.softwareSystems.find((s) => s.containers.length > 0)!
    expect(sys.name).toBe('Internet Banking')
    expect(sys.id).toBe('c1')
    expect(sys.containers.map((c) => c.id)).toEqual(['spa', 'database', 'backend_api'])
    expect(ws.model.softwareSystems.find((s) => s.id === 'email_system')?.location).toBe('External')
    expect(ws.model.relationships).toHaveLength(3)
    expect(r.viewHint).toBe('container')
    expect(r.warnings.map((w) => `${w.line}: ${w.message}`)).toEqual([
      '13: UpdateRelStyle(…): styling/layout directive (not imported yet) skipped',
      '14: UpdateLayoutConfig(…): styling/layout directive (not imported yet) skipped',
    ])
  })

  it('imports only the first block and says so', () => {
    const r = parseMermaidC4(`C4Context
  Person(a, "A")
C4Container
  Person(b, "B")`)
    expect(r.workspace.model.people.map((p) => p.id)).toEqual(['a'])
    expect(r.warnings.map((w) => w.message)).toEqual(['Second diagram "C4Container" ignored — only the first block is imported'])
  })

  it('imports C4Dynamic as a static model with a warning', () => {
    const r = parseMermaidC4(`C4Dynamic
  Person(a, "A")
  System(s, "S")
  Rel(a, s, "calls")`)
    expect(r.workspace.model.relationships).toHaveLength(1)
    expect(r.warnings.some((w) => /C4Dynamic imported as a static model/.test(w.message))).toBe(true)
  })

  it('warns when there is no C4 block at all', () => {
    const r = parseMermaidC4('flowchart TD\n  A --> B')
    expect(r.warnings.some((w) => /No C4Context/.test(w.message))).toBe(true)
  })
})

describe('golden: context.mmd', () => {
  it('imports to the checked-in DSL, which parses clean and round-trips', () => {
    const result = importForeign(fixture('context.mmd'))
    expect(result.format).toBe('mermaid-c4')
    const dsl = serializeDSL(result.workspace)
    expect(dsl).toBe(fixture('context.golden.dsl'))
    const { errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(result.summary).toEqual({ people: 4, systems: 8, containers: 0, components: 0, relationships: 6 })
    expect(result.viewHint).toBe('systemContext')
    // Every boundary in a C4Context diagram wraps people/systems, so each
    // became a group; parents contain their children's members. (Order is
    // the parser's — innermost group blocks close first.)
    expect(result.workspace.model.groups.map((g) => [g.name, g.elementIds.length, !!g.parentId])).toEqual([
      ['BankBoundary2', 2, true], ['BankBoundary3', 2, true], ['BankBoundary', 7, true], ['BankBoundary0', 12, false],
    ])
    const messages = result.warnings.map((w) => w.message)
    expect(messages.filter((m) => /BiRel/.test(m))).toHaveLength(2)
    expect(messages.filter((m) => /Update(Element|Rel)Style|UpdateLayoutConfig/.test(m))).toHaveLength(3)
    const lines = result.warnings.map((w) => w.line)
    expect([...lines].sort((a, b) => a - b)).toEqual(lines)
  })
})
