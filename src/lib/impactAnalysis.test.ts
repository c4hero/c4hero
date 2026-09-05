import { describe, expect, it } from 'vitest'
import {
  analyzeImpact,
  formatImpactHeadline,
  formatImpactPath,
  DEFAULT_IMPACT_DEPTH,
} from './impactAnalysis'
import type { Relationship, Workspace } from '@/types/model'

/**
 * A small but realistic model:
 *
 *   Customer -> Web App -> API -> Database
 *   Ops      -> API
 *   API      -> Email System
 *
 * with the API and Web App inside the Shop system (API holding two components)
 * and Email System a separate, external system.
 */
function workspace(): Workspace {
  const rel = (id: string, sourceId: string, destinationId: string, description: string): Relationship => ({
    id, sourceId, destinationId, description, tags: [], properties: {},
  })
  return {
    name: 'Shop',
    model: {
      people: [
        { id: 'cust', type: 'person', name: 'Customer', tags: [], properties: {} },
        { id: 'ops', type: 'person', name: 'Ops', tags: [], properties: {} },
      ],
      softwareSystems: [
        {
          id: 'shop', type: 'softwareSystem', name: 'Shop', tags: [], properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web App', tags: [], properties: {}, components: [] },
            {
              id: 'api', type: 'container', name: 'API', tags: [], properties: {},
              components: [
                { id: 'router', type: 'component', name: 'Router', tags: [], properties: {} },
                { id: 'authz', type: 'component', name: 'Authz', tags: [], properties: {} },
              ],
            },
            { id: 'db', type: 'container', name: 'Database', tags: [], properties: {}, components: [] },
          ],
        },
        { id: 'email', type: 'softwareSystem', name: 'Email System', tags: [], properties: {}, containers: [] },
      ],
      relationships: [
        rel('r1', 'cust', 'web', 'Browses'),
        rel('r2', 'web', 'api', 'Calls'),
        rel('r3', 'api', 'db', 'Reads from'),
        rel('r4', 'ops', 'api', 'Operates'),
        rel('r5', 'api', 'email', 'Sends mail via'),
      ],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [
        { type: 'systemLandscape', key: 'landscape', title: 'Landscape', elements: [{ id: 'cust' }, { id: 'shop' }, { id: 'email' }], relationships: [] },
      ],
      systemContextViews: [
        { type: 'systemContext', key: 'ctx', title: 'Shop context', softwareSystemId: 'shop', elements: [{ id: 'cust' }, { id: 'shop' }], relationships: [] },
      ],
      containerViews: [
        {
          type: 'container', key: 'containers', title: 'Shop containers', softwareSystemId: 'shop',
          elements: [{ id: 'web' }, { id: 'api' }, { id: 'db' }, { id: 'cust' }],
          relationships: [{ id: 'r2' }, { id: 'r3' }],
        },
      ],
      componentViews: [
        {
          type: 'component', key: 'api-components', title: 'API components', containerId: 'api',
          elements: [{ id: 'router' }, { id: 'authz' }], relationships: [],
        },
      ],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

const nameOf = <T extends { name: string }>(entries: T[]) => entries.map((entry) => entry.name)

describe('analyzeImpact — what disappears', () => {
  it('reports the target itself', () => {
    const report = analyzeImpact(workspace(), ['db'])
    expect(nameOf(report.targets)).toEqual(['Database'])
    expect(report.descendants).toEqual([])
    expect(report.removedIds).toEqual(['db'])
  })

  it('rolls a container up with the components inside it', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect(nameOf(report.targets)).toEqual(['API'])
    expect(nameOf(report.descendants)).toEqual(['Authz', 'Router'])
    expect(report.summary.removed).toBe(3)
  })

  it('rolls a system up with every container and component under it', () => {
    const report = analyzeImpact(workspace(), ['shop'])
    expect(nameOf(report.targets)).toEqual(['Shop'])
    expect(nameOf(report.descendants)).toEqual(['API', 'Authz', 'Database', 'Router', 'Web App'])
  })

  it('records the path to a nested element', () => {
    const report = analyzeImpact(workspace(), ['api'])
    const router = report.descendants.find((entry) => entry.name === 'Router')!
    expect(router.parentPath).toEqual(['Shop', 'API'])
    expect(formatImpactPath(router)).toBe('Shop / API / Router')
  })

  it('ignores ids that are not in the model', () => {
    const report = analyzeImpact(workspace(), ['nope'])
    expect(report.targets).toEqual([])
    expect(report.brokenLinks).toEqual([])
    expect(formatImpactHeadline(report)).toBe('Nothing selected')
  })
})

describe('analyzeImpact — relationships', () => {
  it('lists every relationship that loses an endpoint, with which side survives', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect(report.brokenLinks.map((link) => [link.id, link.side])).toEqual([
      ['r2', 'inbound'],
      ['r3', 'outbound'],
      ['r4', 'inbound'],
      ['r5', 'outbound'],
    ])
    expect(report.brokenLinks[0]).toMatchObject({
      sourceName: 'Web App', destinationName: 'API', description: 'Calls',
    })
  })

  it('marks a relationship as internal when both ends are removed', () => {
    const ws = workspace()
    ws.model.relationships.push({
      id: 'r6', sourceId: 'router', destinationId: 'authz', description: 'Checks with', tags: [], properties: {},
    })
    const report = analyzeImpact(ws, ['api'])
    expect(report.brokenLinks.find((link) => link.id === 'r6')!.side).toBe('internal')
  })

  it('leaves untouched relationships alone', () => {
    const report = analyzeImpact(workspace(), ['db'])
    expect(report.brokenLinks.map((link) => link.id)).toEqual(['r3'])
  })
})

