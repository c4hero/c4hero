/**
 * Save round-trip, with nothing mocked between `writeLinkedWorkspace` and the
 * file handles.
 *
 * Two properties are asserted together because they pull against each other,
 * and a fix for one is easy to write in a way that breaks the other:
 *
 *   1. Saving a workspace that has not changed must touch no file. The
 *      workspace object changes whenever a workspace is LOADED, so an ungated
 *      save turns "open a diagram" into an edit of the file that diagram came
 *      from — which is what makes two tabs on one folder two writers rather
 *      than one writer and one reader.
 *
 *   2. Moving a node must still reach disk. `updateNodePosition` deliberately
 *      records no undo entry ("Don't push undo for every drag position — too
 *      noisy", view-slice.ts), so any attempt to gate saving on the undo stack
 *      silently stops persisting layout — the single edit this app exists for.
 *
 * The first property is why the byte comparison exists; the second is why it
 * has to live at the file level rather than in a dirtiness flag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setDirHandle, writeDSLFile, writeSidecarFile } from './folderIO'
import { fileAlreadyHas, openDSLFile, writeToCurrentHandle } from './fileIO'
import { writeLinkedWorkspace } from './workspaceSave'
import { isSelfWrite, resetSaveCoordinator } from './saveCoordinator'
import { hashContent } from './fileWatch'
import { parseDSL } from './dsl'
import type { Workspace } from '@/types/model'

const DSL = `workspace "Shop" {
  model {
    u = person "Customer"
    s = softwareSystem "Shop"
    u -> s "buys from"
  }
  views {
    systemContext s "Ctx" {
      include *
    }
  }
}`

/** Files that remember their content and count how many times a writable was
 *  opened on them, so a test can assert a write did NOT happen. */
function makeCountingDirHandle(files: Record<string, string> = {}) {
  const content: Record<string, string> = { ...files }
  const opened: Record<string, number> = {}
  const handleFor = (name: string) => ({
    kind: 'file' as const,
    name,
    getFile: async () => new File([content[name] ?? ''], name, { type: 'text/plain' }),
    createWritable: async () => {
      opened[name] = (opened[name] ?? 0) + 1
      let buf = ''
      return { write: (d: string) => { buf += d }, close: async () => { content[name] = buf } }
    },
  })
  const dir = {
    kind: 'directory',
    name: 'arch',
    entries: async function* () { for (const n of Object.keys(content)) yield [n, handleFor(n)] },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (name in content) return handleFor(name)
      if (opts?.create) { content[name] = ''; return handleFor(name) }
      throw new DOMException('Not found', 'NotFoundError')
    },
    queryPermission: async () => 'granted' as PermissionState,
  } as unknown as FileSystemDirectoryHandle
  return { dir, content, opened }
}

/** Move one node in the first system-context view, the way a drag does. */
function moveFirstNode(workspace: Workspace, x: number, y: number): void {
  const view = workspace.views.systemContextViews[0]
  const element = view.elements[0]
  element.x = x
  element.y = y
  element.pinned = true
}

let rig: ReturnType<typeof makeCountingDirHandle>

beforeEach(async () => {
  resetSaveCoordinator()
  rig = makeCountingDirHandle()
  await setDirHandle(rig.dir)
})

describe('saving the same workspace twice', () => {
  it('writes the first time and touches nothing the second', async () => {
    const workspace = parseDSL(DSL).workspace

    expect(await writeLinkedWorkspace(workspace, 'shop.dsl')).toBe(true)
    const afterFirst = { ...rig.opened }
    expect(afterFirst['shop.dsl']).toBe(1)

    expect(await writeLinkedWorkspace(workspace, 'shop.dsl')).toBe(true)
    expect(rig.opened).toEqual(afterFirst)
  })

  it('reports success when it skips, so the caller still marks the workspace saved', async () => {
    const workspace = parseDSL(DSL).workspace
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    expect(await writeLinkedWorkspace(workspace, 'shop.dsl')).toBe(true)
  })
})

