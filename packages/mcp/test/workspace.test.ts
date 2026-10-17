import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceSession } from '../src/workspace'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { allViewsOf } from '@/store/workspace-helpers'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const DSL = `workspace "Example" {
    model {
        user = person "Customer"
        shop = softwareSystem "Shop" {
            api = container "API" "Serves requests" "TypeScript"
        }
        user -> shop "Uses"
    }
    views {
        systemLandscape "landscape" {
            include *
            autoLayout lr
        }
        container shop "containers" {
            include *
        }
    }
}
`
const SIDECAR = JSON.stringify({ version: 1, elements: { api: { owner: 'Platform', status: 'Live' } },
  views: { landscape: { locked: true, elements: { user: { pinned: true, x: 30, y: 40 } } } } })
const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(fs.rename).mockClear()
  await Promise.all(dirs.splice(0).map(d => fs.rm(d, { recursive: true, force: true })))
})

async function fixture(dsl = DSL, sidecar: string | null = SIDECAR) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'c4hero-mcp-test-'))
  dirs.push(dir)
  const path = join(dir, 'model.dsl')
  const sidecarPath = join(dir, 'model.c4hero.json')
  await fs.writeFile(path, dsl)
  if (sidecar !== null) await fs.writeFile(sidecarPath, sidecar)
  return { dir, path, sidecarPath, session: await WorkspaceSession.open(path) }
}

const add = { operations: [{ op: 'addPerson', ref: 'newUser', name: 'Operator' }] }
async function propose(session: WorkspaceSession, plan: unknown = add) {
  return session.propose(plan, (await session.getModel()).revision)
}

