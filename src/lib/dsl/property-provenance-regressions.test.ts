import { describe, it, expect } from 'vitest'
import { loadWorkspaceDocument } from '../workspaceDocument'
import { serializeRoot, planIncludedWrites } from '../includeWriteback'
import { serializeDSL } from './index'
import { duplicateElementsInTree } from '@/store/workspace-helpers'
import type { Workspace } from '@/types/model'
const wrap = (model: string) => `workspace {\nmodel {\n${model}\n}\nviews {\nsystemLandscape v {\ninclude *\n}\n}\n}`
const person = (props: string) => `u = person "U" {\nproperties {\n${props}\n}\n}`
it('duplicate included person keeps its properties', async () => {
  const files: Record<string, string> = { 'model.dsl': person('!include props.dsl'), 'props.dsl': '"a" "value"\n' }
  const readInclude = async (p: string) => files[p] ?? null
  const { workspace: ws, errors } = await loadWorkspaceDocument({ content: wrap('!include model.dsl'), readInclude })
  expect(errors).toEqual([])
  const ids = duplicateElementsInTree(ws, [ws.model.people[0].id], 'v', () => 'copy')
  expect(ids).toHaveLength(1)
  const saved = serializeRoot(ws)
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.people.find(p => p.id === 'copy')?.properties.a).toBe('value')
})

it('full serialization retains root override across nested includes', async () => {
  const files: Record<string, string> = { 'outer.dsl': '!include inner.dsl\n', 'inner.dsl': '"a" "inner"\n' }
  const readInclude = async (p: string) => files[p] ?? null
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap(person('!include outer.dsl\n"a" "root"')), readInclude })
  const saved = serializeDSL(ws)
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.people[0].properties.a).toBe('root')
})

it('full serialization keeps edits from writable model include', async () => {
  const readInclude = async () => 'properties {\n"team" "old"\n}\n'
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap('!include model.dsl'), readInclude })
  expect(ws.includedFiles?.[0].writable).toBe(true)
  ws.model.properties!.team = 'new'
  const saved = serializeDSL(ws)
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.properties!.team).toBe('new')
})

it('location edit survives property include', async () => {
  const readInclude = async () => '"c4hero.location" "External"\n'
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap(person('!include props.dsl')), readInclude })
  ws.model.people[0].location = 'Internal'
  const saved = serializeRoot(ws)
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.people[0].location).toBe('Internal')
})

it('unchanged normalized status still follows include', async () => {
  let included = '"c4hero.status" "Live "\n'
  const readInclude = async () => included
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap(person('!include props.dsl')), readInclude })
  expect(ws.model.people[0].status).toBe('Live')
  const saved = serializeRoot(ws)
  included = '"c4hero.status" "Deprecated"\n'
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.people[0].status).toBe('Deprecated')
})

it('does not silently substitute a backslash group separator', async () => {
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap('group "Outer" {\ngroup "Inner" {\nu = person "U"\n}\n}') })
  ws.model.properties = { 'structurizr.groupSeparator': String.fromCharCode(92) }
  expect(() => serializeDSL(ws)).toThrow(/group separator/)
})

it('duplicated nested elements and their relationships retain properties in a writable include', async () => {
  const files: Record<string, string> = {
    'model.dsl': 's = softwareSystem "S" {\na = container "A"\nb = container "B"\na -> b "Uses"\n}',
    'props.dsl': '"team" "platform"\n',
  }
  const loaded = await loadWorkspaceDocument({
    content: `workspace {\nmodel {\n!include model.dsl\n}\nviews {\ncontainer s v {\ninclude *\n}\n}\n}`,
    readInclude: async p => files[p] ?? null,
  })
  expect(loaded.errors).toEqual([])
  expect(loaded.workspace.includedFiles?.[0].writable).toBe(true)
  const template = await loadWorkspaceDocument({
    content: wrap(person('!include props.dsl')),
    readInclude: async p => files[p] ?? null,
  })
  const ws = loaded.workspace
  // Model imported from JSON: the holder now belongs to model.dsl, but its
  // property declarations still describe root-owned content and its include.
  const source = template.workspace.model.people[0]
  for (const c of ws.model.softwareSystems[0].containers) {
    c.properties = { ...source.properties }
    c.propertyLayout = structuredClone(source.propertyLayout)
  }
  ws.model.relationships[0].properties = { ...source.properties }
  ws.model.relationships[0].propertyLayout = structuredClone(source.propertyLayout)
  let next = 0
  const ids = duplicateElementsInTree(ws, ws.model.softwareSystems[0].containers.map(c => c.id), 'v', () => `copy${++next}`)
  expect(ids).toHaveLength(2)
  // New keys must be written into a holder's own file, even with a layout.
  ws.model.softwareSystems[0].containers[0].properties.added = 'new'
  for (const write of planIncludedWrites(ws)) files[write.path] = write.content
  const reopened = await loadWorkspaceDocument({ content: serializeRoot(ws), readInclude: async p => files[p] ?? null })
  expect(reopened.errors).toEqual([])
  for (const id of ids) {
    expect(reopened.workspace.model.softwareSystems[0].containers.find(c => c.id === id)?.properties.team).toBe('platform')
  }
  expect(reopened.workspace.model.relationships.find(r => r.sourceId === ids[0])?.properties.team).toBe('platform')
  expect(reopened.workspace.model.softwareSystems[0].containers[0].properties.added).toBe('new')
})

