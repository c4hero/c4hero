import { describe, it, expect } from 'vitest'
import { isKeyFile, isIgnoredDir, buildRepoBundle, mergeRepoProposals, redactSensitiveContent } from './repoScan'
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

  it('redacts sensitive values before bundling key files', () => {
    const out = buildRepoBundle({
      repoName: 'orders',
      tree: ['application.yml'],
      files: [{
        path: 'application.yml',
        content: [
          'database_url: postgres://orders:hunter2@db/orders',
          'apiKey: "AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"',
          'service_url: https://orders.example.com',
        ].join('\n'),
      }],
    })
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('AIzaSy')
    expect(out).toContain('database_url: <redacted>')
    expect(out).toContain('apiKey: "<redacted>"')
    expect(out).toContain('service_url: https://orders.example.com')
  })
})

describe('redactSensitiveContent', () => {
  it('redacts common secret assignment formats and private keys', () => {
    const out = redactSensitiveContent([
      'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
      'spring.datasource.password=swordfish',
      'clientSecret: very-secret',
      'token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890abcd"',
      'private_key = -----BEGIN PRIVATE KEY-----',
      'abc',
      '-----END PRIVATE KEY-----',
    ].join('\n'))

    expect(out).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(out).not.toContain('swordfish')
    expect(out).not.toContain('very-secret')
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890abcd')
    expect(out).not.toContain('\nabc\n')
    expect(out).toContain('OPENAI_API_KEY=<redacted>')
    expect(out).toContain('spring.datasource.password=<redacted>')
    expect(out).toContain('clientSecret: <redacted>')
    expect(out).toContain('token = "<redacted>"')
  })

  it('redacts private key blocks even when the excerpt is truncated', () => {
    const out = redactSensitiveContent([
      'private_key: |',
      '-----BEGIN PRIVATE KEY-----',
      'still-secret-key-material',
    ].join('\n'))
    expect(out).not.toContain('still-secret-key-material')
    expect(out).toContain('private_key: <redacted>')
  })

  it('keeps ordinary architecture metadata intact', () => {
    const input = [
      '"jsonwebtoken": "^9.0.0",',
      'service_url: https://orders.example.com',
      'name: orders-api',
    ].join('\n')
    expect(redactSensitiveContent(input)).toBe(input)
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

  it('orders parents before children so applyEditPlan can resolve them', () => {
    const sys: RepoProposal = { op: { op: 'addSoftwareSystem', ref: 'orders', name: 'Orders' }, src: 'x', label: 'Orders' }
    const cont: RepoProposal = { op: { op: 'addContainer', ref: 'api', parent: 'Orders', name: 'API' }, src: 'x', label: 'API' }
    const comp: RepoProposal = { op: { op: 'addComponent', ref: 'svc', parent: 'API', name: 'Service' }, src: 'x', label: 'Service' }
    const link = rel('API', 'db')
    // Feed them out of order (component first); merge must reorder.
    const ranks = mergeRepoProposals([comp, link, cont, sys]).map((p) => p.op.op)
    expect(ranks).toEqual(['addSoftwareSystem', 'addContainer', 'addComponent', 'addRelationship'])
  })
})