describe('filesystem workspace plans', () => {
  it('reads model/metadata and filters elements without touching disk', async () => {
    const { dir, path, session } = await fixture()
    const before = await fs.stat(path)
    const model = await session.getModel()
    expect(model.workspace.model.softwareSystems[0].containers[0]).toMatchObject({ id: 'api', owner: 'Platform', status: 'Live' })
    expect((await session.listElements('container', 'shop')).elements.map(e => e.id)).toEqual(['api'])
    expect(model.revision).toMatch(/^[a-f0-9]{64}$/)
    expect((await fs.stat(path)).mtimeMs).toBe(before.mtimeMs)
    expect((await fs.readdir(dir)).sort()).toEqual(['model.c4hero.json', 'model.dsl'])
  })

  it('previews dependency-ordered edits without writes, then writes exactly the reviewed bytes', async () => {
    const { dir, path, sidecarPath, session } = await fixture()
    const plan = { operations: [
      { op: 'addRelationship', source: 'worker', destination: 'newApi', description: 'Calls', technology: 'HTTPS' },
      { op: 'addComponent', ref: 'worker', parent: 'newApi', name: 'Worker', technology: 'Node' },
      { op: 'addContainer', ref: 'newApi', parent: 'shop', name: 'New API' },
      { op: 'updateElement', id: 'worker', name: 'Job Worker', owner: 'Jobs', status: 'Planned', tags: ['Async'] },
      { op: 'addSoftwareSystem', ref: 'vendor', name: 'Vendor', external: true },
      { op: 'addPerson', ref: 'ops', name: 'Operations' },
      { op: 'updateRelationship', id: (await session.getModel()).workspace.model.relationships[0].id, description: 'Browses' },
      { op: 'addView', viewType: 'component', scope: 'newApi', title: 'Workers' },
    ] }
    const preview = await propose(session, plan)
    expect(preview.plan).toEqual(plan)
    expect(preview.result.appliedCount).toBe(8)
    expect(await fs.readFile(path, 'utf8')).toBe(DSL)
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe(SIDECAR)
    expect((await fs.readdir(dir)).length).toBe(2)
    const saved = await session.apply(preview.proposalId)
    expect(await fs.readFile(path, 'utf8')).toBe(preview.preview.dsl)
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe(preview.preview.sidecarJson)
    expect(await fs.readFile(join(saved.backupDirectory, '0.original'), 'utf8')).toBe(DSL)
    expect(await fs.readFile(join(saved.backupDirectory, '1.original'), 'utf8')).toBe(SIDECAR)
    const reopened = await (await WorkspaceSession.open(path)).getModel()
    expect(reopened.revision).toBe(saved.revision)
    const worker = reopened.workspace.model.softwareSystems[0].containers.flatMap(c => c.components)[0]
    expect(worker).toMatchObject({ name: 'Job Worker', owner: 'Jobs', status: 'Planned', technology: 'Node' })
    expect(worker.tags).toEqual(expect.arrayContaining(['Element', 'Component', 'Async']))
    expect(reopened.workspace.model.softwareSystems[0].containers[0]).toMatchObject({ owner: 'Platform', status: 'Live' })
    expect(reopened.workspace.views.systemLandscapeViews[0]).toMatchObject({ locked: true, elements: expect.arrayContaining([{ id: 'user', pinned: true, x: 30, y: 40 }]) })
    expect(reopened.workspace.model.relationships).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: worker.id, description: 'Calls' })]))
    expect(allViewsOf(reopened.workspace).some(v => v.title === 'Workers' && v.elements.some(e => e.id === worker.id))).toBe(true)
    await expect(session.apply(preview.proposalId)).rejects.toThrow('Unknown or expired')
  })

  it('cascades deletion through descendants, relationships, views and layout', async () => {
    const { session } = await fixture()
    const p = await propose(session, { operations: [{ op: 'deleteElement', id: 'shop' }] })
    const result = parseWorkspaceDocument({ content: p.preview.dsl, sidecarJson: p.preview.sidecarJson }).workspace
    expect(result.model.softwareSystems).toEqual([])
    expect(result.model.relationships).toEqual([])
    expect(result.views.containerViews).toEqual([])
    expect(result.views.systemLandscapeViews[0].elements.map(e => e.id)).toEqual(['user'])
  })

  it.each([
    { operations: [{ op: 'bogus' }] },
    { operations: [{ op: 'addPerson', ref: 'p', name: 'P', description: 4 }] },
    { operations: [{ op: 'updateElement', id: 'api', status: 'Broken' }] },
    { operations: [{ op: 'addPerson', ref: 'p', name: 'P', ignored: true }] },
    { operations: Array.from({ length: 301 }, () => add.operations[0]) },
    { operations: [] },
    { operations: [{ op: 'addPerson', ref: 'p', name: '  ' }] },
  ])('rejects malformed plans without side effects: %j', async plan => {
    const { dir, path, session } = await fixture()
    await expect(propose(session, plan)).rejects.toThrow()
    expect(await fs.readFile(path, 'utf8')).toBe(DSL)
    expect((await fs.readdir(dir)).length).toBe(2)
  })

  it.each([
    [{ op: 'addContainer', ref: 'x', parent: 'missing', name: 'X' }],
    [{ op: 'addPerson', ref: 'user', name: 'Collision' }],
    [{ op: 'addPerson', ref: 'p', name: 'P' }, { op: 'addPerson', ref: 'p', name: 'Other' }],
    [{ op: 'updateElement', id: 'shop', location: 'External' }],
    [{ op: 'deleteElement', id: 'Customer' }],
    [{ op: 'addRelationship', source: 'user', destination: 'user' }],
    [{ op: 'deleteElement', id: 'shop' }, { op: 'deleteElement', id: 'api' }],
  ])('rejects the entire plan when an operation cannot apply: %j', async (...operations) => {
    const { path, session } = await fixture()
    await expect(propose(session, { operations: [...add.operations, ...operations] })).rejects.toThrow()
    expect(await fs.readFile(path, 'utf8')).toBe(DSL)
  })

  it('checks the grounded revision before proposal and before apply, including sidecar changes', async () => {
    const { path, sidecarPath, session } = await fixture()
    const initial = await session.getModel()
    const preview = await propose(session)
    await fs.writeFile(sidecarPath, JSON.stringify({ version: 1, views: {} }))
    await expect(session.apply(preview.proposalId)).rejects.toThrow('changed on disk')
    await expect(session.propose(add, initial.revision)).rejects.toThrow('changed since')
    expect(await fs.readFile(path, 'utf8')).toBe(DSL)
    const next = await propose(session)
    await fs.writeFile(path, DSL.replace('Customer', 'Human edit'))
    await expect(session.apply(next.proposalId)).rejects.toThrow('changed on disk')
    expect(await fs.readFile(path, 'utf8')).toContain('Human edit')
  })

  it('detects a sidecar appearing after proposal, expires proposals, and bounds the cache', async () => {
    const { sidecarPath, session } = await fixture(DSL, null)
    const p = await propose(session)
    await fs.writeFile(sidecarPath, SIDECAR)
    await expect(session.apply(p.proposalId)).rejects.toThrow('changed on disk')
    const expired = await propose(session)
    const future = Date.now() + 16 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    await expect(session.apply(expired.proposalId)).rejects.toThrow('expired')
    vi.restoreAllMocks()
    const oldest = await propose(session)
    for (let i = 0; i < 10; i++) await propose(session)
    await expect(session.apply(oldest.proposalId)).rejects.toThrow('Unknown')
  })

  it('creates a sidecar when absent and records absence for recovery', async () => {
    const { session, sidecarPath } = await fixture(DSL, null)
    const p = await propose(session)
    const applied = await session.apply(p.proposalId)
    const manifest = JSON.parse(await fs.readFile(join(applied.backupDirectory, 'manifest.json'), 'utf8'))
    expect(manifest.files[1].original).toBeNull()
    expect(manifest.state).toBe('applied')
    expect(JSON.parse(await fs.readFile(sidecarPath, 'utf8')).version).toBe(1)
  })

  it('serializes competing writers with a filesystem lock', async () => {
    const { path, session } = await fixture()
    const second = await WorkspaceSession.open(path)
    const firstPlan = await propose(session)
    const secondPlan = await propose(second)
    const results = await Promise.allSettled([session.apply(firstPlan.proposalId), second.apply(secondPlan.proposalId)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect((await session.listElements()).elements.filter(e => e.name === 'Operator')).toHaveLength(1)
  })

  it('restores the first file if replacing the second file fails', async () => {
    const { dir, path, sidecarPath, session } = await fixture()
    const preview = await propose(session)
    const rename = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.rename).mockImplementationOnce(rename.rename).mockRejectedValueOnce(new Error('disk failure'))
    await expect(session.apply(preview.proposalId)).rejects.toThrow('Original files restored')
    expect(await fs.readFile(path, 'utf8')).toBe(DSL)
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe(SIDECAR)
    expect(await fs.readdir(dir)).not.toContain('model.dsl.mcp.lock')
  })

  it('retains the lock and backups when rollback fails', async () => {
    const { dir, path, session } = await fixture()
    const preview = await propose(session)
    const rename = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.rename).mockImplementationOnce(rename.rename)
      .mockRejectedValueOnce(new Error('disk failure')).mockRejectedValueOnce(new Error('rollback failure'))
    await expect(session.apply(preview.proposalId)).rejects.toThrow('Manual recovery required; lock retained')
    const backup = (await fs.readdir(dir)).find(name => name.includes('mcp-backup'))!
    expect(await fs.readFile(join(dir, backup, '0.original'), 'utf8')).toBe(DSL)
    expect(await fs.readFile(`${path}.mcp.lock`, 'utf8')).toContain('pid')
    await expect(session.getModel()).rejects.toThrow('locked')
  })

  it('rejects sidecar symlinks without modifying their targets', async () => {
    const { dir, sidecarPath, session } = await fixture()
    const preview = await propose(session)
    const other = join(dir, 'other.json')
    await fs.writeFile(other, SIDECAR)
    await fs.unlink(sidecarPath)
    await fs.symlink(other, sidecarPath)
    await expect(session.apply(preview.proposalId)).rejects.toThrow()
    expect(await fs.readFile(other, 'utf8')).toBe(SIDECAR)
  })

  it('rejects invalid DSL and unsupported sidecars rather than overwriting them', async () => {
    await expect(fixture('workspace { model { broken = person } }')).rejects.toThrow('Invalid DSL')
    await expect(fixture(DSL, '{invalid')).rejects.toThrow('sidecar')
    await expect(fixture(DSL, '{"version":2}')).rejects.toThrow('sidecar')
  })

  it('reads local includes but refuses multi-file writes', async () => {
    const { dir, path } = await fixture()
    await fs.writeFile(join(dir, 'people.dsl'), 'user = person "Included"\n')
    await fs.writeFile(path, 'workspace "Included" {\n model {\n !include people.dsl\n }\n}\n')
    const session = await WorkspaceSession.open(path)
    expect((await session.listElements()).elements[0].name).toBe('Included')
    await expect(propose(session)).rejects.toThrow('single-file')
  })

  it('refuses include paths escaping the configured directory through symlinks', async () => {
    const { dir, path } = await fixture()
    const outside = await fs.mkdtemp(join(tmpdir(), 'c4hero-outside-'))
    dirs.push(outside)
    await fs.writeFile(join(outside, 'people.dsl'), 'user = person "Private"\n')
    await fs.symlink(outside, join(dir, 'escape'))
    await fs.writeFile(path, 'workspace {\n model {\n !include escape/people.dsl\n }\n}\n')
    await expect(WorkspaceSession.open(path)).rejects.toThrow('inside the workspace directory')
  })
})
