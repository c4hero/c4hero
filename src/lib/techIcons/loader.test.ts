import { describe, it, expect, afterEach } from 'vitest'
import { isTechIconCatalogLoaded, settleTechIcons, TECH_ICON_PENDING_ATTR } from './loader'

afterEach(() => { document.body.innerHTML = '' })

describe('settleTechIcons (TEA-385)', () => {
  // Order matters: the catalog is module state, loaded once per page.
  it('returns at once, without loading the catalog, when no node is waiting for a logo', async () => {
    document.body.innerHTML = '<div class="c4-node"></div>'
    await settleTechIcons()
    expect(isTechIconCatalogLoaded()).toBe(false)
  })

  it('loads the catalog when a node is waiting for its logo', async () => {
    document.body.innerHTML = `<div class="c4-node" ${TECH_ICON_PENDING_ATTR}></div>`
    await settleTechIcons()
    expect(isTechIconCatalogLoaded()).toBe(true)
  })

  it('only looks inside the root it is given', async () => {
    document.body.innerHTML = `<div id="a"></div><div id="b" ${TECH_ICON_PENDING_ATTR}></div>`
    await expect(settleTechIcons(document.getElementById('a')!)).resolves.toBeUndefined()
  })
})
