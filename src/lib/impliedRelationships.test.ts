import { describe, it, expect } from 'vitest'
import { computeImpliedRelationships } from './impliedRelationships'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sys-a', type: 'softwareSystem', name: 'System A', tags: [], properties: {},
          containers: [
            {
              id: 'c-a1', type: 'container', name: 'API A', tags: [], properties: {},
              components: [
                { id: 'comp-a1', type: 'component', name: 'Auth', tags: [], properties: {} },
              ],
            },
          ],
        },
        {
          id: 'sys-b', type: 'softwareSystem', name: 'System B', tags: [], properties: {},
          containers: [
            {
              id: 'c-b1', type: 'container', name: 'API B', tags: [], properties: {},
              components: [
                { id: 'comp-b1', type: 'component', name: 'Billing', tags: [], properties: {} },
              ],
            },
          ],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function addRelationship(ws: Workspace, sourceId: string, destinationId: string, desc = 'calls') {
  ws.model.relationships.push({
    id: `rel-${ws.model.relationships.length}`,
    sourceId,
    destinationId,
    description: desc,
    tags: ['Relationship'],
    properties: {},
  })
}

describe('computeImpliedRelationships', () => {
  it('returns empty array when no explicit relationships exist', () => {
    const ws = makeWorkspace()
    expect(computeImpliedRelationships(ws)).toHaveLength(0)
  })

  it('returns empty array when relationship is within the same system', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'comp-a1', 'c-a1') // component → container within System A
    const implied = computeImpliedRelationships(ws)
    // No cross-system link, so no implied
    expect(implied).toHaveLength(0)
  })

  it('creates implied container→container from component→component across systems', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'comp-a1', 'comp-b1', 'calls billing')
    const implied = computeImpliedRelationships(ws)
    expect(implied.some(r => r.sourceId === 'c-a1' && r.destinationId === 'c-b1')).toBe(true)
  })

  it('creates implied system→system from component→component across systems', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'comp-a1', 'comp-b1', 'calls billing')
    const implied = computeImpliedRelationships(ws)
    expect(implied.some(r => r.sourceId === 'sys-a' && r.destinationId === 'sys-b')).toBe(true)
  })

  it('propagates technology from the explicit relationship', () => {
    const ws = makeWorkspace()
    ws.model.relationships.push({
      id: 'rel-0',
      sourceId: 'comp-a1',
      destinationId: 'comp-b1',
      description: 'sends to',
      technology: 'gRPC',
      tags: ['Relationship'],
      properties: {},
    })
    const implied = computeImpliedRelationships(ws)
    const sysRel = implied.find(r => r.sourceId === 'sys-a')
    expect(sysRel?.technology).toBe('gRPC')
  })

  it('does not create duplicate implied relationships for multiple component links', () => {
    const ws = makeWorkspace()
    // Two component→component links in the same direction
    addRelationship(ws, 'comp-a1', 'comp-b1', 'first call')
    addRelationship(ws, 'comp-a1', 'comp-b1', 'second call')
    const implied = computeImpliedRelationships(ws)
    const containerPairs = implied.filter(r => r.sourceId === 'c-a1' && r.destinationId === 'c-b1')
    const systemPairs = implied.filter(r => r.sourceId === 'sys-a' && r.destinationId === 'sys-b')
    expect(containerPairs).toHaveLength(1)
    expect(systemPairs).toHaveLength(1)
  })

  it('does not create implied relationships when explicit ones already exist', () => {
    const ws = makeWorkspace()
    // Add an explicit container→container relationship first
    ws.model.relationships.push({
      id: 'explicit-container',
      sourceId: 'c-a1',
      destinationId: 'c-b1',
      description: 'explicit',
      tags: ['Relationship'],
      properties: {},
    })
    addRelationship(ws, 'comp-a1', 'comp-b1', 'component link')
    const implied = computeImpliedRelationships(ws)
    // container→container already exists, should not be duplicated
    const containerRels = implied.filter(r => r.sourceId === 'c-a1' && r.destinationId === 'c-b1')
    expect(containerRels).toHaveLength(0)
  })

  it('implied relationships have the "Implied" tag', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'comp-a1', 'comp-b1')
    const implied = computeImpliedRelationships(ws)
    for (const r of implied) {
      expect(r.tags).toContain('Implied')
    }
  })

  it('implied relationship description includes [implied] prefix', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'comp-a1', 'comp-b1', 'sends event')
    const implied = computeImpliedRelationships(ws)
    for (const r of implied) {
      expect(r.description).toMatch(/\[implied\]/)
    }
  })

  it('container→container across systems creates implied system→system', () => {
    const ws = makeWorkspace()
    addRelationship(ws, 'c-a1', 'c-b1', 'REST call')
    const implied = computeImpliedRelationships(ws)
    // System-level implied relationship must exist
    expect(implied.some(r => r.sourceId === 'sys-a' && r.destinationId === 'sys-b')).toBe(true)
    // No container→container implied needed (the explicit rel is already at container level)
    const containerRels = implied.filter(r => r.sourceId === 'c-a1' && r.destinationId === 'c-b1')
    expect(containerRels).toHaveLength(0)
  })

  it('component→container across systems creates implied system→system only (no container→container)', () => {
    const ws = makeWorkspace()
    // comp-a1 (in sys-a, c-a1) → c-b1 (container in sys-b, not a component)
    addRelationship(ws, 'comp-a1', 'c-b1', 'calls endpoint')
    const implied = computeImpliedRelationships(ws)
    // System-level implied: comp-a1 is in sys-a, c-b1 is in sys-b
    expect(implied.some(r => r.sourceId === 'sys-a' && r.destinationId === 'sys-b')).toBe(true)
    // Container→container implied only happens for component→component pairs;
    // here dstContainer is undefined for c-b1, so no container→container implied
    const containerContainerRels = implied.filter(
      r => r.sourceId === 'c-a1' && r.destinationId === 'c-b1',
    )
    expect(containerContainerRels).toHaveLength(0)
  })

  it('relationship with no description produces [implied] description', () => {
    const ws = makeWorkspace()
    ws.model.relationships.push({
      id: 'rel-0', sourceId: 'comp-a1', destinationId: 'comp-b1',
      tags: ['Relationship'], properties: {},
    })
    const implied = computeImpliedRelationships(ws)
    for (const r of implied) {
      expect(r.description).toBe('[implied]')
    }
  })
})