describe('a node drag still reaches disk', () => {
  it('writes the sidecar after a position change, even though no undo entry was recorded', async () => {
    const workspace = parseDSL(DSL).workspace
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    const sidecarWritesBefore = rig.opened['shop.c4hero.json'] ?? 0

    moveFirstNode(workspace, 1234, 5678)
    expect(await writeLinkedWorkspace(workspace, 'shop.dsl')).toBe(true)

    expect(rig.opened['shop.c4hero.json']).toBe(sidecarWritesBefore + 1)
    expect(rig.content['shop.c4hero.json']).toContain('1234')
    expect(rig.content['shop.c4hero.json']).toContain('5678')
  })

  it('leaves the DSL alone when only the layout moved', async () => {
    const workspace = parseDSL(DSL).workspace
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    const dslWritesBefore = rig.opened['shop.dsl']

    moveFirstNode(workspace, 42, 99)
    await writeLinkedWorkspace(workspace, 'shop.dsl')

    expect(rig.opened['shop.dsl']).toBe(dslWritesBefore)
  })

  it('writes the DSL when the model changes, and not merely when it is saved again', async () => {
    const workspace = parseDSL(DSL).workspace
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    const dslWritesBefore = rig.opened['shop.dsl']

    workspace.model.softwareSystems[0].description = 'Now it has a description'
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    expect(rig.opened['shop.dsl']).toBe(dslWritesBefore + 1)

    await writeLinkedWorkspace(workspace, 'shop.dsl')
    expect(rig.opened['shop.dsl']).toBe(dslWritesBefore + 1)
  })
})

describe('the writers themselves', () => {
  it('skip identical content and write changed content', async () => {
    expect(await writeDSLFile('a.dsl', 'workspace "A" {}')).toBe(true)
    expect(rig.opened['a.dsl']).toBe(1)

    expect(await writeDSLFile('a.dsl', 'workspace "A" {}')).toBe(true)
    expect(rig.opened['a.dsl']).toBe(1)

    expect(await writeDSLFile('a.dsl', 'workspace "B" {}')).toBe(true)
    expect(rig.opened['a.dsl']).toBe(2)

    const json = '{"version":1,"views":{}}'
    expect(await writeSidecarFile('a.dsl', json)).toBe(true)
    expect(rig.opened['a.c4hero.json']).toBe(1)
    expect(await writeSidecarFile('a.dsl', json)).toBe(true)
    expect(rig.opened['a.c4hero.json']).toBe(1)
  })
})

describe('the disk watcher still recognises a save that skipped one of its two files', () => {
  // The DSL and the sidecar are written separately, so a save can change one
  // and skip the other. The watcher then observes a MIXED on-disk state, and
  // recognises it as c4hero's own only if BOTH halves are accounted for. That
  // is why the skipped write still records its hash: drop the record and the
  // skip manufactures the very conflict prompt this whole change exists to
  // avoid. Identified in review of PR #222 as the one regression the other
  // tests here would not catch.
  it('records the sidecar hash even when the sidecar write was skipped', async () => {
    const workspace = parseDSL(DSL).workspace
    await writeLinkedWorkspace(workspace, 'shop.dsl')

    // Change only the model, so the sidecar serialises identically and is skipped.
    workspace.model.softwareSystems[0].description = 'Changed, so only the DSL moves'
    const sidecarWritesBefore = rig.opened['shop.c4hero.json'] ?? 0
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    expect(rig.opened['shop.c4hero.json']).toBe(sidecarWritesBefore) // skipped, as designed

    const onDisk = {
      dsl: hashContent(rig.content['shop.dsl']),
      sidecar: hashContent(rig.content['shop.c4hero.json']),
    }
    // A baseline that has moved on, so neither half can be excused as "unchanged
    // since the watcher last looked". Only the recorded hashes can vouch for it.
    const staleBaseline = { dsl: hashContent('something else'), sidecar: hashContent('something else') }

    expect(isSelfWrite(onDisk, staleBaseline)).toBe(true)
  })
})

