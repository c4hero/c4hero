import { describe, it, expect } from 'vitest'
import type { AiProvider, RepoProposal } from './types'
import {
  suggestTags, generateDiagram, draftAdr,
  reviewArchitecture, planEdit, autoDescribe, scanRepo, listScanElements,
} from './features'
import { makeWorkspace } from './testFixture'

// A canned provider — features are pure orchestration over the AiProvider seam,
// so we inject fixed responses and assert the parsing/normalisation around them.
function makeProvider(opts: { text?: string; json?: unknown }): AiProvider {
  return {
    async complete() { return opts.text ?? '' },
    async completeJson<T>(): Promise<T> { return (opts.json ?? {}) as T },
  }
}

describe('suggestTags', () => {
  const target = { name: 'Orders DB', type: 'Container', technology: 'Postgres' }

  it('constrains output to the existing vocabulary, case-insensitively, de-duped', async () => {
    const provider = makeProvider({ json: { tags: ['database', 'External', 'External', 'Made up'] } })
    const tags = await suggestTags(provider, target, ['Database', 'External', 'Critical'])
    expect(tags).toEqual(['Database', 'External'])
  })

  it('proposes new tags (max 4, de-duped) when there is no vocabulary', async () => {
    const provider = makeProvider({ json: { tags: ['A', 'B', 'A', 'C', 'D', 'E'] } })
    expect(await suggestTags(provider, target, [])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('ignores non-string and blank entries', async () => {
    const provider = makeProvider({ json: { tags: [1, 'Keep', null, '   ', 'Keep'] } })
    expect(await suggestTags(provider, target, [])).toEqual(['Keep'])
  })

  it('returns an empty array when the model returns no tags array', async () => {
    expect(await suggestTags(makeProvider({ json: {} }), target, [])).toEqual([])
  })

  it('handles a target with a description but no technology', async () => {
    const provider = makeProvider({ json: { tags: ['Actor'] } })
    expect(await suggestTags(provider, { name: 'Customer', type: 'Person', description: 'buys things' }, [])).toEqual(['Actor'])
  })
})

describe('generateDiagram', () => {
  it('extracts DSL from a fenced completion', async () => {
    const provider = makeProvider({ text: 'Sure:\n```\nworkspace "X" {}\n```' })
    expect(await generateDiagram(provider, 'a system')).toContain('workspace "X"')
  })
})

describe('draftAdr', () => {
  it('returns the model markdown and tolerates a null workspace', async () => {
    const provider = makeProvider({ text: '# ADR 1\nContext…' })
    expect(await draftAdr(provider, null, 'use Postgres')).toMatch(/ADR 1/)
  })
})

describe('reviewArchitecture', () => {
  it('keeps well-formed findings, defaults severity/category, and drops malformed ones', async () => {
    const provider = makeProvider({ json: { findings: [
      { title: 'A', detail: 'd', suggestion: 's', severity: 'high', category: 'naming', elementIds: ['e1'], operations: [{ op: 'updateElement', id: 'e1', description: 'x' }] },
      { title: 'B', detail: 'd', suggestion: 's', severity: 'weird', elementIds: 'nope' },
      { title: 'C', detail: 123, suggestion: 's' },
    ] } })
    const { findings } = await reviewArchitecture(provider, makeWorkspace())
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({ severity: 'high', category: 'naming', elementIds: ['e1'] })
    expect(findings[0].operations).toHaveLength(1)
    expect(findings[1]).toMatchObject({ severity: 'medium', category: 'other', elementIds: [] })
    expect(findings[1].operations).toBeUndefined()
  })

  it('humanizes raw ids in the prose using element names', async () => {
    const provider = makeProvider({ json: { findings: [
      { title: "web ('Web App') is undescribed", detail: 'The db needs a description.', suggestion: 'Describe web', severity: 'low', category: 'description', elementIds: ['web'] },
    ] } })
    const { findings } = await reviewArchitecture(provider, makeWorkspace())
    expect(findings[0].title).toBe('Web App is undescribed')
    expect(findings[0].detail).toBe('The Database needs a description.')
    expect(findings[0].suggestion).toBe('Describe Web App')
  })

  it('drops a boundary finding about an element external to the scoped view', async () => {
    const view = { type: 'container' as const, key: 'c', softwareSystemId: 'shop', elements: [{ id: 'web' }, { id: 'cust' }], relationships: [] }
    const provider = makeProvider({ json: { findings: [
      // 'cust' is external to Shop's scope → this misplacement complaint is suppressed.
      { title: 'Customer placed wrong', detail: 'd', suggestion: 's', severity: 'high', category: 'boundary', elementIds: ['cust'] },
      // a boundary finding touching an in-scope element survives.
      { title: 'Web App boundary', detail: 'd', suggestion: 's', severity: 'high', category: 'boundary', elementIds: ['web'] },
    ] } })
    const { findings } = await reviewArchitecture(provider, makeWorkspace(), view)
    expect(findings.map((f) => f.title)).toEqual(['Web App boundary'])
  })

  it('keeps boundary findings when reviewing the whole model (no scope)', async () => {
    const provider = makeProvider({ json: { findings: [
      { title: 'Customer placed wrong', detail: 'd', suggestion: 's', severity: 'high', category: 'boundary', elementIds: ['cust'] },
    ] } })
    const { findings } = await reviewArchitecture(provider, makeWorkspace())
    expect(findings).toHaveLength(1)
  })
})

describe('planEdit', () => {
  it('returns only valid operations', async () => {
    const provider = makeProvider({ json: { operations: [
      { op: 'updateElement', id: 'e1', name: 'New' },
      { op: 'bogus' },
    ] } })
    const plan = await planEdit(provider, makeWorkspace(), 'rename e1')
    expect(plan.operations).toHaveLength(1)
  })
})

describe('autoDescribe', () => {
  it('keeps patches that have both an id and a description', async () => {
    const provider = makeProvider({ json: {
      elements: [{ id: 'e1', description: 'desc' }, { id: 'e2' }],
      relationships: [{ id: 'r1', description: 'rd' }],
    } })
    const out = await autoDescribe(provider, makeWorkspace())
    expect(out.elements).toEqual([{ id: 'e1', description: 'desc' }])
    expect(out.relationships).toEqual([{ id: 'r1', description: 'rd' }])
  })
})

describe('scanRepo', () => {
  const scanJson = {
    proposals: [
      { op: { op: 'addSoftwareSystem', ref: 'billing', name: 'Billing', external: true }, src: 'a.ts', label: 'Billing' },
      { op: { op: 'addSoftwareSystem', ref: 'core', name: 'Core' }, src: 'b.ts', label: 'Core' },
      { op: { op: 'addContainer', ref: 'api', name: 'API', parent: 'Core' }, src: 'c.ts' },
      { op: { op: 'addComponent', ref: 'svc', name: 'Service', parent: 'API' } },
      { op: { op: 'addPerson', ref: 'user', name: 'User' } },
    ],
    relationships: [{ op: { op: 'addRelationship', source: 'user', destination: 'api' } }],
    questions: [{ text: 'Which datastore?', options: [{ label: 'Postgres', op: { op: 'updateElement', id: 'api' } }, { label: 'Not sure' }] }],
  }

  it('discovers elements, then connections and questions', async () => {
    const result = await scanRepo(makeProvider({ json: scanJson }), null, 'file bundle', 2)
    // 5 distinct elements (deduped across passes) + 1 relationship.
    expect(result.proposals.length).toBeGreaterThanOrEqual(6)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].options).toHaveLength(2)
    expect(result.questions[0].options[1].op).toBeUndefined()
  })

  it('throws when every element pass fails', async () => {
    const failing: AiProvider = {
      async complete() { throw new Error('down') },
      async completeJson<T>(): Promise<T> { throw new Error('down') },
    }
    await expect(scanRepo(failing, null, 'bundle', 2)).rejects.toThrow(/down/)
  })
})

describe('listScanElements', () => {
  it('resolves namespaced parent refs to the parent element NAME', () => {
    // After merge, parents are addressed by (namespaced) ref, not name.
    const proposals: RepoProposal[] = [
      { op: { op: 'addSoftwareSystem', ref: 'p0_s1', name: 'Auth Service' }, src: 'a', label: 'Auth' },
      { op: { op: 'addContainer', ref: 'p0_c1', parent: 'p0_s1', name: 'Auth API' }, src: 'a', label: 'Auth API' },
    ]
    const out = listScanElements(proposals)
    expect(out).toContain('Auth API (container in Auth Service)')
    expect(out).not.toContain('p0_s1')
  })
})