it('an intentional normalized status edit overrides a read-only include', async () => {
  const readInclude = async () => '"c4hero.status" "Live "\n'
  const { workspace } = await loadWorkspaceDocument({ content: wrap(person('!include props.dsl')), readInclude })
  workspace.model.people[0].status = 'Planned'
  const reopened = await loadWorkspaceDocument({ content: serializeRoot(workspace), readInclude })
  expect(reopened.workspace.model.people[0].status).toBe('Planned')
})

it('saves an unrepresentable group separator when no groups are nested', async () => {
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap('properties {\n"structurizr.groupSeparator" ""\n}\ngroup "G" {\nu = person "U"\n}') })
  expect(() => serializeDSL(ws)).not.toThrow()
  expect(() => serializeRoot(ws)).not.toThrow()
})

it('full serialization writes an edited element property from its own included file once', async () => {
  const files: Record<string, string> = { 'a.dsl': person('"b" "1"\n!include p.dsl'), 'p.dsl': '"c" "2"\n' }
  const readInclude = async (p: string) => files[p] ?? null
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap('!include a.dsl'), readInclude })
  ws.model.people[0].properties.b = '9'
  const saved = serializeDSL(ws)
  expect(saved).toMatch(/"b" "9"\s*!include p\.dsl/)
  expect(saved.match(/"b" "9"/g)).toHaveLength(1)
  // The person is written inline, so the include that declared it is not (TEA-352).
  expect(saved).not.toContain('!include a.dsl')
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.errors).toEqual([])
  expect(reopened.workspace.model.people).toHaveLength(1)
  expect(reopened.workspace.model.people[0].properties).toEqual({ b: '9', c: '2' })
})

it('full serialization writes an edited workspace property once', async () => {
  const readInclude = async () => '"a" "2"\n'
  const { workspace: ws } = await loadWorkspaceDocument({
    content: 'workspace {\nproperties {\n"a" "1"\n!include w.dsl\n}\nmodel {\n}\n}',
    readInclude,
  })
  ws.properties!.a = '3'
  const saved = serializeDSL(ws)
  expect(saved.match(/"a" "3"/g)).toHaveLength(1)
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.properties!.a).toBe('3')
})

// TEA-352: the same for an include inside an element's block and in views.
it('full serialization writes the content of element and views includes once', async () => {
  const files: Record<string, string> = {
    'containers.dsl': 'c = container "C" {\nproperties {\n"b" "1"\n}\n}\n',
    'views.dsl': 'systemContext s ctx {\ninclude *\n}\n',
  }
  const readInclude = async (p: string) => files[p] ?? null
  const content = 'workspace {\nmodel {\ns = softwareSystem "S" {\n!include containers.dsl\n}\n}\nviews {\n!include views.dsl\n}\n}'
  const { workspace: ws, errors } = await loadWorkspaceDocument({ content, readInclude })
  expect(errors).toEqual([])
  ws.model.softwareSystems[0].containers[0].properties.b = '9'
  const saved = serializeDSL(ws)
  expect(saved).not.toContain('!include')
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.errors).toEqual([])
  expect(reopened.workspace.model.softwareSystems[0].containers).toHaveLength(1)
  expect(reopened.workspace.model.softwareSystems[0].containers[0].properties.b).toBe('9')
  expect(reopened.workspace.views.systemContextViews.map(v => v.key)).toEqual(['ctx'])
})

it('full serialization writes an included file once without includedFiles', async () => {
  const readInclude = async () => 'u = person "U" {\nproperties {\n"b" "1"\n}\n}\n'
  const { workspace } = await loadWorkspaceDocument({ content: wrap('!include a.dsl'), readInclude })
  workspace.model.people[0].properties.b = '9'
  const json: Workspace = JSON.parse(JSON.stringify(workspace))
  delete json.includedFiles
  const saved = serializeDSL(json)
  expect(saved).not.toContain('!include a.dsl')
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.workspace.model.people).toHaveLength(1)
  expect(reopened.workspace.model.people[0].properties.b).toBe('9')
})