describe('analyzeImpact — who is affected', () => {
  it('finds the direct dependents that break', () => {
    const report = analyzeImpact(workspace(), ['api'])
    const direct = report.dependents.filter((entry) => entry.depth === 1)
    expect(nameOf(direct)).toEqual(['Ops', 'Web App'])
  })

  it('follows the chain outward with the depth it was reached at', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect(report.dependents.map((entry) => [entry.name, entry.depth])).toEqual([
      ['Ops', 1], ['Web App', 1], ['Customer', 2],
    ])
  })

  it('stops at the requested depth', () => {
    const report = analyzeImpact(workspace(), ['api'], { maxDepth: 1 })
    expect(nameOf(report.dependents)).toEqual(['Ops', 'Web App'])
  })

  it('treats a depth below one as one rather than searching nothing', () => {
    const report = analyzeImpact(workspace(), ['api'], { maxDepth: 0 })
    expect(nameOf(report.dependents)).toEqual(['Ops', 'Web App'])
  })

  it('separates what the removed set relied on from what relied on it', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect(nameOf(report.dependencies)).toEqual(['Database', 'Email System'])
  })

  it('never routes a path through something that is also being removed', () => {
    // Removing the whole Shop system removes Web App too, so Customer is a
    // direct neighbour of the removed set, not a two-hop one.
    const report = analyzeImpact(workspace(), ['shop'])
    expect(report.dependents.map((entry) => [entry.name, entry.depth])).toEqual([
      ['Customer', 1], ['Ops', 1],
    ])
  })

  it('defaults to a depth of three', () => {
    expect(DEFAULT_IMPACT_DEPTH).toBe(3)
    const report = analyzeImpact(workspace(), ['api'])
    expect(report.dependents.every((entry) => entry.depth <= 3)).toBe(true)
  })
})

describe('analyzeImpact — orphans', () => {
  it('flags elements left with no relationships at all', () => {
    // Email System's only link is API -> Email System; Ops' only link is
    // Ops -> API; Database's only link is API -> Database.
    const report = analyzeImpact(workspace(), ['api'])
    expect(nameOf(report.orphaned)).toEqual(['Database', 'Email System', 'Ops'])
  })

  it('does not flag an element that keeps a relationship', () => {
    const report = analyzeImpact(workspace(), ['db'])
    expect(report.orphaned).toEqual([])
  })

  it('does not flag an element that never had a relationship', () => {
    const ws = workspace()
    ws.model.people.push({ id: 'lonely', type: 'person', name: 'Lonely', tags: [], properties: {} })
    const report = analyzeImpact(ws, ['api'])
    expect(nameOf(report.orphaned)).not.toContain('Lonely')
  })
})

