import { describe, expect, it } from 'vitest'
import { buildDocsContext, conceptId, conceptTitleMap } from './docsContext'
import { bundleKey, parseDocsBundle } from '@/lib/docs/bundle'
import { parseDSL } from '@/lib/dsl'

const DSL = `
workspace "Shop" {
    !docs docs
    !adrs decisions
    model {
        cust = person "Customer"
        shop = softwareSystem "Shop" {
            !adrs decisions/shop
            web = container "Web" {
                !docs docs/web
            }
        }
        billing = softwareSystem "Billing" {
            !docs docs/billing
        }
    }
    views {
        container shop "Containers" { include * }
    }
}`

const ws = () => parseDSL(DSL).workspace

function bundles() {
  return {
    [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', [
      { name: 'overview.md', text: '---\ntitle: Overview\n---\n\n# Overview\n\nThe shop.' },
    ]),
    [bundleKey('adrs', 'decisions')]: parseDocsBundle('adrs', 'decisions', [
      { name: '0001-monolith.md', text: '# 1. Monolith\n\n## Status\n\nSuperseded by [2](0002-services.md)\n\n## Decision\n\nOne app.' },
      { name: '0002-services.md', text: '# 2. Services\n\n## Status\n\nAccepted\n\n## Decision\n\nSplit it.' },
    ]),
    [bundleKey('adrs', 'decisions/shop')]: parseDocsBundle('adrs', 'decisions/shop', [
      { name: '0001-postgres.md', text: '---\ntype: Decision\ntitle: Use Postgres\nstatus: Accepted\n---\n\n# Use Postgres\n\nBecause.' },
    ]),
    [bundleKey('docs', 'docs/web')]: parseDocsBundle('docs', 'docs/web', [
      { name: 'ui.md', text: '# UI\n\nReact.' },
    ]),
    [bundleKey('docs', 'docs/billing')]: parseDocsBundle('docs', 'docs/billing', [
      { name: 'invoices.md', text: '# Invoices\n\nMonthly.' },
    ]),
  }
}

const ids = (text: string) => [...text.matchAll(/^=== (\S+) \|/gm)].map((m) => m[1])

