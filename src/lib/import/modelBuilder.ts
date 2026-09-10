// Shared model construction for the C4-PlantUML and Mermaid C4 importers.
//
// Both syntaxes describe the same things with the same macro names, so the
// mapping from macro → c4hero element lives here once: element kinds and
// their Db/Queue/Ext variants, boundaries, relationships with their
// direction suffixes, and the id policy.
//
// Boundaries are the subtle part. The two ecosystems use them differently:
// C4-PlantUML wraps containers in `System_Boundary` and components in
// `Container_Boundary`; Mermaid's C4Container diagrams wrap containers in
// `Container_Boundary`, and C4Context diagrams wrap *systems* in
// `System_Boundary`. So a boundary is materialised lazily from its first
// child: a Person/System child makes it a group, a Container child makes it
// a system (or a container group inside an enclosing system), a Component
// child makes it a container.

import type {
  Workspace, Person, SoftwareSystem, Container, Component, Group, Relationship, ElementStyle, ViewType,
} from '@/types/model'
import type { ImportWarning } from './importTypes'
import type { MacroCall } from './macroCall'
import { args } from './macroCall'

type Kind = 'person' | 'system' | 'container' | 'component'
type Variant = { kind: Kind; ext: boolean; db: boolean; queue: boolean }

/** Person / Person_Ext / System / SystemDb_Ext / ContainerQueue / Component… */
export function elementVariant(name: string): Variant | null {
  const m = name.match(/^(Person|System|Container|Component)(Db|Queue)?(_Ext)?$/)
  if (!m) return null
  const kind = m[1].toLowerCase() as Kind
  return { kind, db: m[2] === 'Db', queue: m[2] === 'Queue', ext: m[3] === '_Ext' }
}

/** Rel, Rel_D/U/L/R, Rel_Down/Up/Left/Right, Rel_Back, Rel_Neighbor, BiRel… */
export function relationshipVariant(name: string): { bidirectional: boolean } | null {
  if (/^Rel(_(D|U|L|R|Down|Up|Left|Right|Back|Neighbor|Neighbour|Back_Neighbor|Back_Neighbour))?$/.test(name)) return { bidirectional: false }
  if (/^BiRel(_(D|U|L|R|Down|Up|Left|Right|Neighbor|Neighbour))?$/.test(name)) return { bidirectional: true }
  return null
}

export type BoundaryKind = 'system' | 'container' | 'group'

export function boundaryVariant(name: string): BoundaryKind | null {
  if (name === 'System_Boundary') return 'system'
  if (name === 'Container_Boundary') return 'container'
  if (name === 'Boundary' || name === 'Enterprise_Boundary') return 'group'
  return null
}

interface Scope {
  kind: BoundaryKind
  alias?: string
  label: string
  descr?: string
  line: number
  /** What the boundary became, once its first child arrived. */
  as?: { system: SoftwareSystem } | { container: Container } | { group: Group }
}

export class ModelBuilder {
  readonly warnings: ImportWarning[] = []
  readonly people: Person[] = []
  readonly systems: SoftwareSystem[] = []
  readonly relationships: Relationship[] = []
  readonly groups: Group[] = []
  name = ''
  private readonly ids = new Set<string>()
  private readonly byAlias = new Map<string, { id: string; kind: Kind }>()
  private readonly scopes: Scope[] = []
  private relSeq = 0
  private needsDbStyle = false
  private needsQueueStyle = false
  private orphanSystem: SoftwareSystem | null = null

  warn(line: number, message: string) {
    this.warnings.push({ line, message })
  }

  /** Turn a source alias into a DSL-safe, unique identifier. The alias is
   *  kept when it already is one so the emitted DSL diffs against the source. */
  private idFor(alias: string | undefined, fallback: string): string {
    let base = (alias ?? fallback).replace(/[^A-Za-z0-9_]/g, '_')
    if (!/^[A-Za-z_]/.test(base)) base = `e_${base}`
    if (base === '') base = 'element'
    let id = base
    let n = 2
    while (this.ids.has(id)) id = `${base}${n++}`
    this.ids.add(id)
    return id
  }