describe('analyzeImpact — views', () => {
  it('warns that scoped views disappear with their scope element', () => {
    const report = analyzeImpact(workspace(), ['shop'])
    const deleted = report.views.filter((view) => view.deleted)
    // The component view goes too — its container went with the system.
    expect(deleted.map((view) => view.key).sort()).toEqual(['api-components', 'containers', 'ctx'])
    expect(report.summary.viewsDeleted).toBe(3)
  })

  it('deletes a component view when its container goes', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect(report.views.find((view) => view.key === 'api-components')).toMatchObject({ deleted: true })
  })

  it('deletes a component view when the parent system goes', () => {
    const report = analyzeImpact(workspace(), ['shop'])
    expect(report.views.find((view) => view.key === 'api-components')).toMatchObject({ deleted: true })
  })

  it('counts elements a surviving view would lose', () => {
    const report = analyzeImpact(workspace(), ['db'])
    expect(report.views).toEqual([
      { key: 'containers', title: 'Shop containers', type: 'container', deleted: false, lostElements: 1 },
    ])
    expect(report.summary.viewsChanged).toBe(1)
  })

  it('leaves untouched views out of the report entirely', () => {
    const report = analyzeImpact(workspace(), ['db'])
    expect(report.views.map((view) => view.key)).not.toContain('landscape')
  })
})

describe('analyzeImpact — isolation', () => {
  it('says so plainly when nothing else is affected', () => {
    const ws = workspace()
    ws.model.people.push({ id: 'lonely', type: 'person', name: 'Lonely', tags: [], properties: {} })
    ws.views.systemLandscapeViews[0].elements.push({ id: 'lonely' })

    const report = analyzeImpact(ws, ['lonely'])
    expect(report.isolated).toBe(true)
    expect(formatImpactHeadline(report)).toBe('Removing "Lonely" affects nothing else')
    // The view it sat on still loses it — that is not fallout, just arithmetic.
    expect(report.views).toEqual([
      expect.objectContaining({ key: 'landscape', deleted: false, lostElements: 1 }),
    ])
  })

  it('is not isolated when anything at all breaks', () => {
    expect(analyzeImpact(workspace(), ['db']).isolated).toBe(false)
  })
})

describe('analyzeImpact — output for the canvas', () => {
  it('offers the removed set plus its direct neighbours for selection', () => {
    const report = analyzeImpact(workspace(), ['api'])
    expect([...report.affectedIds].sort()).toEqual(
      ['api', 'authz', 'db', 'email', 'ops', 'router', 'web'],
    )
  })

  it('is deterministic', () => {
    const ws = workspace()
    expect(JSON.stringify(analyzeImpact(ws, ['api']))).toBe(JSON.stringify(analyzeImpact(ws, ['api'])))
  })

  it('handles several targets at once', () => {
    const report = analyzeImpact(workspace(), ['web', 'db'])
    expect(nameOf(report.targets)).toEqual(['Database', 'Web App'])
    expect(report.brokenLinks.map((link) => link.id)).toEqual(['r1', 'r2', 'r3'])
    expect(nameOf(report.dependents.filter((entry) => entry.depth === 1))).toEqual(['API', 'Customer'])
  })
})

describe('formatImpactHeadline', () => {
  it('leads with the relationships that break', () => {
    expect(formatImpactHeadline(analyzeImpact(workspace(), ['db'])))
      .toBe('Removing "Database" breaks 1 relationship and 1 dependent')
  })

  it('names every kind of fallout for a big removal', () => {
    const headline = formatImpactHeadline(analyzeImpact(workspace(), ['api']))
    expect(headline).toContain('4 relationships')
    expect(headline).toContain('2 dependents')
    expect(headline).toContain('1 view deleted')
    expect(headline).toContain('3 elements orphaned')
  })

  it('counts multiple targets rather than naming them all', () => {
    expect(formatImpactHeadline(analyzeImpact(workspace(), ['web', 'db']))).toContain('2 elements')
  })
})
