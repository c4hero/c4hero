import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server'
import { WorkspaceSession } from './workspace'
import metadata from '../package.json'

const args = process.argv.slice(2)
if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
  process.stdout.write('Usage: c4hero-mcp --workspace /absolute/path/to/architecture.dsl\n\nLocal stdio MCP server. Read/propose are read-only; apply explicitly writes reviewed plans.\n')
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(`${metadata.version}\n`)
} else if (args.length !== 2 || args[0] !== '--workspace') {
  process.stderr.write('Usage: c4hero-mcp --workspace /absolute/path/to/architecture.dsl\n')
  process.exitCode = 1
} else {
  try {
    const session = await WorkspaceSession.open(args[1])
    const server = createServer(session)
    await server.connect(new StdioServerTransport())
  } catch (error) {
    process.stderr.write(`c4hero-mcp: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
