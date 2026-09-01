import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { exportWorkspaceAsHtml, htmlExportFilename, wrapText } from './htmlExport'
import { createBigBankSample } from './templates'
import { parseDSL } from './dsl'
import type { Workspace } from '@/types/model'

const SHOP_DSL = `
workspace "Shop" "An online store" {
  model {
    cust = person "Customer" "Buys things"
    shop = softwareSystem "Shop" "The store" {
      web = container "Web App" "Storefront UI" "React"
      db = container "Database" "Orders and users" "Postgres"
      web -> db "Reads from" "SQL"
    }
    cust -> web "Browses"
  }
  views {
    systemContext shop "Context" { include * }
    container shop "Containers" { include * }
  }
}`

function shop(): Workspace {
  return parseDSL(SHOP_DSL).workspace
}

function dom(html: string): { window: Window & typeof globalThis; document: Document } {
  const jsdom = new JSDOM(html, { runScripts: 'dangerously' })
  return {
    window: jsdom.window as unknown as Window & typeof globalThis,
    document: jsdom.window.document,
  }
}

function click(document: Document, element: Element) {
  const MouseEvent = document.defaultView!.MouseEvent
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('wrapText', () => {
  it('returns nothing for blank text', () => {
    expect(wrapText('   ', 10, 2)).toEqual([])
  })

  it('wraps on word boundaries', () => {
    expect(wrapText('the quick brown fox jumps', 11, 5)).toEqual(['the quick', 'brown fox', 'jumps'])
  })

  it('hard-breaks a word longer than the line', () => {
    expect(wrapText('supercalifragilistic', 8, 5)).toEqual(['supercal', 'ifragili', 'stic'])
  })

  it('ellipsizes past the line budget instead of growing the node', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', 9, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('...')).toBe(true)
  })

  it('collapses runs of whitespace', () => {
    expect(wrapText('a\n\n  b', 20, 2)).toEqual(['a b'])
  })
})

