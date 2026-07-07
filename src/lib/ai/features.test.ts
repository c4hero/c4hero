import { describe, it, expect } from 'vitest'
import type { AiProvider, AiJsonRequest } from './types'
import {
  suggestTags, suggestFieldValue, generateDiagramStream, draftAdr,
  reviewArchitecture, reviewArchitectureStream, planEdit, autoDescribe, interviewAskStream,
  answerQuestionStream,
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

describe('suggestFieldValue', () => {
  // Provider that records each completeJson request so tests can assert on the
  // prompt the feature actually built.
  function capturing(json: unknown) {
    const calls: AiJsonRequest<unknown>[] = []
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(req: AiJsonRequest<T>): Promise<T> {
        calls.push(req as AiJsonRequest<unknown>)
        return json as T
      },
    }
    return { provider, calls }
  }

  it('targets one element and returns the trimmed value', async () => {
    const { provider, calls } = capturing({ value: '  Stores orders and customers  ' })
    const value = await suggestFieldValue(provider, makeWorkspace(), 'desc', 'db')
    expect(value).toBe('Stores orders and customers')
    expect(calls).toHaveLength(1)
    expect(calls[0].user).toContain('Target element: container “Database” (id db), part of Shop.')
    expect(calls[0].user).toContain('what this element does')
  })

  it('targets a relationship by naming its endpoints', async () => {
    const { provider, calls } = capturing({ value: 'Reads and writes order data' })
    const value = await suggestFieldValue(provider, makeWorkspace(), 'rel', 'r2')
    expect(value).toBe('Reads and writes order data')
    expect(calls[0].user).toContain('Target relationship: Web App -> Database (id r2).')
  })

  it('returns null without calling the provider when the target no longer exists', async () => {
    const { provider, calls } = capturing({ value: 'never used' })
    expect(await suggestFieldValue(provider, makeWorkspace(), 'desc', 'ghost')).toBeNull()
    expect(await suggestFieldValue(provider, makeWorkspace(), 'rel', 'ghost')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('asks for a different take (with temperature) when re-rolling a rejected draft', async () => {
    const { provider, calls } = capturing({ value: 'Order storage' })
    await suggestFieldValue(provider, makeWorkspace(), 'desc', 'db', 'Stores data')
    expect(calls[0].user).toContain('“Stores data”')
    expect(calls[0].user).toContain('do not repeat it')
    expect(calls[0].temperature).toBe(1)
    // No avoid → deterministic default (no temperature override).
    await suggestFieldValue(provider, makeWorkspace(), 'desc', 'db')
    expect(calls[1].temperature).toBeUndefined()
  })

  it('strips wrapping quotes and returns null for an empty value', async () => {
    const quoted = capturing({ value: '“Serves web traffic”' })
    expect(await suggestFieldValue(quoted.provider, makeWorkspace(), 'desc', 'web')).toBe('Serves web traffic')
    const empty = capturing({ value: '   ' })
    expect(await suggestFieldValue(empty.provider, makeWorkspace(), 'desc', 'web')).toBeNull()
    const malformed = capturing({ nope: true })
    expect(await suggestFieldValue(malformed.provider, makeWorkspace(), 'desc', 'web')).toBeNull()
  })
})

describe('generateDiagramStream', () => {
  const dsl = 'workspace "Shop" {\n  model {\n  }\n}'

  it('streams raw chunks to onText and resolves with the extracted DSL', async () => {
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) {
        req.onText('Here you go:\n')
        req.onText(dsl)
        return `Here you go:\n${dsl}`
      },
    }
    const chunks: string[] = []
    const out = await generateDiagramStream(provider, 'a shop', (d) => chunks.push(d))
    expect(chunks).toEqual(['Here you go:\n', dsl]) // raw, pre-extraction preview
    expect(out).toBe(dsl) // extracted, parse-ready
  })

  it('falls back to a single complete() call when the provider has no streaming', async () => {
    const provider: AiProvider = {
      async complete() { return `preamble\n${dsl}` },
      async completeJson<T>(): Promise<T> { return {} as T },
    }
    const chunks: string[] = []
    const out = await generateDiagramStream(provider, 'a shop', (d) => chunks.push(d))
    expect(chunks).toEqual([`preamble\n${dsl}`]) // whole text delivered as one chunk
    expect(out).toBe(dsl)
  })
})

describe('interviewAskStream', () => {
  const view = { type: 'container' as const, key: 'c', softwareSystemId: 'shop', elements: [{ id: 'web' }], relationships: [] }
  const question = 'What datastore does the Web App rely on?'

  it('streams tokens to onText and resolves with the full question', async () => {
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) { req.onText('What datastore '); req.onText('does it use?'); return 'What datastore does it use?' },
    }
    const chunks: string[] = []
    const out = await interviewAskStream(provider, makeWorkspace(), view, [], 'kickoff', (d) => chunks.push(d))
    expect(chunks).toEqual(['What datastore ', 'does it use?'])
    expect(out).toBe('What datastore does it use?')
  })

  it('falls back to a single complete() call when the provider has no streaming', async () => {
    const chunks: string[] = []
    const out = await interviewAskStream(makeProvider({ text: question }), makeWorkspace(), view, [], 'kickoff', (d) => chunks.push(d))
    expect(chunks).toEqual([question]) // whole question delivered as one chunk
    expect(out).toBe(question)
  })
})

