import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import metadata from '../package.json'
import { CONTRACT_VERSION, planSchema } from './schema'
import { WorkspaceSession } from './workspace'

async function respond(work: () => Promise<object>): Promise<CallToolResult> {
  try {
    const output = await work()
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: { ...output } }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
  }
}

export function createServer(session: WorkspaceSession): McpServer {
  const server = new McpServer({ name: 'c4hero-mcp', version: metadata.version }, {
    instructions: 'Read the configured workspace first. Use its revision when proposing edits. Review the returned plan and exact DSL/sidecar preview before explicitly calling apply_edit_plan. No files are written by read or propose tools. Plans expire after 15 minutes and are single-use. No AI provider is called. Contract version 1.',
  })
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  server.registerTool('get_model', {
    description: 'Read the configured DSL workspace, relationships, views and sidecar metadata. Returns the content revision needed for propose_edit_plan. Includes inside the workspace directory are read-only.',
    inputSchema: z.strictObject({}), annotations: readAnnotations,
  }, () => respond(() => session.getModel()))
  server.registerTool('list_elements', {
    description: 'List architecture elements with stable IDs and parent IDs; optionally filter by type or direct parent. Returns the current workspace revision.',
    inputSchema: z.strictObject({
      type: z.enum(['person', 'softwareSystem', 'container', 'component']).optional(),
      parentId: z.string().optional(),
    }), annotations: readAnnotations,
  }, ({ type, parentId }) => respond(() => session.listElements(type, parentId)))
  server.registerTool('propose_edit_plan', {
    description: 'Validate an EditPlan supplied by the calling agent and preview its exact resulting DSL and sidecar. Does not write files or call AI. All operations must succeed; skipped/invalid operations reject the whole plan. Model scope only; single-file workspaces only. Review the preview before applying the returned proposalId.',
    inputSchema: z.strictObject({
      contractVersion: z.literal(CONTRACT_VERSION).default(CONTRACT_VERSION),
      baseRevision: z.string().regex(/^[a-f0-9]{64}$/),
      plan: planSchema,
    }), annotations: { ...readAnnotations, idempotentHint: false },
  }, ({ plan, baseRevision }) => respond(() => session.propose(plan, baseRevision)))
  server.registerTool('apply_edit_plan', {
    description: 'Explicitly approve and write a previously reviewed proposal. Writes only the exact previewed DSL and sidecar, rejects stale revisions, and returns original-file backups for undo/recovery. Destructive operations may remove elements and their dependent relationships/views. Single-use proposal; no arbitrary replacement plan accepted.',
    inputSchema: z.strictObject({
      contractVersion: z.literal(CONTRACT_VERSION).default(CONTRACT_VERSION),
      proposalId: z.string().uuid(),
    }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ proposalId }) => respond(() => session.apply(proposalId)))
  return server
}
