import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// An in-memory folder standing in for the File System Access API.
const fs = new Map<string, string>()
let folderHandle = { name: 'shop' } as FileSystemDirectoryHandle
const folders = new Map<FileSystemDirectoryHandle, Map<string, string>>()
let folderOpen = true
/** When set, directory listings wait on it — lets a test hold a load in flight. */
let gate: Promise<void> | null = null
let failReads = false
const failWrites = new Set<string>()

vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: () => (folderOpen ? folderHandle : null),
  listFilesAt: vi.fn(async (dir: string, handle = folderHandle) => {
    const files = folders.get(handle)!
    if (gate) await gate
    const prefix = `${dir}/`
    const names = [...files.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map((p) => p.slice(prefix.length))
    return names.length ? names.sort() : null
  }),
  readTextFileAt: vi.fn(async (path: string, handle = folderHandle) => {
    if (failReads) throw new Error('Document too large')
    return folders.get(handle)!.get(path) ?? null
  }),
  writeTextFileAt: vi.fn(async (path: string, content: string, handle = folderHandle) => {
    if (failWrites.has(path)) return false
    folders.get(handle)!.set(path, content)
    return true
  }),
}))

import { useDocsStore, bundleKey, selectElementDocs, selectElementHasDocs, selectWorkspaceDocs } from './docs'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { readTextFileAt, writeTextFileAt } from '@/lib/folderIO'

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
  folders.clear()
  folderHandle = { name: 'shop' } as FileSystemDirectoryHandle
  folders.set(folderHandle, fs)
  folderOpen = true
  gate = null
  failReads = false
  failWrites.clear()
  vi.clearAllMocks()
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
    expect(selectElementHasDocs(bundles, ws.model.softwareSystems[0])).toBe(false)
  })

  it('drops a load that is still in flight when the store is reset or reloaded', async () => {
    fs.set('docs/overview.md', '# Overview')
    const ws = loadWs()
    let release!: () => void
    gate = new Promise<void>((resolve) => { release = resolve })
    const stale = useDocsStore.getState().load(ws)
    useDocsStore.getState().reset()
    release()
    await stale
    expect(useDocsStore.getState().bundles).toEqual({})
    expect(useDocsStore.getState().loaded).toBe(false)

    // A newer load wins over an older one that finishes later.
    gate = new Promise<void>((resolve) => { release = resolve })
    const older = useDocsStore.getState().load(ws)
    gate = null
    fs.set('docs/second.md', '# Second')
    await useDocsStore.getState().load(ws)
    release()
    await older
    expect(selectWorkspaceDocs(useDocsStore.getState().bundles, ws).docs.map((c) => c.title)).toEqual(['Overview', 'Second'])
  })

  it('is empty without an open folder', async () => {
    folderOpen = false
    fs.set('docs/overview.md', '# Overview')
    await useDocsStore.getState().load(loadWs())
    expect(useDocsStore.getState().bundles).toEqual({})
    expect(useDocsStore.getState().loaded).toBe(true)
  })

  it('keeps every read on the captured folder and drops its result after changing folders', async () => {
    const original = folderHandle
    fs.set('docs/overview.md', '# Original folder')
    let release!: () => void
    gate = new Promise<void>((resolve) => { release = resolve })
    const loading = useDocsStore.getState().load(loadWs())
    folderHandle = { name: 'other' } as FileSystemDirectoryHandle
    folders.set(folderHandle, new Map([['docs/overview.md', '# Other folder']]))
    release()
    await loading
    expect(readTextFileAt).toHaveBeenCalledWith('docs/overview.md', original)
    expect(useDocsStore.getState().bundles).toEqual({})
    expect(useDocsStore.getState().loaded).toBe(false)
  })
})

describe('useDocsStore.create', () => {
  it('resolves null instead of throwing when a read fails mid-way', async () => {
    const ws = loadWs()
    await useDocsStore.getState().load(ws)
    failReads = true
    await expect(useDocsStore.getState().create('docs', {}, { title: 'Overview' })).resolves.toBeNull()
  })

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
    expect(selectElementHasDocs(bundles, useWorkspaceStore.getState().workspace!.model.softwareSystems[0])).toBe(true)
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

  it('returns null and adds no directive when the index write fails', async () => {
    loadWs()
    failWrites.add('adrs/index.md')
    expect(await useDocsStore.getState().create('adrs', {}, { title: 'Unindexed decision' })).toBeNull()
    expect(fs.has('adrs/0001-unindexed-decision.md')).toBe(true)
    expect(fs.has('adrs/index.md')).toBe(false)
    expect(serializeDSL(useWorkspaceStore.getState().workspace!)).not.toContain('!adrs adrs')
  })

  it('finishes files in the captured folder without adding directives to a switched workspace', async () => {
    const original = folderHandle
    loadWs()
    useWorkspaceStore.getState().setActiveWorkspaceFilename('first.dsl')
    let started!: () => void
    const writing = new Promise<void>((resolve) => { started = resolve })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(writeTextFileAt).mockImplementationOnce(async (path, content, handle) => {
      started()
      await blocked
      folders.get(handle!)!.set(path, content)
      return true
    })
    const creating = useDocsStore.getState().create('adrs', {}, { title: 'Original decision' })
    await writing
    folderHandle = { name: 'other' } as FileSystemDirectoryHandle
    const otherFiles = new Map<string, string>()
    folders.set(folderHandle, otherFiles)
    loadWs()
    useWorkspaceStore.getState().setActiveWorkspaceFilename('second.dsl')
    release()

    expect(await creating).toBeNull()
    expect(writeTextFileAt).toHaveBeenCalledWith('adrs/index.md', expect.any(String), original)
    expect(fs.has('adrs/0001-original-decision.md')).toBe(true)
    expect(fs.get('adrs/index.md')).toContain('Original decision')
    expect(otherFiles.size).toBe(0)
    expect(serializeDSL(useWorkspaceStore.getState().workspace!)).not.toContain('!adrs adrs')
  })
})