it('full serialization rewrites a kept include from a folder relative to the root', async () => {
  const files: Record<string, string> = { 'sub/a.dsl': person('!include p.dsl'), 'sub/p.dsl': '"a" "2"\n' }
  const readInclude = async (p: string) => files[p] ?? null
  const { workspace, errors } = await loadWorkspaceDocument({ content: wrap('!include sub/a.dsl'), readInclude })
  expect(errors).toEqual([])
  const saved = serializeDSL(workspace)
  expect(saved).toContain('!include sub/p.dsl')
  const reopened = await loadWorkspaceDocument({ content: saved, readInclude })
  expect(reopened.errors).toEqual([])
  expect(reopened.workspace.model.people[0].properties.a).toBe('2')
})

it('full serialization keeps an include it did not load', async () => {
  const { workspace: ws } = await loadWorkspaceDocument({
    content: wrap('!include a.dsl\n!include https://example.com/b.dsl'),
    readInclude: async () => 'u = person "U"\n',
  })
  const saved = serializeDSL(ws)
  expect(saved).not.toContain('!include a.dsl')
  expect(saved).toContain('!include https://example.com/b.dsl')
})

// TEA-351: values from an included properties file.
describe('values from an included properties file', () => {
  const load = async (root: string, files: Record<string, string>) => {
    const readInclude = async (p: string) => files[p] ?? null
    const { workspace, errors } = await loadWorkspaceDocument({ content: wrap(root), readInclude })
    expect(errors).toEqual([])
    return { workspace, reload: (content: string) => loadWorkspaceDocument({ content, readInclude }) }
  }

  it('deleting an included value writes the remaining ones in place of the include', async () => {
    const { workspace: ws, reload } = await load(
      person('"z" "0"\n!include p.dsl\n"a" "root"\n!include q.dsl'),
      { 'p.dsl': '"a" "2"\n"b" "3"\n', 'q.dsl': '"b" "4"\n"c" "5"\n' },
    )
    expect(ws.model.people[0].properties).toEqual({ z: '0', a: 'root', b: '4', c: '5' })
    delete ws.model.people[0].properties.a
    const saved = serializeRoot(ws)
    // p.dsl is replaced by its remaining line, in its place; q.dsl stays.
    expect(saved).toMatch(/"z" "0"\s+"b" "3"\s+!include q\.dsl/)
    expect(saved).not.toContain('!include p.dsl')
    const reopened = await reload(saved)
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.model.people[0].properties).toEqual({ z: '0', b: '4', c: '5' })
    expect(serializeRoot(reopened.workspace)).toBe(saved)
  })

  it('deleting a value from a nested include replaces the outer include', async () => {
    const { workspace: ws, reload } = await load(
      person('!include outer.dsl\n!include other.dsl'),
      { 'outer.dsl': '"o" "1"\n!include inner.dsl\n', 'inner.dsl': '"i" "2"\n"j" "3"\n', 'other.dsl': '"x" "4"\n' },
    )
    delete ws.model.people[0].properties.i
    const saved = serializeRoot(ws)
    expect(saved).not.toContain('outer.dsl')
    expect(saved).toContain('!include other.dsl')
    const reopened = await reload(saved)
    expect(reopened.workspace.model.people[0].properties).toEqual({ o: '1', j: '3', x: '4' })
  })

  it.each([
    ['status', '"c4hero.status" "Live"\n', (ws: Workspace) => { delete ws.model.people[0].status }],
    ['owner', '"owner" "Team"\n', (ws: Workspace) => { delete ws.model.people[0].owner }],
    ['location', '"c4hero.location" "External"\n', (ws: Workspace) => { delete ws.model.people[0].location }],
  ])('clearing an included %s persists', async (_label, included, clear) => {
    const { workspace: ws, reload } = await load(person('!include p.dsl'), { 'p.dsl': `"a" "1"\n${included}` })
    clear(ws)
    const reopened = await reload(serializeRoot(ws))
    const u = reopened.workspace.model.people[0]
    expect([u.status, u.owner, u.location]).toEqual([undefined, undefined, undefined])
    expect(u.properties).toEqual({ a: '1' })
  })

  it('keeps the include when no included value was deleted', async () => {
    const { workspace: ws } = await load(person('!include p.dsl'), { 'p.dsl': '"a" "1"\n"blank" ""\n' })
    ws.model.people[0].properties.added = 'x'
    expect(serializeRoot(ws)).toMatch(/!include p\.dsl\s+"added" "x"/)
  })

  it('saves location Unspecified over an included location as the location', async () => {
    const { workspace: ws, reload } = await load(person('!include p.dsl'), { 'p.dsl': '"c4hero.location" "External"\n' })
    ws.model.people[0].location = 'Unspecified'
    const saved = serializeRoot(ws)
    const reopened = await reload(saved)
    expect(reopened.workspace.model.people[0].location).toBe('Unspecified')
    expect(reopened.workspace.model.people[0].properties).toEqual({})
    expect(serializeRoot(reopened.workspace)).toBe(saved)
  })

  it('leaves an included location in its file', async () => {
    const files: Record<string, string> = { 'p.dsl': '"c4hero.location" "External"\n' }
    const { workspace: ws, reload } = await load(person('!include p.dsl'), files)
    expect(ws.model.people[0].location).toBe('External')
    const saved = serializeRoot(ws)
    expect(saved).not.toContain('External')
    files['p.dsl'] = '"c4hero.location" "Internal"\n'
    const reopened = await reload(saved)
    expect(reopened.workspace.model.people[0].location).toBe('Internal')
  })

  it('keeps an External tag written in the root next to an included location', async () => {
    const { workspace: ws, reload } = await load(
      'u = person "U" "" "External" {\nproperties {\n!include p.dsl\n}\n}', { 'p.dsl': '"c4hero.location" "External"\n' },
    )
    const saved = serializeRoot(ws)
    expect(saved).toContain('person "U" "" "External"')
    expect((await reload(saved)).workspace.model.people[0].location).toBe('External')
  })

  it.each([
    ['set over an included External', '"c4hero.location" "External"\n"a" "1"\n', (ws: Workspace) => { ws.model.people[0].location = 'Unspecified' }],
    ['read from the include', '"c4hero.location" "Unspecified"\n"a" "1"\n', () => {}],
  ])('Unspecified %s leaves no stray property once the include is replaced', async (_label, included, edit) => {
    const { workspace: ws, reload } = await load(person('!include p.dsl'), { 'p.dsl': included })
    edit(ws)
    delete ws.model.people[0].properties.a
    const saved = serializeRoot(ws)
    expect(saved).not.toContain('!include')
    const u = (await reload(saved)).workspace.model.people[0]
    // As in a block without includes, Unspecified is not written.
    expect(u.properties).toEqual({})
    expect(u.location).toBeUndefined()
  })

  it('full serialization keeps an edited included value without includedFiles', async () => {
    const { workspace: ws, reload } = await load(person('!include p.dsl'), { 'p.dsl': '"a" "2"\n' })
    ws.model.people[0].properties.a = '5'
    const json: Workspace = JSON.parse(JSON.stringify(ws))
    delete json.includedFiles
    const saved = serializeDSL(json)
    expect(saved).toMatch(/!include p\.dsl\s+"a" "5"/)
    expect((await reload(saved)).workspace.model.people[0].properties.a).toBe('5')
  })
})