describe('draftAdr', () => {
  it('returns the model markdown and tolerates a null workspace', async () => {
    const provider = makeProvider({ text: '# ADR 1\nContext…' })
    expect(await draftAdr(provider, null, 'use Postgres')).toMatch(/ADR 1/)
  })
})

describe('answerQuestionStream', () => {
  it('streams tokens to onText and resolves with the full answer', async () => {
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) { req.onText('The Web App '); req.onText('calls the Database.'); return 'The Web App calls the Database.' },
    }
    const chunks: string[] = []
    const out = await answerQuestionStream(provider, makeWorkspace(), null, 'q', [], (d) => chunks.push(d))
    expect(chunks).toEqual(['The Web App ', 'calls the Database.'])
    expect(out).toBe('The Web App calls the Database.')
  })

  it('passes prior chat turns as history so follow-ups have context', async () => {
    let seen: unknown
    const provider: AiProvider = {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) { seen = req.history; return 'ok' },
    }
    const history = [{ role: 'user' as const, content: 'q1' }, { role: 'assistant' as const, content: 'a1' }]
    await answerQuestionStream(provider, makeWorkspace(), null, 'follow-up', history, () => {})
    expect(seen).toEqual(history)
  })

  it('falls back to a single complete() call when the provider has no streaming', async () => {
    const answer = 'The API depends on Postgres.'
    const chunks: string[] = []
    const out = await answerQuestionStream(makeProvider({ text: answer }), makeWorkspace(), null, 'q', [], (d) => chunks.push(d))
    expect(chunks).toEqual([answer])
    expect(out).toBe(answer)
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

describe('reviewArchitectureStream', () => {
  // Streams a payload in small chunks (so objects close mid-chunk) via completeStream.
  function streamingProvider(payload: string, chunkSize = 7): AiProvider {
    return {
      async complete() { return '' },
      async completeJson<T>(): Promise<T> { return {} as T },
      async completeStream(req) {
        let text = ''
        for (let i = 0; i < payload.length; i += chunkSize) { const d = payload.slice(i, i + chunkSize); text += d; req.onText(d) }
        return text
      },
    }
  }

  it('emits findings one-by-one as they stream, humanizing ids in the prose', async () => {
    const payload = JSON.stringify({ findings: [
      { title: "web ('Web App') is undescribed", detail: 'The db needs a description.', suggestion: 'Describe web', severity: 'low', category: 'description', elementIds: ['web'] },
      { title: 'Naming is inconsistent', detail: 'd', suggestion: 's', severity: 'high', category: 'naming', elementIds: [] },
    ] })
    const seen: string[] = []
    const result = await reviewArchitectureStream(streamingProvider(payload), makeWorkspace(), null, (f) => seen.push(f.title))
    // Each finding surfaced through onFinding, in stream order, already humanized.
    expect(seen).toEqual(['Web App is undescribed', 'Naming is inconsistent'])
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0].detail).toBe('The Database needs a description.')
  })

  it('applies the same scope filter as the bulk review (drops external boundary findings)', async () => {
    const view = { type: 'container' as const, key: 'c', softwareSystemId: 'shop', elements: [{ id: 'web' }, { id: 'cust' }], relationships: [] }
    const payload = JSON.stringify({ findings: [
      { title: 'Customer placed wrong', detail: 'd', suggestion: 's', severity: 'high', category: 'boundary', elementIds: ['cust'] },
      { title: 'Web App boundary', detail: 'd', suggestion: 's', severity: 'high', category: 'boundary', elementIds: ['web'] },
    ] })
    const seen: string[] = []
    const result = await reviewArchitectureStream(streamingProvider(payload), makeWorkspace(), view, (f) => seen.push(f.title))
    expect(seen).toEqual(['Web App boundary'])
    expect(result.findings.map((f) => f.title)).toEqual(['Web App boundary'])
  })

  it('falls back to a single non-streaming review when the provider has no completeStream', async () => {
    const provider = makeProvider({ json: { findings: [
      { title: 'A', detail: 'd', suggestion: 's', severity: 'high', category: 'naming', elementIds: [] },
    ] } })
    const seen: string[] = []
    const result = await reviewArchitectureStream(provider, makeWorkspace(), null, (f) => seen.push(f.title))
    expect(seen).toEqual(['A'])
    expect(result.findings).toHaveLength(1)
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

