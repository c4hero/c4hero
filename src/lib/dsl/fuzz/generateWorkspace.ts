// Deterministic workspace generator for the conformance corpus (TEA-63).
//
// Seeded, so a failing case is reproducible by seed number. Every string
// pool below is a thing Structurizr's tokenizer or c4hero's serializer has
// treated specially at some point: quotes, backslashes in every position,
// newlines, tabs, commas (tag separators), comment openers, braces, arrows,
// keywords used as names, empty and whitespace-only values, unicode.
//
// By default the generator stays inside what Structurizr accepts structurally
// (no self-relationships, disjoint groups, unique ids, conformant view keys).
// What it pushes on is the *content*: the shapes c4hero's own round-trip tests
// never think to write.
//
// Each of those structural constraints exists because c4hero's store accepts a
// state that serializes to DSL the real parser rejects (TEA-331). `relax` lifts
// them one at a time, which is how `validateForStructurizr` is proved against
// the real parser rather than against our reading of its source: generate a
// workspace that deliberately breaks one rule, and assert the validator and the
// Structurizr CLI agree about it (see structurizr-conformance.test.ts).

import type {
  Workspace, Person, SoftwareSystem, Container, Component, Relationship, Group, View,
  ElementStyle, RelationshipStyle, ElementStatus, Location, InteractionStyle, LineStyle,
} from '@/types/model'
import { representable } from '../encoding'

/** mulberry32 — small, fast, good enough for test data. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PLAIN = ['Payments', 'Identity', 'Web App', 'Mobile', 'Ledger', 'Notifier', 'Search', 'Gateway', 'Reporting', 'Audit']
const HOSTILE = [
  'Say "hi"',                       // quote
  'C:\\Program Files',              // interior backslash
  'Shared Folder X:\\',             // trailing backslash (unrepresentable → dropped)
  'see "manual\\"',                 // backslash before quote (representable)
  'literal \\n not newline',        // backslash before n (unrepresentable → dropped)
  'two\nlines',                     // real newline
  'tab\there',                      // real tab
  'has,comma',                      // comma — splits tags
  'looks like // a comment',        // comment opener inside a string
  'hash # inside',                  // other comment opener
  'braces { and }',                 // block delimiters
  'arrow -> here',                  // relationship operator
  'model',                          // keyword as a name
  'views',
  'group',
  '!include evil.dsl',              // directive as a name
  '  padded  ',                     // surrounding whitespace
  'ünïcödé ✓ 日本語',               // non-ASCII
  'very long name '.repeat(12).trim(),
  "it's",                           // apostrophe
  '"',                              // a lone quote
  '\\',                             // a lone backslash (unrepresentable → dropped)
  'a\\\\b',                         // two backslashes
]
const TECH = ['Go', 'Spring Boot', 'Node.js', 'Postgres 16', 'C++/CLI', 'F#', 'Kafka 3.x', 'HTTP/2']
const TAGS = ['critical', 'legacy', 'team-a', 'PCI', 'has,comma', 'has"quote', 'spaced tag', 'Tag\\Back']
const OWNERS = ['Platform Team', 'Team "Blue"', 'ops\\infra', '']
// Structurizr validates urls with java.net.URL, so only well-formed ones here.
// c4hero accepting any string in the url field is the product gap TEA-331
// covers; `relax.invalidUrls` mixes in BAD_URLS to exercise it.
const URLS = ['https://example.com/x', 'https://example.com/a?b=c&d=%22e%22', 'https://例え.jp/path']
// Every one of these is rejected by `new java.net.URL(...)`: no scheme, a
// scheme the JDK has no handler for, or an authority whose port isn't numeric.
const BAD_URLS = ['example.com', 'not a url', 'file://C:\\share', 'urn:isbn:1', 'data:text/plain,hi', 'https://host:port/x']
const COLOURS = ['#ff0000', '#08427b', '#999999', '#1168bd']
const SHAPES = ['Box', 'RoundedBox', 'Cylinder', 'Person', 'Hexagon']

/** Structural rules the generator normally respects, each liftable on its own
 *  so the corpus can prove the matching `validateForStructurizr` check. */
export interface RelaxOptions {
  /** Allow a name that encodes to nothing ("A container name must be provided"). */
  emptyNames?: boolean
  /** Allow urls java.net.URL rejects ("<url> is not a valid URL"). */
  invalidUrls?: boolean
  /** Allow two siblings to share a name ("A container named 'X' already exists"). */
  duplicateSiblingNames?: boolean
  /** Allow a relationship to an ancestor ("Relationships cannot be added between parents and children"). */
  ancestorRelationships?: boolean
  /** Allow an explicit relationship that duplicates an implied one ("already exists"). */
  impliedDuplicates?: boolean
  /** Allow view keys outside a-zA-Z0-9_- ("View keys can only contain..."). */
  badViewKeys?: boolean
}

