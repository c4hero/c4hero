import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/test/runTest.ts', 'src/test/suite/index.ts'],
  bundle: true,
  outdir: 'dist/test',
  external: ['vscode', '@vscode/test-electron'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
})
