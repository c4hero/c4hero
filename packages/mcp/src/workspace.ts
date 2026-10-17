import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadWorkspaceDocument, parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { extractSidecar, parseSidecar, serializeSidecar, sidecarName } from '@/lib/sidecar'
import { serializeDSL } from '@/lib/dsl'
import { applyEditPlan, describeOps, summarizeSkips } from '@/lib/ai/operations'
import { sanitizeEditOp } from '@/lib/ai/schema'
import { flattenElements } from '@/lib/ai/context'
import { collectTakenIds } from '@/store/workspace-helpers'
import { checkModelIntegrity } from '@/lib/modelIntegrity'
import type { EditPlan } from '@/lib/ai/types'
import { createEditActions } from './actions'
import { CONTRACT_VERSION, planSchema } from './schema'
import { assertUnlocked, assertUnchanged, commitFiles, hasCode, MAX_FILE_BYTES, readFileSnapshot, revision, type FileSnapshot } from './files'

const PROPOSAL_TTL_MS = 15 * 60 * 1000
const MAX_PROPOSALS = 10

interface Proposal {
  expires: number
  files: FileSnapshot[]
  dsl: string
  sidecarJson: string
  result: ReturnType<typeof applyEditPlan>
}

export class WorkspaceSession {
  private readonly proposals = new Map<string, Proposal>()
  private applying = false
  readonly path: string
  private constructor(path: string) { this.path = path }

  static async open(path: string): Promise<WorkspaceSession> {
    const canonical = await realpath(resolve(path))
    if (!canonical.toLowerCase().endsWith('.dsl')) throw new Error('Configure an existing .dsl workspace file')
    const session = new WorkspaceSession(canonical)
    await session.read()
    return session
  }

  private async read() {
    await assertUnlocked(this.path)
    const files = [
      await readFileSnapshot(this.path),
      await readFileSnapshot(join(dirname(this.path), sidecarName(basename(this.path))), true),
    ]
    if (files[1].content !== null && !parseSidecar(files[1].content)) {
      throw new Error('Invalid or unsupported sidecar. Fix it before using this workspace; metadata will not be discarded.')
    }
    let totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content ?? ''), 0)
    const includeFailures: string[] = []
    const document = await loadWorkspaceDocument({
      content: files[0].content!, sidecarJson: files[1].content ?? undefined,
      fallbackName: basename(this.path, '.dsl'),
      readInclude: async path => {
        try {
          const target = resolve(dirname(this.path), path)
          let canonical: string
          try { canonical = await realpath(target) } catch (error) {
            if (hasCode(error, 'ENOENT')) return null
            throw error
          }
          const inside = relative(dirname(this.path), canonical)
          if (inside === '..' || inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(inside)) {
            throw new Error('Included files must stay inside the workspace directory')
          }
          const file = await readFileSnapshot(canonical)
          totalBytes += Buffer.byteLength(file.content!)
          if (totalBytes > 32 * 1024 * 1024) throw new Error('Workspace includes exceed the 32 MiB limit')
          files.push(file)
          return file.content
        } catch (error) {
          includeFailures.push(error instanceof Error ? error.message : String(error))
          return null
        }
      },
    })
    if (includeFailures.length) throw new Error(includeFailures.join('; '))
    if (document.errors.length) throw new Error(`Invalid DSL: ${document.errors.map(e => `${e.line}:${e.column} ${e.message}`).join('; ')}`)
    await assertUnchanged(files)
    await assertUnlocked(this.path)
    return { ...document, files, revision: revision(files) }
  }

  async getModel() {
    const { workspace, warnings, revision } = await this.read()
    return { contractVersion: CONTRACT_VERSION, path: this.path, revision, workspace, warnings }
  }

  async listElements(type?: string, parentId?: string) {
    const { workspace, revision } = await this.read()
    return {
      contractVersion: CONTRACT_VERSION, revision,
      elements: flattenElements(workspace).filter(e => (!type || e.type === type) && (!parentId || e.parentId === parentId)),
    }
  }

  async propose(input: unknown, baseRevision: string) {
    const parsed = planSchema.parse(input)
    const plan: EditPlan = { operations: parsed.operations.map(op => sanitizeEditOp(op)!) }
    const { workspace, files, revision: currentRevision, warnings } = await this.read()
    if (baseRevision !== currentRevision) throw new Error('Workspace changed since it was read. Read it again before proposing edits.')
    if (workspace.includedFiles?.length || warnings.length) {
      throw new Error('Edits require a single-file workspace with no parser warnings. Included/unresolved content is read-only in contract v1.')
    }
    const refs = collectTakenIds(workspace)
    for (const op of plan.operations) {
      if ('ref' in op) {
        if (refs.has(op.ref)) throw new Error(`Duplicate ref or ref colliding with an existing ID: ${op.ref}`)
        refs.add(op.ref)
      }
    }
    const summary = describeOps(plan, workspace)
    const result = applyEditPlan(plan, createEditActions(workspace), workspace)
    if (result.skippedCount) throw new Error(`Plan rejected without writing files. ${summarizeSkips(result)}`)
    const violations = checkModelIntegrity(workspace)
    if (violations.length) throw new Error(`Plan would leave an invalid model: ${JSON.stringify(violations)}`)
    const dsl = serializeDSL(workspace)
    const sidecarJson = serializeSidecar(extractSidecar(workspace) ?? { version: 1, views: {} })
    if (Buffer.byteLength(dsl) > MAX_FILE_BYTES || Buffer.byteLength(sidecarJson) > MAX_FILE_BYTES) {
      throw new Error('Proposed output exceeds the 8 MiB file limit')
    }
    const roundTrip = parseWorkspaceDocument({ content: dsl, sidecarJson })
    if (roundTrip.errors.length || roundTrip.warnings.length || checkModelIntegrity(roundTrip.workspace).length) {
      throw new Error('Proposed workspace does not pass the DSL round-trip validation')
    }
    const now = Date.now()
    for (const [id, proposal] of this.proposals) if (proposal.expires <= now) this.proposals.delete(id)
    if (this.proposals.size >= MAX_PROPOSALS) this.proposals.delete(this.proposals.keys().next().value!)
    const proposalId = randomUUID()
    const expires = now + PROPOSAL_TTL_MS
    this.proposals.set(proposalId, { expires, files, dsl, sidecarJson, result: structuredClone(result) })
    return {
      contractVersion: CONTRACT_VERSION, proposalId, baseRevision: currentRevision,
      expiresAt: new Date(expires).toISOString(), scope: 'model', plan, summary, result,
      preview: { dsl, sidecarJson },
    }
  }

  async apply(proposalId: string) {
    if (this.applying) throw new Error('An apply is already running in this session')
    const proposal = this.proposals.get(proposalId)
    if (!proposal || proposal.expires <= Date.now()) {
      this.proposals.delete(proposalId)
      throw new Error('Unknown or expired proposal. Propose and review a new plan before applying.')
    }
    this.applying = true
    // Single-use, even after a failed apply: callers must review a fresh plan.
    this.proposals.delete(proposalId)
    try {
      const backupDirectory = await commitFiles(proposal.files, [proposal.dsl, proposal.sidecarJson])
      this.proposals.clear()
      return {
        contractVersion: CONTRACT_VERSION, applied: true, backupDirectory,
        revision: revision(proposal.files.map((f, i) => ({ ...f, content: i === 0 ? proposal.dsl : proposal.sidecarJson }))),
        result: proposal.result,
      }
    } finally { this.applying = false }
  }
}