export interface GenerateOptions {
  /** Include hostile strings (default true). */
  hostile?: boolean
  /** Upper bounds. */
  maxPeople?: number
  maxSystems?: number
  maxContainers?: number
  maxComponents?: number
  /** Structural rules to stop respecting (default: respect all of them). */
  relax?: RelaxOptions
}

export function generateWorkspace(seed: number, opts: GenerateOptions = {}): Workspace {
  const r = rng(seed)
  const int = (max: number) => Math.floor(r() * (max + 1))
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const chance = (p: number) => r() < p
  const hostile = opts.hostile ?? true
  const relax = opts.relax ?? {}
  const str = (plainOnly = false) => (!plainOnly && hostile && chance(0.4) ? pick(HOSTILE) : pick(PLAIN))
  // Structurizr requires a non-empty element name, so names avoid strings
  // that encode to nothing (a lone or trailing backslash) unless asked to.
  const NAMEABLE = HOSTILE.filter((h) => representable(h).length > 0)
  const UNNAMEABLE = ['\\', 'Shared Folder X:\\', '', '   ']
  const nameStr = () => {
    if (relax.emptyNames && chance(0.25)) return pick(UNNAMEABLE)
    return hostile && chance(0.4) ? pick(NAMEABLE) : pick(PLAIN)
  }
  const maybe = <T,>(p: number, v: () => T): T | undefined => (chance(p) ? v() : undefined)
  const tags = (defaults: string[]) => {
    const extra = new Set<string>()
    const n = int(2)
    for (let i = 0; i < n; i++) extra.add(hostile ? pick(TAGS) : pick(TAGS.slice(0, 4)))
    return [...defaults, ...extra]
  }
  const props = (): Record<string, string> => {
    const out: Record<string, string> = {}
    const n = int(2)
    for (let i = 0; i < n; i++) out[chance(0.3) && hostile ? pick(['key with space', 'key"q', 'k.dotted', 'key,comma']) : `k${i}`] = str()
    return out
  }
  let seq = 0
  const id = (prefix: string) => `${prefix}${++seq}`
  // Structurizr requires unique names among siblings (people + systems at the
  // top level, containers within a system, components within a container).
  const uniqueName = (taken: Set<string>) => {
    let name = nameStr()
    // Reusing a sibling's name is the whole point when the rule is relaxed.
    if (relax.duplicateSiblingNames && taken.size > 0 && chance(0.3)) return [...taken][0]
    let n = 2
    while (taken.has(name)) name = `${nameStr()} ${n++}`
    taken.add(name)
    return name
  }
  const topNames = new Set<string>()

  const base = (prefix: string, defaults: string[], taken: Set<string>) => ({
    id: id(prefix),
    name: uniqueName(taken),
    description: maybe(0.7, () => str()),
    tags: tags(defaults),
    properties: props(),
    url: maybe(0.2, () => (relax.invalidUrls && chance(0.5) ? pick(BAD_URLS) : pick(URLS))),
    // Includes a custom value: the vocabulary is open, so round-trip has to hold
    // for a status c4hero does not ship with.
    status: maybe(0.3, () => pick(['Live', 'Planned', 'Deprecated', 'Removed', 'Awaiting sign-off'] as ElementStatus[])),
    owner: maybe(0.3, () => pick(OWNERS)),
  })

  const people: Person[] = []
  for (let i = 0, n = int(opts.maxPeople ?? 3); i < n; i++) {
    people.push({ ...base('p', ['Element', 'Person'], topNames), type: 'person', location: maybe(0.3, () => pick(['Internal', 'External', 'Unspecified'] as Location[])) })
  }
  const systems: SoftwareSystem[] = []
  for (let i = 0, n = 1 + int((opts.maxSystems ?? 4) - 1); i < n; i++) {
    const external = chance(0.2)
    const containers: Container[] = []
    const containerNames = new Set<string>()
    // External systems may not have containers (integrity rule).
    if (!external) {
      for (let j = 0, m = int(opts.maxContainers ?? 3); j < m; j++) {
        const components: Component[] = []
        const componentNames = new Set<string>()
        for (let k = 0, o = int(opts.maxComponents ?? 2); k < o; k++) {
          components.push({ ...base('comp', ['Element', 'Component'], componentNames), type: 'component', technology: maybe(0.6, () => pick(TECH)) })
        }
        containers.push({ ...base('c', ['Element', 'Container'], containerNames), type: 'container', technology: maybe(0.7, () => pick(TECH)), components })
      }
    }
    systems.push({
      ...base('sys', ['Element', 'Software System'], topNames),
      type: 'softwareSystem',
      location: external ? 'External' : maybe(0.3, () => pick(['Internal', 'Unspecified'] as Location[])),
      containers,
    })
  }

  // Every element, for relationships and views.
  const all: { id: string; kind: 'person' | 'softwareSystem' | 'container' | 'component'; parent?: string }[] = []
  for (const p of people) all.push({ id: p.id, kind: 'person' })
  for (const s of systems) {
    all.push({ id: s.id, kind: 'softwareSystem' })
    for (const c of s.containers) {
      all.push({ id: c.id, kind: 'container', parent: s.id })
      for (const comp of c.components) all.push({ id: comp.id, kind: 'component', parent: c.id })
    }
  }

  const relationships: Relationship[] = []
  const seenPairs = new Set<string>()
  for (let i = 0, n = int(Math.min(6, all.length * 2)); i < n && all.length > 1; i++) {
    const a = pick(all), b = pick(all)
    if (a.id === b.id) continue
    // Structurizr rejects a relationship between an element and any of its
    // ancestors or descendants ("Relationships cannot be added between
    // parents and children").
    const ancestors = (e: typeof a) => {
      const out = new Set<string>()
      let cur = e.parent
      while (cur) { out.add(cur); cur = all.find((x) => x.id === cur)?.parent }
      return out
    }
    if (!relax.ancestorRelationships && (ancestors(a).has(b.id) || ancestors(b).has(a.id))) continue
    // Structurizr (impliedRelationships on by default) derives a relationship
    // between every ancestor pair of a relationship's ends, and then rejects
    // an explicit duplicate of one ("already exists"). Reserve the whole
    // ancestor lattice of each pair so no later pick collides with an
    // implied one.
    const key = `${a.id}->${b.id}`
    if (!relax.impliedDuplicates) {
      if (seenPairs.has(key)) continue
      for (const A of [a.id, ...ancestors(a)]) for (const B of [b.id, ...ancestors(b)]) seenPairs.add(`${A}->${B}`)
    }
    relationships.push({
      id: id('rel'),
      sourceId: a.id,
      destinationId: b.id,
      description: maybe(0.8, () => str()),
      technology: maybe(0.5, () => pick(TECH)),
      tags: tags(['Relationship']),
      properties: props(),
      interactionStyle: maybe(0.3, () => pick(['Synchronous', 'Asynchronous'] as InteractionStyle[])),
      lineStyle: maybe(0.3, () => pick(['Curved', 'Straight', 'Orthogonal'] as LineStyle[])),
      url: maybe(0.15, () => (relax.invalidUrls && chance(0.5) ? pick(BAD_URLS) : pick(URLS))),
    })
  }

  // A random pick lands on an ancestor pair rarely (most elements are
  // top-level), so when the rule is relaxed, mint the shape directly.
  if (relax.ancestorRelationships) {
    for (const e of all) {
      if (!e.parent || !chance(0.3)) continue
      relationships.push({
        id: id('rel'),
        sourceId: e.id,
        destinationId: e.parent,
        description: maybe(0.8, () => str()),
        tags: ['Relationship'],
        properties: {},
      })
    }
  }

  // An implied duplicate only bites when the explicit relationship matches the
  // implied one on source, destination AND description, and is declared after
  // it — so a random pick almost never produces one. Mint them deliberately:
  // for a relationship whose ends have ancestors, add the ancestor-pair
  // relationship with the same description, which Structurizr has by then
  // already derived.
  if (relax.impliedDuplicates) {
    const parentOf = new Map(all.filter((e) => e.parent).map((e) => [e.id, e.parent!]))
    const ancestorsOf = (id: string) => {
      const out = new Set<string>()
      let cur = parentOf.get(id)
      while (cur && !out.has(cur)) { out.add(cur); cur = parentOf.get(cur) }
      return out
    }
    for (const rel of [...relationships]) {
      if (!chance(0.5)) continue
      const src = parentOf.get(rel.sourceId)
      const dst = parentOf.get(rel.destinationId) ?? rel.destinationId
      if (!src || src === dst) continue
      // The ancestor pair has to be a *legal* relationship in its own right:
      // for `comp(c1/s1) -> c2(s1)` the pair is `c1 -> s1`, which Structurizr
      // rejects as a parent/child relationship, so the seed would prove
      // nothing about implied duplicates.
      if (ancestorsOf(src).has(dst) || ancestorsOf(dst).has(src)) continue
      relationships.push({
        id: id('rel'),
        sourceId: src,
        destinationId: dst,
        description: rel.description,
        tags: ['Relationship'],
        properties: {},
      })
    }
  }

  // Disjoint top-level groups over people + systems.
  const groups: Group[] = []
  if (chance(0.5) && people.length + systems.length >= 2) {
    const pool = [...people.map((p) => p.id), ...systems.map((s) => s.id)]
    const n = 1 + int(1)
    for (let g = 0; g < n && pool.length > 0; g++) {
      const take = 1 + int(Math.max(0, pool.length - 1))
      const members = pool.splice(0, take)
      groups.push({ id: id('grp'), name: str(), elementIds: members })
    }
  }

  // Views: landscape always; context + container per system (sometimes);
  // component per container (sometimes). Keys stay within Structurizr's
  // allowed characters unless `relax.badViewKeys` says otherwise.
  const views: Workspace['views'] = {
    systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
    dynamicViews: [], deploymentViews: [],
    configuration: { styles: { elements: [], relationships: [] } },
  }
  // Structurizr allows only a-zA-Z0-9_- in a view key; `relax.badViewKeys`
  // borrows from the hostile pool so the corpus can exercise TEA-166.
  const viewKey = (key: string) => (relax.badViewKeys && chance(0.4) ? `${key} ${pick(HOSTILE)}` : key)
  const viewCommon = (key: string): Pick<View, 'key' | 'title' | 'description' | 'autoLayout' | 'relationships'> => ({
    key: viewKey(key),
    title: maybe(0.5, () => str()),
    description: maybe(0.3, () => str()),
    autoLayout: maybe(0.5, () => ({ direction: pick(['TB', 'BT', 'LR', 'RL'] as const) })),
    relationships: [],
  })
  const explicitOrStar = (ids: string[]) => (chance(0.5) ? [{ id: '*' }] : ids.filter(() => chance(0.7)).map((i) => ({ id: i })))
  views.systemLandscapeViews.push({
    ...viewCommon('Landscape'),
    type: 'systemLandscape',
    elements: explicitOrStar(all.filter((e) => e.kind === 'person' || e.kind === 'softwareSystem').map((e) => e.id)),
  })
  for (const s of systems) {
    if (chance(0.6)) {
      views.systemContextViews.push({
        ...viewCommon(`Ctx-${s.id}`), type: 'systemContext', softwareSystemId: s.id,
        elements: explicitOrStar(all.filter((e) => e.kind !== 'container' && e.kind !== 'component').map((e) => e.id)),
      })
    }
    if (s.containers.length > 0 && chance(0.7)) {
      views.containerViews.push({
        ...viewCommon(`Cont-${s.id}`), type: 'container', softwareSystemId: s.id,
        elements: explicitOrStar(s.containers.map((c) => c.id)),
      })
      for (const c of s.containers) {
        if (c.components.length > 0 && chance(0.5)) {
          views.componentViews.push({
            ...viewCommon(`Comp-${c.id}`), type: 'component', containerId: c.id,
            elements: explicitOrStar(c.components.map((x) => x.id)),
          })
        }
      }
    }
  }

  // Styles keyed on a mix of built-in and generated tags.
  const styleTags = ['Person', 'Software System', 'Container', 'Component', ...TAGS]
  for (let i = 0, n = int(3); i < n; i++) {
    const style: ElementStyle = { tag: pick(styleTags) }
    if (chance(0.7)) style.background = pick(COLOURS)
    if (chance(0.5)) style.color = pick(COLOURS)
    if (chance(0.5)) style.shape = pick(SHAPES)
    if (chance(0.3)) style.fontSize = 10 + int(20)
    if (chance(0.2)) style.opacity = int(100)
    views.configuration.styles.elements.push(style)
  }
  for (let i = 0, n = int(2); i < n; i++) {
    const style: RelationshipStyle = { tag: pick(['Relationship', ...TAGS]) }
    if (chance(0.7)) style.color = pick(COLOURS)
    if (chance(0.5)) style.thickness = 1 + int(4)
    if (chance(0.5)) style.dashed = chance(0.5)
    views.configuration.styles.relationships.push(style)
  }

  return {
    name: chance(0.15) && hostile ? pick(HOSTILE) : `Generated ${seed}`,
    description: maybe(0.5, () => str()),
    model: { people, softwareSystems: systems, relationships, groups, deploymentEnvironments: [] },
    views,
  }
}
