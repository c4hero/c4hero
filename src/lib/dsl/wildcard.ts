// `include *` expansion, shared by the parser (which shows the expansion on
// the canvas), the serializer (which writes the wildcard back with the lines
// that adjust it) and the store (which adds elements an edit makes eligible),
// plus the implied relationships such a view draws between the elements it
// shows (the canvas and the exports), #230.

import type { Model, View, ElementInView, Relationship } from '@/types/model'
import { expandDeploymentElements, walkDeploymentNodes } from '@/lib/deployment'

/** Each container's software system and each component's container. */
function parentMap(model: Model): Map<string, string> {
    const parents = new Map<string, string>()
    for (const s of model.softwareSystems) {
        for (const c of s.containers) {
            parents.set(c.id, s.id)
            for (const comp of c.components) parents.set(comp.id, c.id)
        }
    }
    return parents
}

/** `id`'s top-level element: the software system a container or component
 *  sits in, or `id` itself (a person, a software system, anything else). */
function topLevel(parents: Map<string, string>, id: string): string {
    let top = id
    for (let p = parents.get(top); p !== undefined; p = parents.get(top)) top = p
    return top
}

/**
 * Expand an `include *` wildcard into the elements Structurizr adds for the
 * view type, with implied relationships on (its default): a relationship
 * counts at every level of the hierarchy, so one between two elements also
 * connects their containers and software systems. Each view is drawn at its
 * own level, so the far end of a relationship is shown as the ancestor the
 * view can hold — another system's container or component as that software
 * system (#230). Checked against the Structurizr CLI export.
 */
