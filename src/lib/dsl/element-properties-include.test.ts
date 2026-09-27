import { describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { planIncludedWrites, serializeRoot } from '@/lib/includeWriteback'
import { isWorkspaceShape } from '@/lib/fileIO'
import type { Workspace } from '@/types/model'

// TEA-349: `!` lines inside an element's or relationship's `properties { }`
// block must survive a save, and each root line must keep its place relative
// to them so an override keeps its meaning.

const wrap = (model: string) => `workspace {\nmodel {\n${model}\n}\nviews {}\n}`

async function roundTrip(content: string, files: Record<string, string>) {
  const readInclude = async (path: string) => files[path] ?? null
  const loaded = await loadWorkspaceDocument({ content, readInclude })
  expect(loaded.errors).toEqual([])
  const root = serializeRoot(loaded.workspace)
  const reopened = await loadWorkspaceDocument({ content: root, readInclude })
  expect(reopened.errors).toEqual([])
  return { loaded, root, reopened }
}

describe('element and relationship properties blocks with ! lines (TEA-349)', () => {
  it.each([
    ['root line before include', 'properties {\n"a" "1"\n!include p.dsl\n}', '2', /"a" "1"\s+!include p\.dsl/],
    ['root line after include', 'properties {\n!include p.dsl\n"a" "1"\n}', '1', /!include p\.dsl\s+"a" "1"/],
  ])('keeps an element include and its override order: %s', async (_label, block, expected, shape) => {
    const { loaded, root, reopened } = await roundTrip(
      wrap(`u = person "U" {\n${block}\n}`), { 'p.dsl': '"a" "2"\n' },
    )
    expect(loaded.workspace.model.people[0].properties.a).toBe(expected)
    expect(root).toMatch(shape)
    expect(root).not.toContain('"a" "2"')
    expect(reopened.workspace.model.people[0].properties.a).toBe(expected)
    expect(serializeRoot(reopened.workspace)).toBe(root)
  })

  it('keeps the include in a nested container and component', async () => {
    const model = 's = softwareSystem "S" {\nc = container "C" {\nproperties {\n!include p.dsl\n}\n'
      + 'k = component "K" {\nproperties {\n"b" "1"\n!include p.dsl\n}\n}\n}\n}'
    const { root, reopened } = await roundTrip(wrap(model), { 'p.dsl': '"a" "2"\n' })
    expect(root.match(/!include p\.dsl/g)).toHaveLength(2)
    expect(root).not.toContain('"a" "2"')
    const container = reopened.workspace.model.softwareSystems[0].containers[0]
    expect(container.properties).toEqual({ a: '2' })
    expect(container.components[0].properties).toEqual({ b: '1', a: '2' })
  })

  it('keeps a relationship include', async () => {
    const model = 'a = person "A"\nb = softwareSystem "B"\na -> b "Uses" {\nproperties {\n"k" "root"\n!include p.dsl\n}\n}'
    const { root, reopened } = await roundTrip(wrap(model), { 'p.dsl': '"k" "shared"\n' })
    expect(root).toMatch(/"k" "root"\s+!include p\.dsl/)
    expect(root).not.toContain('"shared"')
    expect(reopened.workspace.model.relationships[0].properties.k).toBe('shared')
  })

  it('writes a property added since load after the include', async () => {
    const { loaded } = await roundTrip(wrap('u = person "U" {\nproperties {\n!include p.dsl\n}\n}'), { 'p.dsl': '"a" "2"\n' })
    loaded.workspace.model.people[0].properties.added = 'new'
    expect(serializeRoot(loaded.workspace)).toMatch(/!include p\.dsl\s+"added" "new"/)
  })

  it('leaves the read-only included file unwritten', async () => {
    const { loaded } = await roundTrip(wrap('u = person "U" {\nproperties {\n!include p.dsl\n}\n}'), { 'p.dsl': '"a" "2"\n' })
    expect(loaded.workspace.includedFiles?.[0]).toMatchObject({ path: 'p.dsl', writable: false })
    expect(planIncludedWrites(loaded.workspace)).toEqual([])
  })

  it('keeps ! lines in a single document without include resolution', () => {
    const dsl = wrap('u = person "U" {\nproperties {\n"a" "1"\n!include p.dsl\n}\n}')
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const saved = serializeDSL(parsed.workspace)
    expect(saved).toMatch(/"a" "1"\s+!include p\.dsl/)
    expect(serializeDSL(parseDSL(saved).workspace)).toBe(saved)
  })

  it('records no layout for a block without ! lines', () => {
    const parsed = parseDSL(wrap('u = person "U" {\nproperties {\n"a" "1"\n}\n}'))
    expect(parsed.workspace.model.people[0].propertyLayout).toBeUndefined()
  })

  it('survives a JSON save and reload', async () => {
    const { loaded } = await roundTrip(wrap('u = person "U" {\nproperties {\n!include p.dsl\n}\n}'), { 'p.dsl': '"a" "2"\n' })
    const json = JSON.parse(JSON.stringify(loaded.workspace))
    expect(isWorkspaceShape(json)).toBe(true)
    json.model.people[0].propertyLayout.directives = [{ raw: 42 }]
    expect(isWorkspaceShape(json)).toBe(false)
  })
})

describe('edits to a key last set by a read-only include (TEA-349)', () => {
  const files = { 'p.dsl': '"a" "2"\n' }

  it.each([
    ['workspace', 'workspace {\nproperties {\n"a" "1"\n!include p.dsl\n}\nmodel {}\nviews {}\n}',
      (ws: Workspace) => ws.properties!],
    ['element', wrap('u = person "U" {\nproperties {\n"a" "1"\n!include p.dsl\n}\n}'),
      (ws: Workspace) => ws.model.people[0].properties],
  ])('writes the new %s value after the include', async (_label, content, holder) => {
    const { loaded } = await roundTrip(content, files)
    expect(holder(loaded.workspace).a).toBe('2')
    holder(loaded.workspace).a = '3'
    const root = serializeRoot(loaded.workspace)
    expect(root).toMatch(/"a" "1"\s+!include p\.dsl\s+"a" "3"/)
    const reopened = await loadWorkspaceDocument({ content: root, readInclude: async (p) => files[p as 'p.dsl'] ?? null })
    expect(holder(reopened.workspace).a).toBe('3')
    expect(serializeRoot(reopened.workspace)).toBe(root)
  })

  it('adds no line while the value is unchanged', async () => {
    const { root } = await roundTrip(wrap('u = person "U" {\nproperties {\n"a" "1"\n!include p.dsl\n}\n}'), files)
    expect(root.match(/"a"/g)).toHaveLength(1)
  })

  it('still writes the edit into a writable include', async () => {
    const content = 'workspace {\nmodel {\n!include defaults.dsl\n}\nviews {}\n}'
    const readInclude = async () => 'properties {\n"team" "platform"\n}\n'
    const loaded = await loadWorkspaceDocument({ content, readInclude })
    expect(loaded.workspace.includedFiles?.[0].writable).toBe(true)
    loaded.workspace.model.properties!.team = 'edited'
    expect(serializeRoot(loaded.workspace)).not.toContain('"team"')
    expect(planIncludedWrites(loaded.workspace)[0].content).toContain('"team" "edited"')
  })
})

describe('property precedence across serialization paths', () => {
  const holders = [
    {
      name: 'element',
      model: (blocks: string) => `u = person "U" {\n${blocks}\n}`,
      properties: (ws: Workspace) => ws.model.people[0].properties,
    },
    {
      name: 'relationship',
      model: (blocks: string) => `a = person "A"\nb = softwareSystem "B"\na -> b "Uses" {\n${blocks}\n}`,
      properties: (ws: Workspace) => ws.model.relationships[0].properties,
    },
  ]

  for (const holder of holders) {
    it(`keeps an edited included ${holder.name} property through JSON-to-DSL serialization`, async () => {
      const readInclude = async () => '"team" "original"\n'
      const loaded = await loadWorkspaceDocument({
        content: wrap(holder.model('properties {\n!include p.dsl\n}')),
        readInclude,
      })
      holder.properties(loaded.workspace).team = 'edited'
      // WelcomeScreen's JSON import serializes the complete workspace.
      const json: Workspace = JSON.parse(JSON.stringify(loaded.workspace))
      expect(isWorkspaceShape(json)).toBe(true)
      const saved = serializeDSL(json)
      const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
      expect(reopened.errors).toEqual([])
      expect(holder.properties(reopened.workspace).team).toBe('edited')
    })

    it.each([false, true])(`keeps plain blocks around an included ${holder.name} block (root last: %s)`, async (rootLast) => {
      let included = '"team" "same"\n'
      const readInclude = async () => included
      const plain = 'properties {\n"team" "same"\n}'
      const directive = 'properties {\n!include p.dsl\n}'
      const content = wrap(holder.model(rootLast ? `${directive}\n${plain}` : `${plain}\n${directive}`))
      const loaded = await loadWorkspaceDocument({ content, readInclude })
      expect(loaded.errors).toEqual([])
      const saved = serializeRoot(loaded.workspace)
      expect(saved).toMatch(rootLast ? /!include p\.dsl\s+"team" "same"/ : /"team" "same"\s+!include p\.dsl/)
      // Equal values at load time must not erase an explicitly authored override.
      included = '"team" "changed"\n'
      const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
      expect(reopened.errors).toEqual([])
      expect(holder.properties(reopened.workspace).team).toBe(rootLast ? 'same' : 'changed')
      expect(serializeRoot(reopened.workspace)).toBe(saved)
    })
  }
})
