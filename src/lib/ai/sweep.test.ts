import { describe, it, expect } from 'vitest'
import { missingInfoGaps, modelHealthPercent, projectedHealthPercent, gapToOp, type MissingGap } from './sweep'
import { makeWorkspace } from './testFixture'
import type { Workspace } from '@/types/model'

function emptyViews() {
  return { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } }
}

function gapOf(gaps: MissingGap[], key: string): MissingGap | undefined {
  return gaps.find((g) => g.key === key)
}

describe('missingInfoGaps', () => {
  it('enumerates desc, tech and rel gaps from the fixture', () => {
    const gaps = missingInfoGaps(makeWorkspace())
    const keys = gaps.map((g) => g.key)
    // admin (person), cart (component), db (container) have no description.
    expect(keys).toEqual(expect.arrayContaining(['desc:admin', 'desc:cart', 'desc:db']))
    // cart + db have no technology (web has React).
    expect(keys).toEqual(expect.arrayContaining(['tech:cart', 'tech:db']))
    expect(keys).not.toContain('tech:web')
    // r2 (web → db) has no description.
    expect(keys).toContain('rel:r2')
    expect(keys).not.toContain('rel:r1')
    // No empty-named elements in the fixture → no title gaps.
    expect(keys.some((k) => k.startsWith('title:'))).toBe(false)
  })

  it('labels a relationship gap as "Source → Destination"', () => {
    const gaps = missingInfoGaps(makeWorkspace())
    expect(gapOf(gaps, 'rel:r2')?.label).toBe('Web App → Database')
    expect(gapOf(gaps, 'rel:r2')?.targetKind).toBe('relationship')
  })

  it('limits gaps and health to the given view scope ids', () => {
    const ws = makeWorkspace()
    const ids = new Set(['web', 'db']) // web is fully filled; db is missing desc + tech
    const keys = missingInfoGaps(ws, ids).map((g) => g.key)
    expect(keys).toEqual(expect.arrayContaining(['desc:db', 'tech:db']))
    expect(keys).not.toContain('desc:cart') // out of scope
    expect(keys).not.toContain('desc:admin')
    expect(keys).not.toContain('rel:r2') // relationship not in scope
    // Over {web, db}: web desc+tech filled, db both empty → 2 of 4 slots = 50%.
    expect(modelHealthPercent(ws, ids)).toBe(50)
  })

  it('flags an element with a blank name as a title gap', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: '  ', description: 'x', tags: [], properties: {} }],
        softwareSystems: [], relationships: [], groups: [],
      },
      views: emptyViews(),
    }
    const titles = missingInfoGaps(ws).filter((g) => g.kind === 'title')
    expect(titles).toHaveLength(1)
    expect(titles[0]).toMatchObject({ key: 'title:p', targetId: 'p', targetKind: 'element' })
  })

  it('returns no gaps for a fully-specified model', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: 'User', description: 'A user', tags: [], properties: {} }],
        softwareSystems: [{
          id: 's', type: 'softwareSystem', name: 'Sys', description: 'sys', tags: [], properties: {},
          containers: [{ id: 'c', type: 'container', name: 'API', description: 'api', technology: 'Go', tags: [], properties: {}, components: [] }],
        }],
        relationships: [{ id: 'r', sourceId: 'p', destinationId: 'c', description: 'uses', tags: [], properties: {} }],
        groups: [],
      },
      views: emptyViews(),
    }
    expect(missingInfoGaps(ws)).toEqual([])
  })
})

describe('modelHealthPercent', () => {
  it('is 100 for an empty model', () => {
    const ws: Workspace = { name: 'E', model: { people: [], softwareSystems: [], relationships: [], groups: [] }, views: emptyViews() }
    expect(modelHealthPercent(ws)).toBe(100)
  })

  it('is 100 for a fully-specified model', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: 'User', description: 'A user', tags: [], properties: {} }],
        softwareSystems: [{
          id: 's', type: 'softwareSystem', name: 'Sys', description: 'sys', tags: [], properties: {},
          containers: [{ id: 'c', type: 'container', name: 'API', description: 'api', technology: 'Go', tags: [], properties: {}, components: [] }],
        }],
        relationships: [{ id: 'r', sourceId: 'p', destinationId: 'c', description: 'uses', tags: [], properties: {} }],
        groups: [],
      },
      views: emptyViews(),
    }
    expect(modelHealthPercent(ws)).toBe(100)
  })

  it('drops below 100 when the fixture has gaps', () => {
    // 6 desc slots (3 filled) + 3 tech slots (1 filled) + 2 rel slots (1 filled)
    // = 5/11 ≈ 45%.
    expect(modelHealthPercent(makeWorkspace())).toBe(45)
  })
})

describe('projectedHealthPercent', () => {
  it('rises as missing-info gaps are staged, reaching 100 when all are filled', () => {
    const ws = makeWorkspace()
    const base = modelHealthPercent(ws)
    const coverageGaps = missingInfoGaps(ws).filter((g) => g.kind !== 'title')
    const all = new Set(coverageGaps.map((g) => g.key))
    expect(projectedHealthPercent(ws, all)).toBe(100)
    const one = new Set([coverageGaps[0].key])
    expect(projectedHealthPercent(ws, one)).toBeGreaterThan(base)
  })

  it('ignores title gaps (they don\'t affect coverage)', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: '', description: 'x', tags: [], properties: {} }],
        softwareSystems: [], relationships: [], groups: [],
      },
      views: emptyViews(),
    }
    // Only a title gap exists; coverage is already 100 (the person has a description, no tech/rel slots).
    expect(projectedHealthPercent(ws, new Set(['title:p']))).toBe(100)
  })
})

describe('gapToOp', () => {
  const base = { targetKind: 'element' as const, label: 'X' }
  it('maps each kind to the right operation and trims the value', () => {
    expect(gapToOp({ key: 'desc:e', kind: 'desc', targetId: 'e', ...base }, '  hello ')).toEqual({ op: 'updateElement', id: 'e', description: 'hello' })
    expect(gapToOp({ key: 'tech:e', kind: 'tech', targetId: 'e', ...base }, 'Go')).toEqual({ op: 'updateElement', id: 'e', technology: 'Go' })
    expect(gapToOp({ key: 'title:e', kind: 'title', targetId: 'e', ...base }, 'Name')).toEqual({ op: 'updateElement', id: 'e', name: 'Name' })
    expect(gapToOp({ key: 'rel:r', kind: 'rel', targetId: 'r', targetKind: 'relationship', label: 'A → B' }, 'calls')).toEqual({ op: 'updateRelationship', id: 'r', description: 'calls' })
  })
})

