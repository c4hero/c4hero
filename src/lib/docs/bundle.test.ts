import { describe, expect, it } from 'vitest'
import {
  allDocsDirs,
  appendToIndex,
  defaultDocsDir,
  dirTitle,
  docsDirectiveLine,
  elementDocsScope,
  elementDocsScopes,
  nextAdrFilename,
  parseConcept,
  parseDocsBundle,
  parseDocsDirective,
  parseStatusSection,
  renderNewAdr,
  renderNewDoc,
  slugify,
  uniqueDocFilename,
  workspaceDocsScope,
} from './bundle'
import { parseFrontmatter } from './frontmatter'
import { parseDSL, serializeDSL } from '@/lib/dsl'

const DSL = `
workspace "Shop" {
    !docs docs
    !adrs "decisions"
    model {
        cust = person "Customer"
        shop = softwareSystem "Shop" {
            !docs docs/shop
            !adrs docs/shop/adrs
            web = container "Web" {
                !docs docs/web
            }
        }
    }
    views {
        systemContext shop "Context" { include * }
    }
}`

describe('directives', () => {
  it('parses !docs and !adrs lines, quoted or bare, and rejects anything else', () => {
    expect(parseDocsDirective('!docs docs')).toEqual({ kind: 'docs', dir: 'docs' })
    expect(parseDocsDirective('!ADRS "my decisions"')).toEqual({ kind: 'adrs', dir: 'my decisions' })
    expect(parseDocsDirective('!docs ./docs/api/')).toEqual({ kind: 'docs', dir: 'docs/api' })
    expect(parseDocsDirective('!include model.dsl')).toBeNull()
    expect(parseDocsDirective('!docs /etc')).toBeNull()
    expect(parseDocsDirective('!docs ../outside')).toBeNull()
    expect(parseDocsDirective('!docs')).toBeNull()
  })

  it('resolves workspace and element scopes from a parsed workspace', () => {
    const { workspace: ws, errors } = parseDSL(DSL)
    expect(errors).toHaveLength(0)
    expect(workspaceDocsScope(ws)).toEqual({ docs: 'docs', adrs: 'decisions' })
    const scopes = elementDocsScopes(ws)
    expect(scopes.get('shop')).toEqual({ docs: 'docs/shop', adrs: 'docs/shop/adrs' })
    expect(scopes.get('web')).toEqual({ docs: 'docs/web' })
    expect(scopes.has('cust')).toBe(false)
    expect(elementDocsScope({ directives: ['!include x.dsl', '!docs a', '!docs b'] })).toEqual({ docs: 'a' })
  })

  it('lists every distinct folder once', () => {
    const { workspace: ws } = parseDSL(DSL)
    expect(allDocsDirs(ws)).toEqual([
      { kind: 'docs', dir: 'docs' },
      { kind: 'adrs', dir: 'decisions' },
      { kind: 'docs', dir: 'docs/shop' },
      { kind: 'adrs', dir: 'docs/shop/adrs' },
      { kind: 'docs', dir: 'docs/web' },
    ])
  })

  it('a workspace with docs directives still round-trips through the DSL untouched', () => {
    const { workspace: ws } = parseDSL(DSL)
    const out = serializeDSL(ws)
    expect(out).toContain('!docs docs')
    expect(out).toContain('!adrs "decisions"')
    expect(out).toContain('!docs docs/shop')
    expect(out).toContain('!docs docs/web')
    expect(parseDSL(out).errors).toHaveLength(0)
  })
})

describe('parseDocsBundle', () => {
  it('reads OKF-shaped files, skips reserved index files, and orders numerically', () => {
    const bundle = parseDocsBundle('docs', 'docs', [
      { name: 'index.md', text: '# Docs\n\n- [x](10-x.md)' },
      { name: '10-later.md', text: '---\ntype: Guide\ntitle: Later\ntags: [a]\n---\n\nbody' },
      { name: '2-earlier.md', text: '---\ntitle: Earlier\ndescription: Short\n---\n\n# Ignored heading' },
      { name: 'notes.txt', text: 'not markdown' },
      { name: 'catalog.md', text: 'generated' },
    ])
    expect(bundle.concepts.map((c) => c.file)).toEqual(['2-earlier.md', '10-later.md'])
    const [earlier, later] = bundle.concepts
    expect(earlier).toMatchObject({ path: 'docs/2-earlier.md', type: 'Documentation', title: 'Earlier', description: 'Short', number: 2 })
    expect(later).toMatchObject({ type: 'Guide', title: 'Later', tags: ['a'], number: 10, body: '\nbody' })
  })

  it('reads Structurizr-style docs with no frontmatter: title from the first heading or file name', () => {
    const bundle = parseDocsBundle('docs', 'docs', [
      { name: '01-context.md', text: '## Context\n\ntext' },
      { name: 'getting-started.md', text: 'no heading at all' },
    ])
    expect(bundle.concepts[0]).toMatchObject({ title: 'Context', number: 1, body: '## Context\n\ntext' })
    expect(bundle.concepts[1]).toMatchObject({ title: 'Getting started', number: undefined })
  })

  it('reads adr-tools ADRs: number, title without its prefix, status and supersedes links', () => {
    const bundle = parseDocsBundle('adrs', 'decisions', [
      { name: '0001-record-architecture-decisions.md', text: '# 1. Record architecture decisions\n\nDate: 2026-01-01\n\n## Status\n\nSuperseded by [2. Use ADRs differently](0002-use-adrs-differently.md)\n\n## Context\n\nWe need to.' },
      { name: '0002-use-adrs-differently.md', text: '# 2. Use ADRs differently\n\n## Status\n\nAccepted\n\nSupersedes [1. Record architecture decisions](0001-record-architecture-decisions.md)\n\n## Decision\n\nDo it.' },
    ])
    const [one, two] = bundle.concepts
    expect(one).toMatchObject({ type: 'Decision', number: 1, title: 'Record architecture decisions', status: 'Superseded', supersededBy: ['0002-use-adrs-differently.md'], supersedes: [] })
    expect(two).toMatchObject({ number: 2, title: 'Use ADRs differently', status: 'Accepted', supersedes: ['0001-record-architecture-decisions.md'], supersededBy: [] })
  })

  it('prefers frontmatter over the status section when both exist', () => {
    const c = parseConcept('adrs', 'adrs', {
      name: '0003-x.md',
      text: '---\ntype: Decision\ntitle: X\nstatus: Rejected\nsupersedes: [0001-a.md, "sub/0002-b.md"]\n---\n\n# 3. X\n\n## Status\n\nAccepted\n',
    })
    expect(c.status).toBe('Rejected')
    expect(c.supersedes).toEqual(['0001-a.md', '0002-b.md'])
  })

  it('reads the AI drafter\'s **Status** (Proposed) form', () => {
    const status = parseStatusSection('# Adopt events\n\n**Status** (Proposed)\n\n**Context**\n\nstuff')
    expect(status).toEqual({ status: 'Proposed', supersedes: [], supersededBy: [] })
    expect(parseStatusSection('no status here')).toEqual({ supersedes: [], supersededBy: [] })
  })
})