function expandWildcard(model: Model, view: View): ElementInView[] {
    // Use a Set for O(1) dedup; track insertion order via a parallel array.
    const seen = new Set<string>()
    const ids: string[] = []

    const addId = (id: string) => {
        if (seen.has(id)) return
        seen.add(id)
        ids.push(id)
    }

    const parents = parentMap(model)

    if (view.type === 'systemLandscape') {
        // Landscape: show everything — all people and software systems
        for (const p of model.people) addId(p.id)
        for (const s of model.softwareSystems) addId(s.id)
    } else if (view.type === 'systemContext' && view.softwareSystemId) {
        // System context: the scoped system + the people and other software
        // systems connected to it or to anything inside it. A container or
        // component of another system counts as that system, so a
        // relationship drawn at container level still shows its system here.
        const scopeId = view.softwareSystemId
        addId(scopeId)
        const connectedIds = new Set<string>()
        for (const rel of model.relationships) {
            const source = topLevel(parents, rel.sourceId)
            const destination = topLevel(parents, rel.destinationId)
            if (source === destination) continue
            if (source === scopeId) connectedIds.add(destination)
            if (destination === scopeId) connectedIds.add(source)
        }
        for (const p of model.people) { if (connectedIds.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) { if (connectedIds.has(s.id)) addId(s.id) }
    } else if (view.type === 'container' && view.softwareSystemId) {
        // Container view: containers of the scoped system + the people and
        // other software systems connected to them or to their components.
        // The scoped system's own relationships do not count, and `include *`
        // never shows another system's containers, only that system.
        const scopeId = view.softwareSystemId
        const scopeSys = model.softwareSystems.find(s => s.id === scopeId)
        if (scopeSys) {
            for (const c of scopeSys.containers) addId(c.id)
        }
        const relatedIds = new Set<string>()
        for (const rel of model.relationships) {
            const source = topLevel(parents, rel.sourceId)
            const destination = topLevel(parents, rel.destinationId)
            if (source === destination) continue
            if (source === scopeId && rel.sourceId !== scopeId) relatedIds.add(destination)
            if (destination === scopeId && rel.destinationId !== scopeId) relatedIds.add(source)
        }
        for (const p of model.people) { if (relatedIds.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) { if (relatedIds.has(s.id)) addId(s.id) }
    } else if (view.type === 'component' && view.containerId) {
        // Component view: components of the scoped container + what they are
        // connected to, drawn as the nearest element the view can hold: a
        // person or software system as itself, an element of another system
        // as that system, and another container of the same system (or one
        // of its components) as that container. Relationships of the scoped
        // container or its system do not count.
        const containerId = view.containerId
        const systemId = parents.get(containerId)
        const componentIds = new Set<string>()
        for (const s of model.softwareSystems) {
            const parentContainer = s.containers.find(c => c.id === containerId)
            if (parentContainer) {
                for (const comp of parentContainer.components) {
                    addId(comp.id)
                    componentIds.add(comp.id)
                }
            }
        }
        const shownAs = (id: string): string | undefined => {
            if (componentIds.has(id) || id === containerId || id === systemId) return undefined
            const top = topLevel(parents, id)
            if (top !== systemId) return top
            // Inside the scoped system: a sibling container, or one of its components.
            const parent = parents.get(id)
            return parent === systemId ? id : parent
        }
        const relatedIds = new Set<string>()
        for (const rel of model.relationships) {
            const related = componentIds.has(rel.sourceId) ? shownAs(rel.destinationId)
                : componentIds.has(rel.destinationId) ? shownAs(rel.sourceId)
                    : undefined
            if (related !== undefined) relatedIds.add(related)
        }
        for (const p of model.people) { if (relatedIds.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) {
            if (relatedIds.has(s.id)) addId(s.id)
            for (const c of s.containers) { if (relatedIds.has(c.id)) addId(c.id) }
        }
    }

    return ids.map(id => ({ id }))
}

/** What `include *` shows in `view` for the current model: the static view
 *  expansion above, or every deployment element of a deployment view's
 *  environment (scoped to its software system, if it has one). */
export function wildcardElements(model: Model, view: View): ElementInView[] {
    return view.type === 'deployment'
        ? expandDeploymentElements(model, view.environment, view.softwareSystemId)
        : expandWildcard(model, view)
}

/** A relationship Structurizr implies between two elements a view shows,
 *  from a model relationship between them or their descendants (#230). */
export interface ImpliedRelationship {
    /** Edge id: unique per view, and never a model relationship's id. */
    id: string
    sourceId: string
    destinationId: string
    /** The model relationship it is implied from. Structurizr gives the
     *  implied one its description and technology and styles it by its
     *  tags, so the canvas draws it with this relationship's label and
     *  style, and selecting the arrow selects this relationship. */
    relationship: Relationship
}

const pairKey = (sourceId: string, destinationId: string) => `${sourceId}\u0000${destinationId}`

/**
 * Structurizr's default implied relationships (the DSL uses
 * CreateImpliedRelationshipsUnlessAnyRelationshipExistsStrategy): creating
 * `a -> b` also creates one from `a` or any of its ancestors to `b` or any
 * of its ancestors, with the same description and technology, for each such
 * pair that is not an element and its own parent or child and has no
 * relationship from that source to that destination yet. Relationships are
 * created in model order (the order a save writes them), so the first one
 * to imply a pair names it, and an explicit relationship between that pair
 * written later is added next to it rather than replacing it. Checked
 * against the Structurizr CLI export.
 */
function impliedRelationships(model: Model): Omit<ImpliedRelationship, 'id'>[] {
    const parents = parentMap(model)
    const lineage = (id: string): string[] => {
        const out = [id]
        for (let p = parents.get(id); p !== undefined; p = parents.get(p)) out.push(p)
        return out
    }
    const related = (a: string, b: string) => lineage(a).includes(b) || lineage(b).includes(a)
    const connected = new Set<string>()
    const implied: Omit<ImpliedRelationship, 'id'>[] = []
    for (const relationship of model.relationships) {
        // Structurizr refuses a relationship between an element and its own
        // parent or child, so that one implies nothing.
        if (related(relationship.sourceId, relationship.destinationId)) continue
        connected.add(pairKey(relationship.sourceId, relationship.destinationId))
        for (const sourceId of lineage(relationship.sourceId)) {
            for (const destinationId of lineage(relationship.destinationId)) {
                const key = pairKey(sourceId, destinationId)
                if (connected.has(key) || related(sourceId, destinationId)) continue
                connected.add(key)
                implied.push({ sourceId, destinationId, relationship })
            }
        }
    }
    return implied
}

const IMPLIED_VIEW_TYPES = new Set<View['type']>(['systemLandscape', 'systemContext', 'container', 'component'])

/**
 * The implied relationships an `include *` static view draws besides the
 * model relationships it lists: each one between two elements it shows.
 * Without them the view drew no arrow to a software system it shows for
 * another system's container or component (#230). They are worked out
 * from the model on demand and never stored on the view, so a save writes
 * nothing for them and Structurizr derives the same ones from the file.
 *
 * Structurizr's `exclude "a -> b"` removes every relationship from a to b,
 * implied ones included. The view keeps that line as the ids of the model
 * relationships from a to b, so an implied one between the pair is left out
 * too. Excluding the relationship an implied one comes from does not hide
 * it, in Structurizr or here.
 */
export function wildcardImpliedRelationships(model: Model, view: View): ImpliedRelationship[] {
    if (!view.includeAll || !IMPLIED_VIEW_TYPES.has(view.type)) return []
    const shown = new Set(view.elements.map(e => e.id))
    const byId = new Map(model.relationships.map(r => [r.id, r]))
    const excludedPairs = new Set<string>()
    for (const id of view.excludedRelationshipIds ?? []) {
        const rel = byId.get(id)
        if (rel) excludedPairs.add(pairKey(rel.sourceId, rel.destinationId))
    }
    const taken = new Set(byId.keys())
    const out: ImpliedRelationship[] = []
    for (const implied of impliedRelationships(model)) {
        if (!shown.has(implied.sourceId) || !shown.has(implied.destinationId)) continue
        if (excludedPairs.has(pairKey(implied.sourceId, implied.destinationId))) continue
        // `>` only ever appears as the separator, so distinct pairs get
        // distinct ids; the suffix keeps clear of any relationship id.
        let id = `implied:${encodeURIComponent(implied.sourceId)}->${encodeURIComponent(implied.destinationId)}`
        while (taken.has(id)) id += '~'
        taken.add(id)
        out.push({ id, ...implied })
    }
    return out
}

/** Each container's and component's software system. */
export function enclosingSystems(model: Model): Map<string, string> {
    const systems = new Map<string, string>()
    for (const s of model.softwareSystems) {
        for (const c of s.containers) {
            systems.set(c.id, s.id)
            for (const comp of c.components) systems.set(comp.id, s.id)
        }
    }
    return systems
}

/**
 * Structurizr never shows an element in a static view together with its
 * parent or child (a software system and one of its containers, a container
 * and one of its components): whichever is included first stays, and the
 * other is left out. `clashes(id)` says whether `id` would be left out next
 * to the elements `add`ed so far. The view's own scope (its software system,
 * and a component view's container) never takes part: Structurizr does not
 * show it as an element. Deployment views nest nodes and instances on
 * purpose, so the rule never applies to them.
 */
export function hierarchyGuard(model: Model, view: View, initial: Iterable<string> = []) {
    const parents = view.type === 'deployment' ? new Map<string, string>() : parentMap(model)
    const scope = new Set<string>()
    if (view.type === 'container' && view.softwareSystemId) scope.add(view.softwareSystemId)
    if (view.type === 'component' && view.containerId) {
        scope.add(view.containerId)
        const system = parents.get(view.containerId)
        if (system !== undefined) scope.add(system)
    }
    const added = new Set<string>()
    const ancestorsOfAdded = new Set<string>()
    const ancestors = (id: string): string[] => {
        const out: string[] = []
        for (let p = parents.get(id); p !== undefined && !scope.has(p); p = parents.get(p)) out.push(p)
        return out
    }
    const add = (id: string) => {
        if (scope.has(id)) return
        added.add(id)
        for (const a of ancestors(id)) ancestorsOfAdded.add(a)
    }
    for (const id of initial) add(id)
    return {
        add,
        clashes: (id: string): boolean =>
            !scope.has(id) && (ancestorsOfAdded.has(id) || ancestors(id).some(a => added.has(a))),
    }
}

/** `ids` plus, in a deployment view, everything inside each of them that is
 *  a deployment node: Structurizr's `exclude <node>` also removes the node's
 *  child nodes, infrastructure nodes and instances. */
export function withDeploymentDescendants(model: Model, view: View, ids: Iterable<string>): Set<string> {
    const out = new Set(ids)
    if (view.type !== 'deployment' || out.size === 0) return out
    const env = (model.deploymentEnvironments ?? []).find(e => e.name === view.environment)
    if (!env) return out
    // A parent node is visited before its children, so exclusion flows down.
    walkDeploymentNodes(env, (node) => {
        if (!out.has(node.id)) return
        for (const child of node.children) out.add(child.id)
        for (const infra of node.infrastructureNodes) out.add(infra.id)
        for (const inst of node.containerInstances) out.add(inst.id)
        for (const inst of node.softwareSystemInstances) out.add(inst.id)
    })
    return out
}
