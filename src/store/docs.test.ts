import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// An in-memory folder standing in for the File System Access API.
const fs = new Map<string, string>()
let folderOpen = true

vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: () => (folderOpen ? { name: 'shop' } : null),
  listFilesAt: async (dir: string) => {
    const prefix = `${dir}/`
    const names = [...fs.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map((p) => p.slice(prefix.length))
    return names.length ? names.sort() : null
  },
  readTextFileAt: async (path: string) => fs.get(path) ?? null,
  writeTextFileAt: async (path: string, content: string) => { fs.set(path, content); return true },
}))

import { useDocsStore, bundleKey, selectElementDocs, selectElementsWithDocs, selectWorkspaceDocs } from './docs'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const DSL = `
workspace "Shop" {
    !docs docs
    model {
        cust = person "Customer"
        shop = softwareSystem "Shop" {
            !adrs decisions/shop
        }
    }
    views {
        systemContext shop "Context" { include * }
    }
}`

function loadWs() {
  const { workspace } = parseDSL(DSL)
  useWorkspaceStore.getState().loadWorkspace(workspace)
  return useWorkspaceStore.getState().workspace!
}

beforeEach(() => {
  fs.clear()
  folderOpen = true
  useDocsStore.getState().reset()
  vi.useFakeTimers({ now: new Date('2026-09-13T12:00:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDocsStore.load', () => {
  it('reads every referenced bundle and marks missing folders', async () => {
    fs.set('docs/overview.md', '---\ntype: Documentation\ntitle: Overview\n---\n\n# Overview')
    fs.set('docs/index.md', '# Docs')
    const ws = loadWs()
    await useDocsStore.getState().load(ws)
    const { bundles, loaded } = useDocsStore.getState()
    expect(loaded).toBe(true)
    expect(bundles[bundleKey('docs', 'docs')]?.concepts.map((c) => c.title)).toEqual(['Overview'])
    expect(bundles[bundleKey('adrs', 'decisions/shop')]).toBeNull()

    expect(selectWorkspaceDocs(bundles, ws).docs.map((c) => c.title)).toEqual(['Overview'])
    expect(selectElementDocs(bundles, ws, 'shop')).toMatchObject({ adrs: [], missing: [{ kind: 'adrs', dir: 'decisions/shop' }] })
    expect(selectElementsWithDocs(bundles, ws).size).toBe(0)
  })

  it('is empty without an open folder', async () => {
    folderOpen = false
    fs.set('docs/overview.md', '# Overview')
    await useDocsStore.getState().load(loadWs())
    expect(useDocsStore.getState().bundles).toEqual({})
    expect(useDocsStore.getState().loaded).toBe(true)
  })
})

describe('useDocsStore.create', () => {
  it('writes an ADR into an element bundle, numbers it, updates the index, and reloads', async () => {
    fs.set('decisions/shop/0001-first.md', '# 1. First\n\n## Status\n\nAccepted')
    const ws = loadWs()
    await useDocsStore.getState().load(ws)

    const path = await useDocsStore.getState().create('adrs', { elementId: 'shop' }, { title: 'Use Postgres', description: 'Need a DB' })
    expect(path).toBe('decisions/shop/0002-use-postgres.md')
    expect(fs.get(path!)).toContain('type: "Decision"')
    expect(fs.get(path!)).toContain('element: "shop"')
    expect(fs.get(path!)).toContain('timestamp: "2026-09-13T12:00:00.000Z"')
    expect(fs.get('decisions/shop/index.md')).toBe('# Architecture decision records\n\n- [Use Postgres](0002-use-postgres.md) - Need a DB\n')

    const { bundles } = useDocsStore.getState()
    expect(selectElementDocs(bundles, useWorkspaceStore.getState().workspace!, 'shop').adrs.map((c) => c.title)).toEqual(['First', 'Use Postgres'])
    expect(selectElementsWithDocs(bundles, useWorkspaceStore.getState().workspace!)).toEqual(new Set(['shop']))
    // No new directive: the element already declared the folder.
    expect(serializeDSL(useWorkspaceStore.getState().workspace!)).not.toContain('!adrs adrs/shop')
  })

  it('creates the folder and adds the !docs line to the element when none is declared', async () => {
    const ws = loadWs()
    await useDocsStore.getState().load(ws)
    const path = await useDocsStore.getState().create('docs', { elementId: 'cust' }, { title: 'Personas' })
    expect(path).toBe('docs/cust/personas.md')
    expect(fs.get('docs/cust/index.md')).toContain('- [Personas](personas.md)')

    const after = useWorkspaceStore.getState().workspace!
    expect(after.model.people[0].directives).toEqual(['!docs docs/cust'])
    const dsl = serializeDSL(after)
    expect(dsl).toMatch(/cust = person "Customer" \{\n\s+!docs docs\/cust\n\s+\}/)
    expect(parseDSL(dsl).errors).toHaveLength(0)
    // The undo stack recorded the directive so a stray create can be reverted.
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.people[0].directives).toBeUndefined()
  })

  it('adds a workspace-scope !adrs line for a workspace-level decision', async () => {
    const ws = loadWs()
    await useDocsStore.getState().load(ws)
    const path = await useDocsStore.getState().create('adrs', {}, { title: 'Record decisions' })
    expect(path).toBe('adrs/0001-record-decisions.md')
    const after = useWorkspaceStore.getState().workspace!
    expect(after.directives).toContainEqual({ scope: 'workspace', raw: '!adrs adrs' })
    expect(serializeDSL(after)).toContain('!adrs adrs')
    // Second create reuses the folder and directive.
    await useDocsStore.getState().create('adrs', {}, { title: 'Another' })
    expect(after.directives!.filter((d) => d.raw === '!adrs adrs')).toHaveLength(1)
    expect(fs.has('adrs/0002-another.md')).toBe(true)
  })

  it('returns null without an open folder and writes nothing', async () => {
    folderOpen = false
    loadWs()
    expect(await useDocsStore.getState().create('docs', {}, { title: 'X' })).toBeNull()
    expect(fs.size).toBe(0)
  })
})
