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
    // The container view of Shop shows Shop's containers (and Shop itself, plus context).
    expect(view.elements.some((e) => e.id === 'web')).toBe(true)
    const ctx = buildDocsContext(bundles(), w, view)!
    const order = ids(ctx.text)
    expect(order.indexOf('docs/web/ui')).toBeLessThan(order.indexOf('decisions/0002-services'))
    expect(order.indexOf('decisions/0002-services')).toBeLessThan(order.indexOf('docs/billing/invoices'))
    expect(order[order.length - 1]).toBe('decisions/0001-monolith')
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