describe('buildDocsContext', () => {
  it('is null when nothing is loaded', () => {
    expect(buildDocsContext({}, ws())).toBeNull()
    expect(buildDocsContext({ [bundleKey('docs', 'docs')]: null }, ws())).toBeNull()
  })

  it('ranks element docs first for a whole-model run, then workspace decisions, docs, and superseded last', () => {
    const ctx = buildDocsContext(bundles(), ws())!
    expect(ids(ctx.text)).toEqual([
      'decisions/shop/0001-postgres',
      'docs/web/ui',
      'docs/billing/invoices',
      'decisions/0002-services',
      'docs/overview',
      'decisions/0001-monolith',
    ])
    expect(ctx.included).toBe(6)
    expect(ctx.omitted).toBe(0)
    expect([...ctx.conceptIds]).toHaveLength(6)
    expect(ctx.titles.get('decisions/shop/0001-postgres')).toBe('Use Postgres')
    expect(ctx.text).toContain('=== decisions/shop/0001-postgres | Decision | Accepted | Use Postgres | about: Shop')
    expect(ctx.text).toContain('=== decisions/0001-monolith | Decision | Superseded | Monolith')
  })

  it('puts documents on elements in the current view first and other elements\' documents last', () => {
    const w = ws()
    const view = w.views.containerViews[0]
    // The container view shows Shop's containers; Shop is the scope boundary.
    expect(view.elements.some((e) => e.id === 'web')).toBe(true)
    const ctx = buildDocsContext(bundles(), w, view)!
    const order = ids(ctx.text)
    expect(order.indexOf('docs/web/ui')).toBeLessThan(order.indexOf('decisions/0002-services'))
    expect(order.indexOf('decisions/0002-services')).toBeLessThan(order.indexOf('docs/billing/invoices'))
    expect(order[order.length - 1]).toBe('decisions/0001-monolith')
  })

  it.each(['container', 'component'] as const)('prioritizes the %s view scope even when it is not a view element', (type) => {
    const w = parseDSL(`workspace "Shop" {
      !docs docs
      model {
        shop = softwareSystem "Shop" {
          !adrs decisions/shop
          web = container "Web" {
            !adrs decisions/web
            ui = component "UI"
          }
        }
      }
      views {
        container shop "Containers" { include * }
        component web "Components" { include * }
      }
    }`).workspace
    const view = type === 'container' ? w.views.containerViews[0] : w.views.componentViews[0]
    const scopeId = type === 'container' ? 'shop' : 'web'
    expect(view.elements.some((e) => e.id === scopeId)).toBe(false)
    const b = {
      [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', Array.from({ length: 6 }, (_, i) => ({
        name: `${i}.md`, text: `# General ${i}\n\n${'General guidance.\n'.repeat(140)}`,
      }))),
      [bundleKey('adrs', `decisions/${scopeId}`)]: parseDocsBundle('adrs', `decisions/${scopeId}`, [{
        name: '0001-postgres.md', text: '# Use Postgres\n\n## Status\n\nAccepted\n\n## Decision\n\nUse Postgres.',
      }]),
    }
    const ctx = buildDocsContext(b, w, view)!
    expect(ctx.omitted).toBeGreaterThan(0)
    expect(ids(ctx.text)[0]).toBe(`decisions/${scopeId}/0001-postgres`)
    expect(ctx.conceptIds.has(`decisions/${scopeId}/0001-postgres`)).toBe(true)
  })

  it('renders frontmatter supersession as history with replacement references', () => {
    const b = {
      [bundleKey('adrs', 'decisions')]: parseDocsBundle('adrs', 'decisions', [
        { name: '0001-old.md', text: '---\ntitle: Old storage\nstatus: Accepted\nsuperseded_by: [0002-new.md]\n---\n\nUse MySQL.' },
        { name: '0002-new.md', text: '---\ntitle: New storage\nstatus: Accepted\nsupersedes: [0001-old.md]\n---\n\nUse Postgres.' },
      ]),
    }
    const ctx = buildDocsContext(b, ws())!
    expect(ids(ctx.text)).toEqual(['decisions/0002-new', 'decisions/0001-old'])
    expect(ctx.text).toContain('=== decisions/0001-old | Decision | Superseded | Old storage')
    expect(ctx.text).toContain('=== decisions/0002-new | Decision | Accepted | New storage')
    expect(ctx.text).toContain('Superseded by (files in this bundle): 0002-new.md')
    expect(ctx.text).toContain('Supersedes (files in this bundle): 0001-old.md')
    expect(b[bundleKey('adrs', 'decisions')].concepts[0].status).toBe('Accepted')
  })

  it('respects the character budget and reports what it left out', () => {
    const ctx = buildDocsContext(bundles(), ws(), null, { maxChars: 260 })!
    expect(ctx.included).toBeGreaterThan(0)
    expect(ctx.included).toBeLessThan(6)
    expect(ctx.omitted).toBe(6 - ctx.included)
    expect(ctx.text).toContain(`DOCUMENTATION (${ctx.included} of 6 documents`)
    // Always at least the top-ranked document, even over budget.
    expect(buildDocsContext(bundles(), ws(), null, { maxChars: 1 })!.included).toBe(1)
  })

  it('prioritizes cited documents within the existing budget and ignores unknown ids', () => {
    const options = { maxChars: 260 }
    expect(buildDocsContext(bundles(), ws(), null, options)!.conceptIds.has('docs/billing/invoices')).toBe(false)
    const ctx = buildDocsContext(bundles(), ws(), null, {
      ...options, preferredConceptIds: ['missing/doc', 'docs/billing/invoices'],
    })!
    expect(ids(ctx.text)[0]).toBe('docs/billing/invoices')
    expect(ctx.text).toContain('Monthly.')
    expect(ctx.conceptIds.has('missing/doc')).toBe(false)
    expect(ctx.omitted).toBeGreaterThan(0)
  })

  it('keeps a preferred superseded citation labelled as history', () => {
    const ctx = buildDocsContext(bundles(), ws(), null, {
      maxChars: 1, preferredConceptIds: ['decisions/0001-monolith'],
    })!
    expect(ids(ctx.text)).toEqual(['decisions/0001-monolith'])
    expect(ctx.text).toContain('Decision | Superseded | Monolith')
  })

  it('clips long bodies at a line break and marks the cut', () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    const b = { [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', [{ name: 'big.md', text: `# Big\n\n${long}` }]) }
    const ctx = buildDocsContext(b, ws(), null, { maxDocChars: 120 })!
    expect(ctx.text).toContain('…(truncated)')
    expect(ctx.text.length).toBeLessThan(600)
    expect(ctx.text).not.toContain('line 199')
  })

  it('never shows one document twice when two scopes share a folder', () => {
    const w = parseDSL('workspace "W" {\n  !docs docs\n  model {\n    s = softwareSystem "S" {\n      !docs docs\n    }\n  }\n}').workspace
    const b = { [bundleKey('docs', 'docs')]: parseDocsBundle('docs', 'docs', [{ name: 'a.md', text: '# A' }]) }
    const ctx = buildDocsContext(b, w)!
    expect(ids(ctx.text)).toEqual(['docs/a'])
  })
})

describe('helpers', () => {
  it('conceptId strips .md; conceptTitleMap spans every bundle', () => {
    expect(conceptId({ path: 'decisions/0001-x.md' })).toBe('decisions/0001-x')
    const titles = conceptTitleMap(bundles())
    expect(titles.get('docs/overview')).toBe('Overview')
    expect(titles.get('decisions/0002-services')).toBe('Services')
    expect(titles.size).toBe(6)
  })
})
