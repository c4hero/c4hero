import { build } from 'esbuild'
import { chmod, copyFile } from 'node:fs/promises'

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@modelcontextprotocol/sdk/*', 'zod'],
  tsconfig: 'tsconfig.json',
  define: { 'import.meta.env.DEV': 'false' },
  banner: { js: '#!/usr/bin/env node' },
})
await chmod('dist/cli.js', 0o755)
await copyFile('../../LICENSE', 'LICENSE')
await copyFile('../../NOTICE', 'NOTICE')
