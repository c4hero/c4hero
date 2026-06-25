import type { RepoFile, RepoSnapshot } from './types'

// Read a local repository through the File System Access API and reduce it to a
// compact, architecture-revealing snapshot: the file tree plus the contents of
// high-signal manifest/config files. The pure helpers (filtering, bundling,
// truncation) are unit-tested; the traversal needs a real directory handle.

const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  'bin', 'obj', '__pycache__', 'venv', 'tmp', 'temp', 'public',
])

/** Directories not worth walking for architecture inference. Skips dotdirs
 *  (.git, .next, .venv, .cache, …) and known build/dependency folders. */
export function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name.toLowerCase())
}

// Manifest / build / config / doc files that strongly reveal architecture.
const KEY_FILE_RE = /^(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|go\.mod|requirements\.txt|pyproject\.toml|cargo\.toml|composer\.json|gemfile|[^/]*\.csproj|docker-compose([.-][\w.-]*)?\.ya?ml|dockerfile|application\.ya?ml|application\.properties|serverless\.ya?ml|[^/]*\.tf|readme(\.md)?|chart\.ya?ml|values\.ya?ml)$/i

/** True for files whose contents are worth sending to the model. */
export function isKeyFile(name: string): boolean {
  return KEY_FILE_RE.test(name)
}

export interface ReadRepoOptions {
  maxFiles?: number
  maxFileBytes?: number
  maxTreePaths?: number
  /** Skip files larger than this on disk (bytes). */
  maxRawFileBytes?: number
}

interface DirHandleLike {
  name: string
  entries(): AsyncIterableIterator<[string, { kind: string; getFile?: () => Promise<File> }]>
}

/** Walk a directory handle into a RepoSnapshot. Bounded by the options so a huge
 *  repo doesn't stall the browser. */
export async function readRepoFiles(
  dir: FileSystemDirectoryHandle,
  opts: ReadRepoOptions = {},
): Promise<RepoSnapshot> {
  const maxFiles = opts.maxFiles ?? 40
  const maxFileBytes = opts.maxFileBytes ?? 16_000
  const maxTreePaths = opts.maxTreePaths ?? 800
  const maxRawFileBytes = opts.maxRawFileBytes ?? 512_000

  const tree: string[] = []
  const files: RepoFile[] = []

  async function walk(handle: DirHandleLike, prefix: string, depth: number): Promise<void> {
    if (depth > 8) return
    for await (const [name, entry] of handle.entries()) {
      if (tree.length >= maxTreePaths && files.length >= maxFiles) return
      if (entry.kind === 'directory') {
        if (isIgnoredDir(name)) continue
        await walk(entry as unknown as DirHandleLike, `${prefix}${name}/`, depth + 1)
      } else {
        const path = `${prefix}${name}`
        if (tree.length < maxTreePaths) tree.push(path)
        if (files.length < maxFiles && isKeyFile(name) && entry.getFile) {
          try {
            const file = await entry.getFile()
            if (file.size <= maxRawFileBytes) {
              files.push({ path, content: (await file.text()).slice(0, maxFileBytes) })
            }
          } catch {
            // unreadable file — skip
          }
        }
      }
    }
  }

  await walk(dir as unknown as DirHandleLike, '', 0)
  return { repoName: dir.name, tree, files }
}

/** Assemble a snapshot into a single text bundle within a character budget. */
export function buildRepoBundle(snapshot: RepoSnapshot, maxChars = 24_000): string {
  const lines: string[] = [`REPOSITORY: ${snapshot.repoName}`, '', 'FILE TREE (paths):']
  for (const p of snapshot.tree) lines.push(`  ${p}`)
  lines.push('', 'KEY FILES:')
  let out = lines.join('\n')

  for (const f of snapshot.files) {
    const block = `\n\n=== ${f.path} ===\n${f.content}`
    if (out.length + block.length > maxChars) {
      out += `\n\n(${snapshot.files.length} key files found; remaining omitted to fit the budget)`
      break
    }
    out += block
  }
  return out.slice(0, maxChars)
}

/** Whether the browser supports picking a local folder. */
export function canScanRepo(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}
