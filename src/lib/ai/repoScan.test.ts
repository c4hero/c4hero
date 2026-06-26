import { describe, it, expect } from 'vitest'
import { isKeyFile, isIgnoredDir, buildRepoBundle, mergeRepoProposals } from './repoScan'
import type { RepoSnapshot, RepoProposal } from './types'

describe('isIgnoredDir', () => {
  it('skips dependency/build folders and dotdirs', () => {
    expect(isIgnoredDir('node_modules')).toBe(true)
    expect(isIgnoredDir('dist')).toBe(true)
    expect(isIgnoredDir('.git')).toBe(true)
    expect(isIgnoredDir('.venv')).toBe(true)
    expect(isIgnoredDir('target')).toBe(true)
  })
  it('keeps real source folders', () => {
    expect(isIgnoredDir('src')).toBe(false)
    expect(isIgnoredDir('services')).toBe(false)
    expect(isIgnoredDir('orders-service')).toBe(false)
  })
})

describe('isKeyFile', () => {
  it('matches manifests, configs and docs (case-insensitive)', () => {
    for (const f of ['package.json', 'pom.xml', 'go.mod', 'pyproject.toml', 'Cargo.toml', 'composer.json', 'Gemfile', 'Api.csproj', 'docker-compose.yml', 'docker-compose.prod.yaml', 'Dockerfile', 'application.yml', 'README.md', 'README']) {
      expect(isKeyFile(f)).toBe(true)
    }
  })
  it('ignores ordinary source files', () => {
    expect(isKeyFile('index.ts')).toBe(false)
    expect(isKeyFile('Main.java')).toBe(false)
    expect(isKeyFile('styles.css')).toBe(false)
  })
})

describe('buildRepoBundle', () => {
  const snapshot: RepoSnapshot = {
    repoName: 'orders-platform',
    tree: ['package.json', 'src/index.ts', 'orders/pom.xml'],
    files: [
      { path: 'package.json', content: '{ "name": "orders" }' },
      { path: 'orders/pom.xml', content: '<project>java</project>' },
    ],
  }

  it('includes the repo name, tree and key-file contents', () => {
    const out = buildRepoBundle(snapshot)
    expect(out).toContain('REPOSITORY: orders-platform')
    expect(out).toContain('FILE TREE')
    expect(out).toContain('src/index.ts')
    expect(out).toContain('=== package.json ===')
    expect(out).toContain('{ "name": "orders" }')
    expect(out).toContain('=== orders/pom.xml ===')
  })

  it('honors the character budget', () => {
    const big: RepoSnapshot = { repoName: 'x', tree: [], files: [{ path: 'a', content: 'z'.repeat(5000) }] }
    expect(buildRepoBundle(big, 500).length).toBeLessThanOrEqual(500)
  })
})

describe('mergeRepoProposals', () => {
  const c = (name: string, parent = 'shop'): RepoProposal => ({ op: { op: 'addContainer', ref: name, parent, name }, src: 'x', label: name })
  const rel = (s: string, d: string): RepoProposal => ({ op: { op: 'addRelationship', source: s, destination: d }, src: 'x', label: `${s}->${d}` })

  it('dedupes the union across passes regardless of casing', () => {
    const passA = [c('Payments'), c('Postgres'), rel('Web', 'Postgres')]
    const passB = [c('postgres'), c('Redis'), rel('web', 'postgres')]
    const merged = mergeRepoProposals([...passA, ...passB])
    expect(merged).toHaveLength(4) // Payments, Postgres, Redis, Web->Postgres
  })

  it('is order-independent and deterministic', () => {
    const a = [c('B'), c('A'), c('C')]
    const b = [c('C'), c('A'), c('B')]
    expect(mergeRepoProposals(a)).toEqual(mergeRepoProposals(b))
  })

  it('keeps containers with the same name under different parents', () => {
    expect(mergeRepoProposals([c('db', 'orders'), c('db', 'billing')])).toHaveLength(2)
  })
})