describe('single-file mode, the other half of the patch', () => {
  /** Install a file handle the way the app does, through the open picker. */
  async function openSingleFile(initial: string) {
    const state = { content: initial, opened: 0 }
    const handle = {
      kind: 'file' as const,
      name: 'single.dsl',
      getFile: async () => new File([state.content], 'single.dsl', { type: 'text/plain' }),
      createWritable: async () => {
        state.opened++
        let buf = ''
        return { write: (d: string) => { buf += d }, close: async () => { state.content = buf } }
      },
    }
    vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [handle]))
    await openDSLFile()
    return state
  }

  it('skips the write when the open file already holds the text', async () => {
    const state = await openSingleFile('workspace "S" {}')
    expect(await writeToCurrentHandle('workspace "S" {}')).toBe(true)
    expect(state.opened).toBe(0)
  })

  it('writes when the open file differs', async () => {
    const state = await openSingleFile('workspace "S" {}')
    expect(await writeToCurrentHandle('workspace "T" {}')).toBe(true)
    expect(state.opened).toBe(1)
    expect(state.content).toBe('workspace "T" {}')
  })
})

describe('the comparison is size-capped like every other read', () => {
  // Pulling an arbitrarily large file into memory just to decide whether to
  // skip a write would be a worse bug than the one being fixed. Past the cap
  // the read throws, and the throw means WRITE — never skip on a failed check.
  it('reports "not already has" for a file past the limit, so the write proceeds', async () => {
    const tooBig = {
      size: 20 * 1024 * 1024,
      text: async () => 'never reached',
    } as unknown as File
    const handle = { getFile: async () => tooBig } as unknown as FileSystemFileHandle
    expect(await fileAlreadyHas(handle, 'never reached')).toBe(false)
  })

  it('still compares normally under the limit', async () => {
    const ok = new File(['exactly this'], 'w.dsl', { type: 'text/plain' })
    const handle = { getFile: async () => ok } as unknown as FileSystemFileHandle
    expect(await fileAlreadyHas(handle, 'exactly this')).toBe(true)
    expect(await fileAlreadyHas(handle, 'something else')).toBe(false)
  })
})

describe('the byte-length short-circuit does not break on non-ASCII', () => {
  // The cheap reject compares file.size (BYTES) against the encoded length of
  // the candidate text. Using content.length instead would compare UTF-16 code
  // units, so any workspace containing an em dash or an accented name would
  // never match its own file and the skip would silently never engage — for
  // exactly the documents most likely to have them. These tests exist to fail
  // loudly if someone "simplifies" the encode away.
  const withEmDashes = 'workspace "Spine — the one table" { model { s = softwareSystem "Café — naïve" "Rødgrød, 日本語, emoji 🙂" } }'

  it('skips a rewrite of text whose bytes outnumber its UTF-16 units', async () => {
    const file = new File([withEmDashes], 'w.dsl', { type: 'text/plain' })
    expect(file.size).toBeGreaterThan(withEmDashes.length) // multi-byte, so the naive check would be wrong
    const handle = { getFile: async () => file } as unknown as FileSystemFileHandle
    expect(await fileAlreadyHas(handle, withEmDashes)).toBe(true)
  })

  it('still reports a difference when the text differs', async () => {
    const file = new File([withEmDashes], 'w.dsl', { type: 'text/plain' })
    const handle = { getFile: async () => file } as unknown as FileSystemFileHandle
    expect(await fileAlreadyHas(handle, withEmDashes.replace('naïve', 'naive'))).toBe(false)
  })

  it('round-trips non-ASCII through the real folder writer', async () => {
    expect(await writeDSLFile('u.dsl', withEmDashes)).toBe(true)
    expect(rig.opened['u.dsl']).toBe(1)
    expect(await writeDSLFile('u.dsl', withEmDashes)).toBe(true)
    expect(rig.opened['u.dsl']).toBe(1) // skipped, not rewritten
  })
})
