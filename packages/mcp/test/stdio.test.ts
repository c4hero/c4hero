import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const clients: Client[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

it('serves all four tools through a real stdio MCP client and applies only a reviewed proposal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4hero-stdio-'))
  dirs.push(dir)
  const path = join(dir, 'model.dsl')
  const original = 'workspace "Stdio" {\n model {\n user = person "User"\n }\n}\n'
  await writeFile(path, original)
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve(process.env.C4HERO_MCP_BIN ?? 'dist/cli.js'), '--workspace', path], stderr: 'pipe' })
  let stderr = ''
  transport.stderr?.on('data', data => { stderr += data.toString() })
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  clients.push(client)
  try { await client.connect(transport) } catch (error) { throw new Error(`${String(error)}\nServer stderr: ${stderr}`) }
  const { tools } = await client.listTools()
  expect(tools.map(t => t.name).sort()).toEqual(['apply_edit_plan', 'get_model', 'list_elements', 'propose_edit_plan'])
  expect(tools.find(t => t.name === 'apply_edit_plan')?.annotations?.destructiveHint).toBe(true)
  const read = await client.callTool({ name: 'get_model', arguments: {} })
  const revision = (read as CallToolResult).structuredContent?.revision
  expect(revision).toBeTypeOf('string')
  const list = await client.callTool({ name: 'list_elements', arguments: { type: 'person' } })
  expect((list as CallToolResult).structuredContent?.elements).toEqual([expect.objectContaining({ id: 'user', name: 'User' })])
  const args = { baseRevision: revision, plan: { operations: [{ op: 'addSoftwareSystem', ref: 's', name: 'Shop' }] } }
  const wrongVersion = await client.callTool({ name: 'propose_edit_plan', arguments: { ...args, contractVersion: 2 } })
  expect(wrongVersion.isError).toBe(true)
  const malformed = await client.callTool({ name: 'propose_edit_plan', arguments: { ...args, plan: { operations: [{ op: 'removeEverything' }] } } })
  expect(malformed.isError).toBe(true)
  const proposed = await client.callTool({ name: 'propose_edit_plan', arguments: args })
  expect(proposed.isError).toBeFalsy()
  expect(await readFile(path, 'utf8')).toBe(original)
  const { proposalId, preview } = proposed.structuredContent as { proposalId: string; preview: { dsl: string } }
  const extraPlan = await client.callTool({ name: 'apply_edit_plan', arguments: { proposalId, plan: args.plan } })
  expect(extraPlan.isError).toBe(true)
  const applied = await client.callTool({ name: 'apply_edit_plan', arguments: { proposalId } })
  expect(applied.isError).toBeFalsy()
  expect(await readFile(path, 'utf8')).toBe(preview.dsl)
  const replay = await client.callTool({ name: 'apply_edit_plan', arguments: { proposalId } })
  expect(replay.isError).toBe(true)
  expect(stderr).toBe('')
})
