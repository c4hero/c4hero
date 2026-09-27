import { it, expect } from 'vitest'
import { loadWorkspaceDocument } from '../workspaceDocument'
import { serializeRoot, planIncludedWrites } from '../includeWriteback'
import { serializeDSL } from './index'
import { duplicateElementsInTree } from '@/store/workspace-helpers'
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
