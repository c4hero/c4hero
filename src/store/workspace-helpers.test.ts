import { describe, it, expect } from 'vitest'
import { computeCascadeImpact } from './workspace-helpers'
import type { Workspace } from '@/types/model'

function ws(): Workspace {
  return {
    name: 'T',
    model: {
      people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {} }],
      softwareSystems: [
        { id: 'sysA', type: 'softwareSystem', name: 'A', tags: [], properties: {},
          containers: [
            { id: 'c1', type: 'container', name: 'C1', tags: [], properties: {},
              components: [{ id: 'cmp1', type: 'component', name: 'Cmp', tags: [], properties: {} }] },
            { id: 'c2', type: 'container', name: 'C2', tags: [], properties: {}, components: [] },
          ],
        },
        { id: 'sysB', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
      ],
      relationships: [
        { id: 'r1', sourceId: 'p1', destinationId: 'sysA', tags: [], properties: {} },
        { id: 'r2', sourceId: 'sysA', destinationId: 'sysB', tags: [], properties: {} },
        { id: 'r3', sourceId: 'p1', destinationId: 'sysB', tags: [], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{ type: 'systemLandscape', key: 'land', elements: [], relationships: [] }],
      systemContextViews: [{ type: 'systemContext', key: 'ctxA', softwareSystemId: 'sysA', elements: [], relationships: [] }],
      containerViews: [{ type: 'container', key: 'contA', softwareSystemId: 'sysA', elements: [], relationships: [] }],
      componentViews: [{ type: 'component', key: 'cmpC1', containerId: 'c1', elements: [], relationships: [] }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('computeCascadeImpact', () => {
  it('returns zero impact for empty input', () => {
    const impact = computeCascadeImpact(ws(), [])
    expect(impact.elementCount).toBe(0)
    expect(impact.descendantContainers).toBe(0)
    expect(impact.descendantComponents).toBe(0)
    expect(impact.relationships).toBe(0)
    expect(impact.scopedViews).toBe(0)
  })

  it('counts a system + every container + every component + every dependent view + every touching relationship', () => {
    const impact = computeCascadeImpact(ws(), ['sysA'])
    expect(impact.elementCount).toBe(1)
    expect(impact.descendantContainers).toBe(2)         // c1, c2
    expect(impact.descendantComponents).toBe(1)         // cmp1
    expect(impact.relationships).toBe(2)                // r1, r2 (r3 survives)
    expect(impact.scopedViews).toBe(3)                  // ctxA, contA, cmpC1
    expect(impact.elementNames).toEqual(['A'])
  })

  it('counts a person delete with no descendants', () => {
    const impact = computeCascadeImpact(ws(), ['p1'])
    expect(impact.elementCount).toBe(1)
    expect(impact.descendantContainers).toBe(0)
    expect(impact.descendantComponents).toBe(0)
    expect(impact.relationships).toBe(2)                // r1, r3
    expect(impact.scopedViews).toBe(0)
  })

  it('counts a container delete with descendants and dependent component view', () => {
    const impact = computeCascadeImpact(ws(), ['c1'])
    expect(impact.descendantContainers).toBe(0)
    expect(impact.descendantComponents).toBe(1)
    expect(impact.scopedViews).toBe(1)                  // cmpC1
  })

  it('does not mutate the workspace', () => {
    const w = ws()
    const before = JSON.stringify(w)
    computeCascadeImpact(w, ['sysA'])
    expect(JSON.stringify(w)).toBe(before)
  })
})