describe('writing', () => {
  it('slugifies titles and picks unique, non-reserved file names', () => {
    expect(slugify('Use Postgres for Orders!')).toBe('use-postgres-for-orders')
    expect(slugify('  Ünïcode ')).toBe('unicode')
    expect(uniqueDocFilename([], 'overview')).toBe('overview.md')
    expect(uniqueDocFilename(['Overview.md'], 'overview')).toBe('overview-2.md')
    expect(uniqueDocFilename(['overview.md', 'overview-2.md'], 'overview')).toBe('overview-3.md')
    expect(uniqueDocFilename([], 'index')).toBe('index-doc.md')
    expect(uniqueDocFilename([], '')).toBe('untitled.md')
  })

  it('numbers ADRs after the highest existing one, adr-tools style', () => {
    expect(nextAdrFilename([], 'Use Postgres')).toBe('0001-use-postgres.md')
    expect(nextAdrFilename(['0001-a.md', '0007-b.md', 'notes.md'], 'Try Kafka')).toBe('0008-try-kafka.md')
    expect(nextAdrFilename(['0001-a.md'], '!!!')).toBe('0002-decision.md')
  })

  it('renders a new doc and ADR as OKF concepts the reader understands', () => {
    const now = new Date('2026-09-13T10:00:00Z')
    const doc = renderNewDoc({ title: 'Overview', description: 'What this is', elementId: 'shop', now })
    expect(doc).toBe('---\ntype: "Documentation"\ntitle: "Overview"\ndescription: "What this is"\nelement: "shop"\ntimestamp: "2026-09-13T10:00:00.000Z"\n---\n\n# Overview\n\nWhat this is\n')
    const back = parseConcept('docs', 'docs', { name: 'overview.md', text: doc })
    expect(back).toMatchObject({ type: 'Documentation', title: 'Overview', description: 'What this is', timestamp: '2026-09-13T10:00:00.000Z' })

    const adr = renderNewAdr({ title: 'Use Postgres', description: 'We need a database', number: 4, now })
    expect(adr).toContain('type: "Decision"')
    expect(adr).toContain('status: "Proposed"')
    expect(adr).toContain('# 4. Use Postgres\n\n## Status\n\nProposed\n\n## Context\n\nWe need a database\n\n## Decision\n\n\n## Consequences')
    const adrBack = parseConcept('adrs', 'adrs', { name: '0004-use-postgres.md', text: adr })
    expect(adrBack).toMatchObject({ title: 'Use Postgres', status: 'Proposed', number: 4 })
  })

  it('uses a supplied body verbatim (an AI-drafted record keeps its text)', () => {
    const adr = renderNewAdr({ title: 'Adopt events', body: '# Adopt events\n\n**Status** (Proposed)\n\nbody', number: 1, now: new Date(0) })
    expect(adr.endsWith('\n\n# Adopt events\n\n**Status** (Proposed)\n\nbody\n')).toBe(true)
    expect(parseFrontmatter(adr).frontmatter.title).toBe('Adopt events')
  })

  it('appends to a section index, creating it without frontmatter when absent', () => {
    expect(appendToIndex(null, 'Docs', 'overview.md', 'Overview', 'One\nline')).toBe('# Docs\n\n- [Overview](overview.md) - One line\n')
    expect(appendToIndex('# Docs\n\n- [A](a.md)\n\n', 'Docs', 'b.md', 'B [x]')).toBe('# Docs\n\n- [A](a.md)\n- [B \\[x\\]](b.md)\n')
  })

  it('derives default folders, titles and directive lines', () => {
    expect(defaultDocsDir('docs')).toBe('docs')
    expect(defaultDocsDir('adrs', 'shop')).toBe('adrs/shop')
    expect(dirTitle('docs', 'docs/api-gateway')).toBe('Api gateway')
    expect(dirTitle('adrs', 'x')).toBe('Architecture decision records')
    expect(docsDirectiveLine('docs', 'docs/shop')).toBe('!docs docs/shop')
    expect(docsDirectiveLine('adrs', 'my decisions')).toBe('!adrs "my decisions"')
  })
})
