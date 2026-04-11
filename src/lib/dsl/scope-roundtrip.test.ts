import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import { createBlankWorkspace } from '@/lib/templates'

describe('scope roundtrip', () => {
  it('softwaresystem scope survives createBlankWorkspace → serialize → parse', () => {
    const ws = createBlankWorkspace('softwaresystem')
    expect(ws.scope).toBe('softwaresystem')
    expect(ws.model.softwareSystems).toHaveLength(1)
    expect(ws.views.systemContextViews).toHaveLength(1)
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace?.scope).toBe('softwaresystem')
    // Placeholder system + systemContext view survive roundtrip
    expect(parsed.workspace?.model.softwareSystems).toHaveLength(1)
    expect(parsed.workspace?.views.systemContextViews).toHaveLength(1)
    const view = parsed.workspace?.views.systemContextViews[0]
    const systemId = parsed.workspace?.model.softwareSystems[0].id
    expect(view?.softwareSystemId).toBe(systemId)
  })

  it('landscape scope survives createBlankWorkspace → serialize → parse', () => {
    const ws = createBlankWorkspace('landscape')
    expect(ws.scope).toBe('landscape')
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace?.scope).toBe('landscape')
  })

  it('no scope (unscoped) roundtrips as undefined', () => {
    const ws = createBlankWorkspace()
    expect(ws.scope).toBeUndefined()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.workspace?.scope).toBeUndefined()
  })

  it('unknown scope value produces a parse error and defaults to none', () => {
    const dsl = `workspace {\n  model {}\n  views {}\n  configuration { scope badvalue }\n}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/unknown scope value/i)
    expect(workspace.scope).toBe('none')
  })
})
