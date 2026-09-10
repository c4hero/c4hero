/**
 * Secondary invariant for TEA-63: c4hero agrees with itself across a
 * generated corpus. `parse(serialize(x))` must have no errors, re-serialize
 * byte-identically, and keep every value the serializer can represent.
 *
 * This is deliberately NOT the conformance gate — both sides are c4hero.
 * structurizr-conformance.test.ts runs the same corpus through the real
 * Structurizr CLI. This file exists so a regression in c4hero's own
 * round-trip shows up on a bare checkout, with a seed to reproduce it.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { generateWorkspace, representable, representableTag } from './fuzz/generateWorkspace'
import type { Workspace } from '@/types/model'

const SEEDS = Number(process.env.ROUNDTRIP_SEEDS ?? 200)

interface Flat {
  kind: string
  name: string
  description: string
  technology: string
  status: string
  owner: string
  external: boolean
  tags: string[]
  properties: Record<string, string>
  url: string
}

/** Every element flattened to the values the serializer promises to keep,
 *  normalised for the documented unrepresentable cases. */
function flatten(ws: Workspace, normalise: boolean): Flat[] {
  const norm = (s: string | undefined) => (normalise ? representable(s ?? '') : (s ?? ''))
  const normTags = (tags: string[], defaults: string[]) =>
    tags.filter((t) => !defaults.includes(t)).map((t) => (normalise ? representableTag(t) : t)).filter(Boolean).sort()
  // Empty keys/values are unrepresentable in Structurizr and dropped on save.
  const normProps = (p: Record<string, string>) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [norm(k), norm(v)]).filter(([k, v]) => !normalise || (k && v)))
  const out: Flat[] = []
  const push = (kind: string, el: { name: string; description?: string; technology?: string; status?: string; owner?: string; location?: string; tags: string[]; properties: Record<string, string>; url?: string }, defaults: string[]) => {
    out.push({
      kind, name: norm(el.name), description: norm(el.description), technology: norm(el.technology),
      status: el.status ?? '', owner: norm(el.owner), external: el.location === 'External',
      tags: normTags(el.tags, defaults), properties: normProps(el.properties), url: norm(el.url),
    })
  }
  for (const p of ws.model.people) push('person', p, ['Element', 'Person'])
  for (const s of ws.model.softwareSystems) {
    push('softwareSystem', s, ['Element', 'Software System'])
    for (const c of s.containers) {
      push('container', c, ['Element', 'Container'])
      for (const comp of c.components) push('component', comp, ['Element', 'Component'])
    }
  }
  return out.sort((a, b) => `${a.kind}:${a.name}:${a.description}`.localeCompare(`${b.kind}:${b.name}:${b.description}`))
}

function flattenRelationships(ws: Workspace, normalise: boolean) {
  const norm = (s: string | undefined) => (normalise ? representable(s ?? '') : (s ?? ''))
  return ws.model.relationships
    .map((r) => ({
      description: norm(r.description), technology: norm(r.technology),
      interactionStyle: r.interactionStyle ?? '', lineStyle: r.lineStyle ?? '', url: norm(r.url),
      tags: r.tags.filter((t) => t !== 'Relationship').map((t) => (normalise ? representableTag(t) : t)).filter(Boolean).sort(),
      properties: Object.fromEntries(Object.entries(r.properties).map(([k, v]) => [norm(k), norm(v)]).filter(([k, v]) => !normalise || (k && v))),
    }))
    .sort((a, b) => `${a.description}:${a.technology}`.localeCompare(`${b.description}:${b.technology}`))
}

describe('generated corpus round-trips through c4hero (TEA-63)', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1)

  it.each(seeds)('seed %i: parse(serialize(x)) is clean, idempotent and value-preserving', (seed) => {
    const ws = generateWorkspace(seed)
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors, `seed ${seed} parse errors:\n${dsl}`).toEqual([])

    // Idempotent from the second pass on. The first parse expands `include *`
    // into an explicit list (keeping the expression is TEA-326), so compare
    // serialize(parse(serialize(parse(dsl)))) with serialize(parse(dsl)).
    const once = serializeDSL(parsed)
    const { workspace: reparsed, errors: errors2 } = parseDSL(once)
    expect(errors2, `seed ${seed} second-pass parse errors`).toEqual([])
    expect(serializeDSL(reparsed), `seed ${seed} not idempotent`).toBe(once)

    // Value fidelity, modulo the documented unrepresentable cases.
    expect(flatten(parsed, false), `seed ${seed} element values drifted`).toEqual(flatten(ws, true))
    expect(flattenRelationships(parsed, false), `seed ${seed} relationship values drifted`).toEqual(flattenRelationships(ws, true))

    // Structure.
    expect(parsed.model.relationships.length).toBe(ws.model.relationships.length)
    expect(parsed.model.groups.map((g) => g.elementIds.length).sort()).toEqual(ws.model.groups.map((g) => g.elementIds.length).sort())
    const keys = (w: Workspace) => [
      ...w.views.systemLandscapeViews, ...w.views.systemContextViews, ...w.views.containerViews, ...w.views.componentViews,
    ].map((v) => v.key).sort()
    expect(keys(parsed)).toEqual(keys(ws))
  })

  it('the generator is deterministic per seed', () => {
    expect(serializeDSL(generateWorkspace(42))).toBe(serializeDSL(generateWorkspace(42)))
    expect(serializeDSL(generateWorkspace(42))).not.toBe(serializeDSL(generateWorkspace(43)))
  })
})