describe('exportWorkspaceAsHtml — document shape', () => {
  it('emits a complete standalone document', () => {
    const html = exportWorkspaceAsHtml(shop())
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<title>Shop</title>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('locks itself down with a no-network CSP', () => {
    const html = exportWorkspaceAsHtml(shop())
    expect(html).toContain(`http-equiv="Content-Security-Policy"`)
    expect(html).toContain(`default-src 'none'`)
  })

  it('never references anything outside the file', () => {
    const html = exportWorkspaceAsHtml(shop())
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i)
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<img\b/i)
    expect(html).not.toContain('@import')
    // No CSS asset references either — url() would fetch.
    expect(html).not.toMatch(/url\((?!#)/)
  })

  it('renders one stage and one tab per drawable view', () => {
    const html = exportWorkspaceAsHtml(shop())
    expect(html.match(/class="stage"/g)).toHaveLength(2)
    expect(html).toContain('data-view="Context"')
    expect(html).toContain('data-view="Containers"')
  })

  it('shows the first view even with scripts blocked', () => {
    const html = exportWorkspaceAsHtml(shop())
    const stages = html.match(/<div class="stage" data-view="[^"]+"( hidden)?>/g)!
    expect(stages[0]).not.toContain('hidden')
    expect(stages[1]).toContain('hidden')
  })

  it('is deterministic', () => {
    expect(exportWorkspaceAsHtml(shop())).toBe(exportWorkspaceAsHtml(shop()))
  })

  it('skips view types the canvas cannot draw yet', () => {
    const ws = shop()
    ws.views.deploymentViews.push({
      type: 'deployment', key: 'Live', title: 'Live', environment: 'Live', elements: [], relationships: [],
    })
    expect(exportWorkspaceAsHtml(ws).match(/class="stage"/g)).toHaveLength(2)
  })

  it('handles a workspace with no views at all', () => {
    const ws = shop()
    ws.views.systemContextViews = []
    ws.views.containerViews = []
    ws.views.systemLandscapeViews = []
    ws.views.componentViews = []
    const html = exportWorkspaceAsHtml(ws)
    expect(html).toContain('no views to render')
  })

  it('does not blow a tiny diagram up to fill the screen', () => {
    const ws = shop()
    ws.views.containerViews = []
    ws.views.systemContextViews[0].elements = [{ id: 'cust' }]
    ws.views.systemContextViews[0].relationships = []
    const viewBox = exportWorkspaceAsHtml(ws).match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)!
    expect(Number(viewBox[1])).toBeGreaterThanOrEqual(1100)
    expect(Number(viewBox[2])).toBeGreaterThanOrEqual(680)
  })

  it('lets a large diagram set its own viewBox', () => {
    const big = exportWorkspaceAsHtml(createBigBankSample())
    const widths = Array.from(big.matchAll(/viewBox="0 0 (\d+(?:\.\d+)?) /g)).map((m) => Number(m[1]))
    expect(Math.max(...widths)).toBeGreaterThan(1100)
  })

  it('names the file after the workspace', () => {
    expect(htmlExportFilename(shop())).toBe('Shop.html')
    expect(htmlExportFilename({ ...shop(), name: '  ' })).toBe('workspace.html')
  })
})

describe('exportWorkspaceAsHtml — untrusted content', () => {
  it('escapes markup in element names instead of emitting it', () => {
    const ws = shop()
    ws.model.people[0].name = '<script>alert(1)</script>'
    const html = exportWorkspaceAsHtml(ws)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    // The JSON island must not be closable from inside a string either.
    expect(html).toContain('\\u003c/script')
  })

  it('escapes quotes so attributes cannot be broken out of', () => {
    const ws = shop()
    ws.model.softwareSystems[0].containers[0].name = 'a" onload="x'
    const html = exportWorkspaceAsHtml(ws)
    expect(html).not.toContain('onload="x')
  })

  it('does not let a non-numeric stroke width reach the SVG', () => {
    const ws = shop()
    // Only reachable from hand-edited localStorage or an imported JSON — the
    // DSL parser rejects non-numbers — but the exporter should still be total.
    ws.views.configuration.styles.elements.push(
      { tag: 'Person', strokeWidth: '2" onload="x' as unknown as number },
    )
    const html = exportWorkspaceAsHtml(ws)
    expect(html).not.toContain('onload="x')
    expect(html).toContain('stroke-width="1.5"')
  })

  it('drops element URLs that are not http(s)', () => {
    const ws = shop()
    ws.model.people[0].url = 'javascript:alert(1)'
    ws.model.softwareSystems[0].url = 'https://runbook.example/shop'
    const html = exportWorkspaceAsHtml(ws)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('https://runbook.example/shop')
  })
})

describe('exportWorkspaceAsHtml — the Big Bank sample', () => {
  const html = exportWorkspaceAsHtml(createBigBankSample(), { generator: 'c4hero test' })

  it('stays far under the 1.5 MB budget', () => {
    expect(new TextEncoder().encode(html).length).toBeLessThan(1_500_000)
  })

  it('renders every drawable view of the sample', () => {
    const sample = createBigBankSample()
    const expected =
      sample.views.systemLandscapeViews.length +
      sample.views.systemContextViews.length +
      sample.views.containerViews.length +
      sample.views.componentViews.length
    expect(html.match(/class="stage"/g)).toHaveLength(expected)
  })

  it('draws a boundary around the containers of a container view', () => {
    expect(html).toContain('class="rect boundary"')
  })

  it('credits the generator', () => {
    expect(html).toContain('c4hero test')
  })
})

describe('the exported viewer, running', () => {
  it('shows the first view and hides the rest', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    const stages = document.querySelectorAll<HTMLElement>('.stage')
    expect(stages[0].hidden).toBe(false)
    expect(stages[1].hidden).toBe(true)
    expect(document.querySelector('.tab[aria-current]')!.getAttribute('data-view')).toBe('Context')
  })

  it('switches views from the tab bar', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    click(document, document.querySelector('.tab[data-view="Containers"]')!)

    const stages = document.querySelectorAll<HTMLElement>('.stage')
    expect(stages[0].hidden).toBe(true)
    expect(stages[1].hidden).toBe(false)
  })

  it('opens element details on click', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    const node = document.querySelector('.stage:not([hidden]) .node[data-id="cust"]')!
    click(document, node.querySelector('rect')!)

    const details = document.getElementById('details') as HTMLElement
    expect(details.hidden).toBe(false)
    expect(details.textContent).toContain('Customer')
    expect(details.textContent).toContain('Buys things')
    expect(node.classList.contains('selected')).toBe(true)
  })

  it('shows technology and tags for a container', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    click(document, document.querySelector('.tab[data-view="Containers"]')!)
    click(document, document.querySelector('.stage:not([hidden]) .node[data-id="web"]')!)

    const details = document.getElementById('details') as HTMLElement
    expect(details.textContent).toContain('React')
    expect(details.textContent).toContain('Technology')
  })

  it('clears the details panel when the background is clicked', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    click(document, document.querySelector('.stage:not([hidden]) .node')!)
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(false)

    click(document, document.querySelector('.stage:not([hidden]) svg')!)
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(true)
  })

  it('drills into a child view and comes back', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    click(document, document.querySelector('.stage:not([hidden]) .node[data-id="shop"]')!)

    const drill = Array.from(document.querySelectorAll('#details button'))
      .find((button) => button.textContent === 'Zoom in')!
    expect(drill).toBeTruthy()
    click(document, drill)

    expect(document.querySelector('.stage:not([hidden])')!.getAttribute('data-view')).toBe('Containers')
    const back = document.getElementById('back') as HTMLElement
    expect(back.hidden).toBe(false)

    click(document, back)
    expect(document.querySelector('.stage:not([hidden])')!.getAttribute('data-view')).toBe('Context')
  })

  it('drills through on double-click', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    const node = document.querySelector('.stage:not([hidden]) .node[data-id="shop"]')!
    node.dispatchEvent(new (document.defaultView!.MouseEvent)('dblclick', { bubbles: true }))
    expect(document.querySelector('.stage:not([hidden])')!.getAttribute('data-view')).toBe('Containers')
  })

  it('dims everything the search box does not match', () => {
    const { window, document } = dom(exportWorkspaceAsHtml(shop()))
    click(document, document.querySelector('.tab[data-view="Containers"]')!)

    const search = document.getElementById('q') as HTMLInputElement
    search.value = 'postgres'
    search.dispatchEvent(new window.Event('input', { bubbles: true }))

    const stage = document.querySelector('.stage:not([hidden])')!
    expect(stage.querySelector('.node[data-id="db"]')!.classList.contains('hit')).toBe(true)
    expect(stage.querySelector('.node[data-id="web"]')!.classList.contains('dim')).toBe(true)
  })

  it('clears the search, then the selection, on Escape', () => {
    const { window, document } = dom(exportWorkspaceAsHtml(shop()))
    const search = document.getElementById('q') as HTMLInputElement
    search.value = 'customer'
    search.dispatchEvent(new window.Event('input', { bubbles: true }))
    click(document, document.querySelector('.stage:not([hidden]) .node')!)

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(search.value).toBe('')

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(true)
  })

  it('renders a link only for a safe element URL', () => {
    const ws = shop()
    ws.model.people[0].url = 'https://wiki.example/customer'
    const { document } = dom(exportWorkspaceAsHtml(ws))
    click(document, document.querySelector('.stage:not([hidden]) .node[data-id="cust"]')!)

    const link = document.querySelector('#details a') as HTMLAnchorElement
    expect(link.href).toBe('https://wiki.example/customer')
    expect(link.rel).toBe('noreferrer noopener')
  })

  it('pans the viewport without touching the saved geometry', () => {
    const { document } = dom(exportWorkspaceAsHtml(shop()))
    const viewport = document.querySelector('.stage:not([hidden]) .viewport')!
    expect(viewport.getAttribute('transform')).toBe('translate(0,0) scale(1)')

    click(document, document.getElementById('fit')!)
    expect(viewport.getAttribute('transform')).toBe('translate(0,0) scale(1)')
  })

  it('survives a workspace whose only view is empty', () => {
    const ws = shop()
    ws.views.containerViews = []
    ws.views.systemContextViews[0].elements = []
    ws.views.systemContextViews[0].relationships = []
    const { document } = dom(exportWorkspaceAsHtml(ws))
    expect(document.querySelectorAll('.node')).toHaveLength(0)
    expect(document.querySelector('.stage:not([hidden])')).toBeTruthy()
  })
})