  // ─── Scope resolution ────────────────────────────────────────────

  private enclosingSystem(): SoftwareSystem | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const as = this.scopes[i].as
      if (as && 'system' in as) return as.system
    }
    return undefined
  }
  private enclosingContainer(): Container | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const as = this.scopes[i].as
      if (as && 'container' in as) return as.container
    }
    return undefined
  }
  private enclosingGroup(): Group | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const as = this.scopes[i].as
      if (as && 'group' in as) return as.group
    }
    return undefined
  }

  /** Record `id` in the nearest group and every group above it — the
   *  serializer requires a parent group to contain its children's members. */
  private joinGroups(id: string) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const as = this.scopes[i].as
      if (as && 'group' in as && !as.group.elementIds.includes(id)) as.group.elementIds.push(id)
    }
  }

  private materialiseAsGroup(scope: Scope): Group {
    const group: Group = { id: this.idFor(scope.alias, 'group'), name: scope.label, elementIds: [] }
    // Only the nearest already-materialised group above is a parent; a
    // pending boundary above becomes a group too the moment it needs to.
    for (let i = this.scopes.indexOf(scope) - 1; i >= 0; i--) {
      const above = this.scopes[i]
      if (!above.as) above.as = { group: this.materialiseAsGroup(above) }
      if ('group' in above.as) { group.parentId = above.as.group.id; break }
    }
    this.groups.push(group)
    scope.as = { group }
    return group
  }

  private materialiseAsSystem(scope: Scope): SoftwareSystem {
    const known = scope.alias ? this.byAlias.get(scope.alias) : undefined
    let sys = known?.kind === 'system' ? this.systems.find((s) => s.id === known.id) : undefined
    if (!sys) {
      sys = { id: this.idFor(scope.alias, scope.label), type: 'softwareSystem', name: scope.label, description: scope.descr, tags: ['Element', 'Software System'], properties: {}, containers: [] }
      this.systems.push(sys)
      if (scope.alias) this.byAlias.set(scope.alias, { id: sys.id, kind: 'system' })
      this.joinGroups(sys.id)
    }
    scope.as = { system: sys }
    return sys
  }

  private materialiseAsContainer(scope: Scope): Container {
    const known = scope.alias ? this.byAlias.get(scope.alias) : undefined
    let container: Container | undefined
    if (known?.kind === 'container') for (const s of this.systems) container = container ?? s.containers.find((c) => c.id === known.id)
    if (!container) {
      const sys = this.enclosingSystem() ?? this.orphanParent(scope.line, `Container boundary "${scope.label}"`)
      container = { id: this.idFor(scope.alias, scope.label), type: 'container', name: scope.label, description: scope.descr, tags: ['Element', 'Container'], properties: {}, components: [] }
      sys.containers.push(container)
      if (scope.alias) this.byAlias.set(scope.alias, { id: container.id, kind: 'container' })
      this.joinGroups(container.id)
    }
    scope.as = { container }
    return container
  }

  /** Decide what the innermost pending boundary is, given what is being
   *  declared inside it. Returns after every pending ancestor that matters
   *  has been materialised. */
  private settleScopeFor(childKind: Kind) {
    const scope = this.scopes[this.scopes.length - 1]
    if (!scope || scope.as) return
    if (childKind === 'person' || childKind === 'system' || scope.kind === 'group') {
      this.materialiseAsGroup(scope)
      return
    }
    if (childKind === 'container') {
      // Inside an already-materialised system, a further boundary is a
      // container group; at the top it is the system itself.
      if (this.enclosingSystem()) this.materialiseAsGroup(scope)
      else this.materialiseAsSystem(scope)
      return
    }
    // component
    if (this.enclosingContainer()) this.materialiseAsGroup(scope)
    else this.materialiseAsContainer(scope)
  }

  /** A container declared outside any boundary needs a parent; make one
   *  named after the diagram so nothing is dropped. */
  private orphanParent(line: number, what: string): SoftwareSystem {
    if (!this.orphanSystem) {
      const label = this.name || 'Imported System'
      this.orphanSystem = {
        id: this.idFor(undefined, 'importedSystem'), type: 'softwareSystem', name: label, tags: ['Element', 'Software System'], properties: {}, containers: [],
      }
      this.systems.push(this.orphanSystem)
      this.warn(line, `${what} declared outside a System_Boundary — placed in a synthesised software system "${label}"`)
    }
    return this.orphanSystem
  }

  /** Synthesised holder container per system, so repeated orphan components
   *  share one. Tracked here rather than as a property so nothing internal
   *  leaks into the user's DSL. */
  private readonly orphanHolders = new Map<string, Container>()

  private orphanContainer(line: number, what: string): Container {
    const sys = this.enclosingSystem() ?? this.orphanParent(line, what)
    let holder = this.orphanHolders.get(sys.id)
    if (!holder) {
      holder = {
        id: this.idFor(undefined, `${sys.id}Components`), type: 'container', name: `${sys.name} components`, tags: ['Element', 'Container'],
        properties: {}, components: [],
      }
      this.orphanHolders.set(sys.id, holder)
      sys.containers.push(holder)
      this.warn(line, `${what} declared outside a Container_Boundary — placed in a synthesised container "${holder.name}"`)
    }
    return holder
  }

  // ─── Declarations ───────────────────────────────────────────────

  addElement(call: MacroCall, variant: Variant): void {
    const isContainerLike = variant.kind === 'container' || variant.kind === 'component'
    const a = isContainerLike
      ? args(call, ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'])
      : args(call, ['alias', 'label', 'descr', 'sprite', 'tags', 'link'])
    if (!a.alias) { this.warn(call.line, `${call.name}: missing alias — skipped`); return }
    this.settleScopeFor(variant.kind)
    const name = a.label ?? a.alias
    const id = this.idFor(a.alias, name)
    const tags: string[] = []
    if (variant.db) { tags.push('Database'); this.needsDbStyle = true }
    if (variant.queue) { tags.push('Queue'); this.needsQueueStyle = true }
    for (const t of (a.tags ?? '').split(/[+,]/)) { const tt = t.trim(); if (tt) tags.push(tt) }
    if (a.sprite) this.warn(call.line, `${call.name}(${a.alias}): sprite "${a.sprite}" not imported`)

    const common = { id, name, description: a.descr, properties: {} as Record<string, string>, url: a.link }
    switch (variant.kind) {
      case 'person': {
        const p: Person = { ...common, type: 'person', tags: ['Element', 'Person', ...tags] }
        if (variant.ext) p.location = 'External'
        this.people.push(p)
        this.attachTop(p, call.line)
        break
      }
      case 'system': {
        const s: SoftwareSystem = { ...common, type: 'softwareSystem', tags: ['Element', 'Software System', ...tags], containers: [] }
        if (variant.ext) s.location = 'External'
        this.systems.push(s)
        this.attachTop(s, call.line)
        break
      }
      case 'container': {
        const c: Container = { ...common, type: 'container', technology: a.techn, tags: ['Element', 'Container', ...tags], components: [] }
        if (variant.ext) c.tags.push('External')
        const sys = this.enclosingSystem() ?? this.orphanParent(call.line, `Container "${name}"`)
        sys.containers.push(c)
        this.joinGroups(c.id)
        break
      }
      case 'component': {
        const comp: Component = { ...common, type: 'component', technology: a.techn, tags: ['Element', 'Component', ...tags] }
        if (variant.ext) comp.tags.push('External')
        const holder = this.enclosingContainer() ?? this.orphanContainer(call.line, `Component "${name}"`)
        holder.components.push(comp)
        this.joinGroups(comp.id)
        break
      }
    }
    this.byAlias.set(a.alias, { id, kind: variant.kind })
    if (a.alias !== id) this.byAlias.set(id, { id, kind: variant.kind })
  }

  /** People and systems are top-level in c4hero; a boundary around them is
   *  group membership, and a system/container boundary is only a warning. */
  private attachTop(el: Person | SoftwareSystem, line: number) {
    this.joinGroups(el.id)
    if (this.enclosingGroup()) return
    if (this.enclosingSystem() || this.enclosingContainer()) {
      this.warn(line, `${el.type === 'person' ? 'Person' : 'System'} "${el.name}" declared inside a ${this.enclosingContainer() ? 'container' : 'system'} boundary — kept at the top level`)
    }
  }

  openBoundary(call: MacroCall, kind: BoundaryKind): void {
    const a = args(call, ['alias', 'label', 'type', 'descr', 'tags', 'link'])
    this.scopes.push({ kind, alias: a.alias, label: a.label ?? a.alias ?? 'Boundary', descr: a.descr, line: call.line })
  }

  closeBoundary(line: number): void {
    const scope = this.scopes.pop()
    if (!scope) { this.warn(line, 'Unmatched "}"'); return }
    // An empty boundary declared nothing; a system/container boundary with a
    // known alias still deserves its element so relationships can target it.
    if (!scope.as && scope.kind === 'system') this.materialiseAsSystem(scope)
    else if (!scope.as && scope.kind === 'container') this.materialiseAsContainer(scope)
  }

  addRelationship(call: MacroCall, bidirectional: boolean): void {
    const a = args(call, ['from', 'to', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'])
    if (!a.from || !a.to) { this.warn(call.line, `${call.name}: needs a source and a destination — skipped`); return }
    const from = this.byAlias.get(a.from)
    const to = this.byAlias.get(a.to)
    if (!from || !to) {
      this.warn(call.line, `${call.name}: unknown element "${!from ? a.from : a.to}" — skipped`)
      return
    }
    const tags = ['Relationship']
    for (const t of (a.tags ?? '').split(/[+,]/)) { const tt = t.trim(); if (tt) tags.push(tt) }
    const make = (s: string, d: string): Relationship => ({
      id: `rel${++this.relSeq}`, sourceId: s, destinationId: d,
      description: a.label, technology: a.techn, tags: [...tags], properties: {}, url: a.link,
    })
    this.relationships.push(make(from.id, to.id))
    if (bidirectional) {
      this.relationships.push(make(to.id, from.id))
      this.warn(call.line, `${call.name}: bidirectional relationship split into two one-way relationships`)
    }
  }

  /** Guess the view type from what was declared, for the initial canvas. */
  viewHint(): ViewType {
    const hasComponents = this.systems.some((s) => s.containers.some((c) => c.components.length > 0))
    const hasContainers = this.systems.some((s) => s.containers.length > 0)
    if (hasComponents) return 'component'
    if (hasContainers) return 'container'
    return this.systems.length === 1 ? 'systemContext' : 'systemLandscape'
  }

  build(): Workspace {
    while (this.scopes.length > 0) {
      const s = this.scopes[this.scopes.length - 1]
      this.warn(s.line, 'Boundary never closed — closed at end of input')
      this.closeBoundary(s.line)
    }
    const styles: ElementStyle[] = []
    if (this.needsDbStyle) styles.push({ tag: 'Database', shape: 'Cylinder' })
    if (this.needsQueueStyle) styles.push({ tag: 'Queue', shape: 'Pipe' })
    return {
      name: this.name || 'Imported workspace',
      model: {
        people: this.people,
        softwareSystems: this.systems,
        relationships: this.relationships,
        groups: this.groups.filter((g) => g.elementIds.length > 0),
        deploymentEnvironments: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
        dynamicViews: [], deploymentViews: [],
        configuration: { styles: { elements: styles, relationships: [] } },
      },
    }
  }
}