// TEA-353
it('a duplicated relationship between nested copies goes to their file', async () => {
  const files: Record<string, string> = {
    'a.dsl': 's = softwareSystem "S" {\nx = container "X"\ny = container "Y"\nx -> y "Uses"\n}\n',
  }
  const readInclude = async (p: string) => files[p] ?? null
  const content = 'workspace {\nmodel {\n!include a.dsl\n}\nviews {\ncontainer s v {\ninclude *\n}\n}\n}'
  const { workspace: ws } = await loadWorkspaceDocument({ content, readInclude })
  expect(ws.includedFiles?.[0].writable).toBe(true)
  let next = 0
  const ids = duplicateElementsInTree(ws, ['x', 'y'], 'v', () => `copy${++next}`)
  const copy = ws.model.relationships.find(r => r.sourceId === ids[0])
  expect(copy?.sourcePath).toBe('a.dsl')
  const root = serializeRoot(ws)
  for (const write of planIncludedWrites(ws)) files[write.path] = write.content
  expect(files['a.dsl']).toContain(`${ids[0]} -> ${ids[1]}`)
  const reopened = await loadWorkspaceDocument({ content: root, readInclude })
  expect(reopened.errors).toEqual([])
  const reloaded = reopened.workspace.model.relationships.find(r => r.sourceId === ids[0])
  expect(reloaded).toMatchObject({ destinationId: ids[1], sourcePath: 'a.dsl' })
})

it('a duplicated relationship between top-level copies stays in the root', async () => {
  const files: Record<string, string> = { 'a.dsl': 'p = person "P"\nq = softwareSystem "Q"\np -> q "Uses"\n' }
  const { workspace: ws } = await loadWorkspaceDocument({ content: wrap('!include a.dsl'), readInclude: async (p) => files[p] ?? null })
  let next = 0
  const ids = duplicateElementsInTree(ws, ['p', 'q'], 'v', () => `copy${++next}`)
  expect(ws.model.relationships.find(r => r.sourceId === ids[0])?.sourcePath).toBeUndefined()
})
