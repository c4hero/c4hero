import * as fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

export interface FileSnapshot { path: string; content: string | null; mode: number }
export const MAX_FILE_BYTES = 8 * 1024 * 1024

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Read through a descriptor: reject symlinks/devices and bound memory use. */
export async function readFileSnapshot(path: string, optional = false): Promise<FileSnapshot> {
  let handle
  try {
    handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (optional && hasCode(error, 'ENOENT')) return { path, content: null, mode: 0o600 }
    throw error
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error(`Expected a regular file: ${path}`)
    if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds the 8 MiB limit: ${path}`)
    // Read at most limit+1 bytes even if another writer grows the file.
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > MAX_FILE_BYTES) throw new Error(`File exceeds the 8 MiB limit: ${path}`)
    return { path, content: buffer.subarray(0, length).toString('utf8'), mode: stat.mode & 0o777 }
  } finally { await handle.close() }
}

export function revision(files: FileSnapshot[]): string {
  return createHash('sha256').update(JSON.stringify(files.map(({ path, content }) => [path, content]))).digest('hex')
}

export async function assertUnchanged(files: FileSnapshot[]): Promise<void> {
  for (const file of files) {
    const current = await readFileSnapshot(file.path, file.content === null)
    if (current.content !== file.content) throw new Error('Workspace changed on disk. Read it again and propose a new plan.')
  }
}

export async function assertUnlocked(path: string): Promise<void> {
  try { await fs.lstat(`${path}.mcp.lock`) } catch (error) {
    if (hasCode(error, 'ENOENT')) return
    throw error
  }
  throw new Error(`Workspace is locked by an MCP writer. If it crashed, inspect backups before removing ${path}.mcp.lock.`)
}

/** Cooperative lock between MCP processes. Browser/editor writers do not take
 * this lock, so content is also checked immediately before replacing files. */
export async function commitFiles(files: FileSnapshot[], outputs: string[]): Promise<string> {
  const lockPath = `${files[0].path}.mcp.lock`
  let lock
  try { lock = await fs.open(lockPath, 'wx', 0o600) } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new Error('Workspace is locked by another MCP writer; retry after it finishes.')
    throw error
  }
  let retainLock = false
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
    await lock.sync()
    await assertUnchanged(files)
    const backupDirectory = await fs.mkdtemp(join(dirname(files[0].path), `.${basename(files[0].path)}.mcp-backup-`))
    await fs.chmod(backupDirectory, 0o700)
    const manifest = {
      state: 'prepared',
      files: files.map((file, i) => ({ path: file.path, original: file.content === null ? null : `${i}.original`, mode: file.mode })),
    }
    const saveManifest = () => fs.writeFile(join(backupDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flush: true })
    for (const [i, file] of files.entries()) {
      if (file.content !== null) await fs.writeFile(join(backupDirectory, `${i}.original`), file.content, { flag: 'wx', mode: 0o600, flush: true })
      await fs.writeFile(join(backupDirectory, `${i}.next`), outputs[i], { flag: 'wx', mode: file.mode, flush: true })
      await fs.chmod(join(backupDirectory, `${i}.next`), file.mode)
    }
    await saveManifest()
    const changed: number[] = []
    try {
      await assertUnchanged(files)
      for (const [i, file] of files.entries()) {
        await assertUnchanged([file])
        await fs.rename(join(backupDirectory, `${i}.next`), file.path)
        changed.push(i)
      }
      manifest.state = 'applied'
      await saveManifest()
      return backupDirectory
    } catch (error) {
      const failures: string[] = []
      for (const i of changed.reverse()) {
        const file = files[i]
        try {
          const current = await readFileSnapshot(file.path)
          if (current.content !== outputs[i]) throw new Error('file changed again; refusing to overwrite it during rollback')
          if (file.content === null) await fs.unlink(file.path)
          else {
            const rollback = join(backupDirectory, `${i}.rollback`)
            await fs.writeFile(rollback, file.content, { flag: 'wx', mode: file.mode, flush: true })
            await fs.chmod(rollback, file.mode)
            await fs.rename(rollback, file.path)
          }
        } catch (rollbackError) { failures.push(`${file.path}: ${String(rollbackError)}`) }
      }
      retainLock = failures.length > 0
      manifest.state = retainLock ? 'recovery-required' : 'rolled-back'
      await saveManifest().catch(() => { /* Original backups remain readable. */ })
      throw new Error(`Apply failed: ${String(error)}. ${retainLock ? `Manual recovery required; lock retained. ${failures.join('; ')}` : 'Original files restored.'} Backups: ${backupDirectory}`)
    }
  } finally {
    await lock.close()
    if (!retainLock) await fs.unlink(lockPath)
  }
}
