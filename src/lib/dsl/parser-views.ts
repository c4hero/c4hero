// DSL parser — `views { ... }` block handling.
//
// Extracted from parser.ts. Each function takes the parser instance as its
// first argument so it can use the shared token-navigation helpers and
// access viewExcludedIds / the resolveRef map without inheriting the full
// parser class.

import type { Workspace, View, ViewType, AutoLayout, LayoutDirection, Model, Relationship } from '@/types/model'
import type { ContextAwareParser } from './parser'
import type { Token } from './lexer'
import { parseStylesBody } from './parser-styles'
import { isConformantViewKey, sanitizeViewKey } from './viewKey'

interface ViewsContainer {
    systemLandscapeViews: View[]
    systemContextViews: View[]
    containerViews: View[]
    componentViews: View[]
    dynamicViews: View[]
    deploymentViews: View[]
}

/** One parsed view waiting for its key, with what a derived key would be
 *  built from and where a warning about it should point. */
interface PendingViewKey {
    view: View
    /** The element the view is scoped to, if any — the `-<ref>` of a derived key. */
    elementRef: string | undefined
    /** The view's opening keyword, so a warning points at the view's own line
     *  rather than at whatever token follows its closing brace. */
    at: Token
}

/** The Structurizr default-key convention, `Type-ScopeRef`. */
function derivedKeyBase(view: View, elementRef: string | undefined): string {
    const typeKey =
        view.type === 'systemLandscape' ? 'SystemLandscape'
        : view.type === 'systemContext' ? 'SystemContext'
        : view.type === 'container' ? 'Containers'
        : view.type === 'component' ? 'Components'
        : view.type === 'dynamic' ? 'Dynamic'
        : 'Deployment'
    // The base of a derived key is sanitized too — an element ref carrying a
    // dot or a space must not be able to originate a bad key either.
    const ref = elementRef ? sanitizeViewKey(elementRef) : ''
    return ref ? `${typeKey}-${ref}` : typeKey
}

/** Settle every parsed view's key in one pass: keep a conformant one exactly
 *  as written, normalize a non-conformant one (warning the user), and derive a
 *  stable key for a view the DSL gave none.
 *
 *  Deliberately a *post*-parse pass rather than a per-view decision. A key we
 *  mint — normalized or derived — must not collide with an authored key that
 *  appears further down the file, and nothing in a single forward pass can see
 *  those yet. Reserving every authored key up front is what makes the settled
 *  set collision-free in both directions.
 *
 *  Duplicate *authored* keys are left alone: that is the source file's own
 *  pre-existing error (Structurizr says "A view with the key X already
 *  exists"), reported by `validateForStructurizr` rather than papered over by
 *  renaming the user's view.
 *
 *  This is the single place every parsed view's key passes through, which is
 *  what makes "the model never holds a key Structurizr rejects" (TEA-166) a
 *  property of the parser rather than a rule six call sites have to remember. */
function settleViewKeys(p: ContextAwareParser, pending: PendingViewKey[], viewsContainer: ViewsContainer): void {
    // Keys already spoken for: every authored-and-conformant key in this
    // block, plus anything a previous `views { }` block already settled.
    const taken = new Set<string>()
    for (const v of allViewsOf(viewsContainer)) if (v.key && isConformantViewKey(v.key)) taken.add(v.key)

    /** First of `base`, `base-2`, `base-3`, … that nothing has claimed. */
    const claim = (base: string): string => {
        let candidate = base
        let suffix = 2
        while (taken.has(candidate)) candidate = `${base}-${suffix++}`
        taken.add(candidate)
        return candidate
    }

    for (const { view, elementRef, at } of pending) {
        const authored = view.key
        if (authored && isConformantViewKey(authored)) continue // already reserved above

        if (authored) {
            view.originalKey = authored
            const normalized = sanitizeViewKey(authored)
            if (normalized) {
                view.key = claim(normalized)
                // The authored key was doing double duty as the view's label:
                // c4hero shows `title ?? key`, and a key written as
                // `"Billing Context"` is a human-readable string precisely
                // because someone meant it to be read. Rewriting the key would
                // silently rename the view on screen, so the original text is
                // promoted to the field that actually holds labels. Nothing is
                // lost — it round-trips as `title "Billing Context"` — and a
                // view that already has a title keeps it.
                if (!view.title) view.title = authored
                p.addWarning(
                    `View key "${authored}" contains characters Structurizr rejects (only a-zA-Z0-9_- are allowed) — using "${view.key}", and keeping "${authored}" as the view's title`,
                    at,
                )
                continue
            }
            // Nothing legal survived (e.g. a key of only spaces): fall through
            // to a derived key, and say so rather than silently dropping it.
            if (!view.title) view.title = authored
            p.addWarning(
                `View key "${authored}" contains no characters Structurizr allows (only a-zA-Z0-9_-) — using a generated key`,
                at,
            )
        }

        view.key = claim(derivedKeyBase(view, elementRef))
        view.autoKey = true
    }
}

function allViewsOf(c: ViewsContainer): View[] {
    return [
        ...c.systemLandscapeViews,
        ...c.systemContextViews,
        ...c.containerViews,
        ...c.componentViews,
        ...c.dynamicViews,
        ...c.deploymentViews,
    ]
}

export function parseViewsBody(p: ContextAwareParser, views: Workspace['views'], model: Model): void {
    // Keys are settled after the block, not per view — see settleViewKeys.
    const pendingKeys: PendingViewKey[] = []
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'systemlandscape') {
                const view = parseSystemLandscapeView(p, model)
                if (view) {
                    pendingKeys.push({ view, elementRef: undefined, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.systemLandscapeViews.push(view)
                }
                continue
            }
            if (kw === 'systemcontext') {
                const view = parseElementView(p, 'systemContext', model)
                if (view) {
                    pendingKeys.push({ view, elementRef: view.softwareSystemId, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.systemContextViews.push(view)
                }
                continue
            }
            if (kw === 'container') {
                const view = parseElementView(p, 'container', model)
                if (view) {
                    pendingKeys.push({ view, elementRef: view.softwareSystemId, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.containerViews.push(view)
                }
                continue
            }
            if (kw === 'component') {
                const view = parseElementView(p, 'component', model)
                if (view) {
                    pendingKeys.push({ view, elementRef: view.containerId, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.componentViews.push(view)
                }
                continue
            }
            if (token.value.startsWith('!')) {
                // Preprocessor directive inside views — preserved verbatim.
                p.noteDirective(token.value, 'views', token)
                p.advance()
                p.skipToNextLine()
                continue
            }
            if (kw === 'styles') {
                p.advance()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseStylesBody(p, views.configuration)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }
            if (kw === 'theme' || kw === 'themes') {
                p.advance()
                const themes: string[] = []
                while (p.check('STRING') || p.check('IDENTIFIER')) {
                    themes.push(p.advance().value)
                }
                views.configuration.themes = themes
                p.themesLine = token.line
                continue
            }
            if (kw === 'dynamic') {
                const view = parseDynamicView(p, model)
                if (view) {
                    pendingKeys.push({ view, elementRef: view.softwareSystemId ?? view.containerId, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.dynamicViews.push(view)
                }
                continue
            }
            if (kw === 'deployment') {
                const view = parseDeploymentView(p, model)
                if (view) {
                    pendingKeys.push({ view, elementRef: view.softwareSystemId ?? view.environment, at: token })
                    p.viewLines.set(view, p.lastLine())
                    views.deploymentViews.push(view)
                }
                continue
            }
            if (kw === 'filtered' || kw === 'custom') {
                p.advance()
                while (p.check('STRING') || p.check('IDENTIFIER')) p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
                continue
            }
            if (kw === 'branding' || kw === 'terminology' || kw === 'configuration' || kw === 'properties') {
                p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
                continue
            }
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        if (token.type === 'IDENTIFIER') {
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
    settleViewKeys(p, pendingKeys, views)
}

function parseSystemLandscapeView(p: ContextAwareParser, model: Model): View | null {
    p.advance() // consume 'systemLandscape'
    const key = p.readOptionalStringOrIdentifier() ?? ''
    const positionalDescription = p.readOptionalString()

    const view: View = {
        type: 'systemLandscape',
        key,
        // Structurizr defines the second optional view header string as
        // the view description. Keep it as a display title fallback too so
        // existing DSL authored for c4hero still labels views usefully.
        title: positionalDescription,
        description: positionalDescription,
        elements: [],
        relationships: [],
    }

    p.skipNewlines()
    if (p.match('LBRACE')) {
        parseViewBody(p, view, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

function parseElementView(p: ContextAwareParser, type: ViewType, model: Model): View | null {
    p.advance() // consume keyword

    // The scope may be a qualified path — `component pathways.navigatorApi` —
    // in which case reading a single token would bind the view to the system
    // and leave `.navigatorApi` sitting in the key slot.
    const scope = p.readQualifiedRef({ allowString: true })
    const elementRef = scope?.ref
    const key = p.readOptionalStringOrIdentifier() ?? ''
    const positionalDescription = p.readOptionalString()

    const view: View = {
        type,
        key,
        title: positionalDescription,
        description: positionalDescription,
        elements: [],
        relationships: [],
    }

    if (elementRef && scope) {
        const resolvedId = p.resolveRef(elementRef)
        if (!resolvedId && elementRef.includes('.')) {
            p.addError(`Unresolved reference: '${elementRef}'`, scope.token)
        }
        if (type === 'systemContext' || type === 'container') {
            view.softwareSystemId = resolvedId ?? elementRef
        } else if (type === 'component') {
            view.containerId = resolvedId ?? elementRef
        }
    }

    p.skipNewlines()
    if (p.match('LBRACE')) {
        parseViewBody(p, view, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

/** Parse `autoLayout [direction] [rankSep] [nodeSep]` into a view. */
function parseAutoLayoutInto(p: ContextAwareParser, view: View): void {
    p.advance() // consume 'autoLayout'
    const layout: AutoLayout = { direction: 'TB' }
    if (p.check('IDENTIFIER') || p.check('KEYWORD')) {
        const dir = p.peekValue().toUpperCase()
        if (dir === 'TB' || dir === 'BT' || dir === 'LR' || dir === 'RL') {
            layout.direction = dir as LayoutDirection
            p.advance()
        }
    }
    if (p.check('NUMBER')) {
        layout.rankSeparation = parseInt(p.advance().value, 10)
    }
    if (p.check('NUMBER')) {
        layout.nodeSeparation = parseInt(p.advance().value, 10)
    }
    view.autoLayout = layout
}

/** Parse `dynamic <scope|*> [key] [description] { ... }`.
 *
 *  The body is an ordered sequence of `source -> destination ["description"]`
 *  steps. Each step must reference a relationship that exists in the model
 *  (Structurizr semantics); the view stores the relationship id plus the
 *  step's order label and optional description override. View elements are
 *  derived from the step endpoints. */
/** The element plus every descendant in the C4 tree (system -> containers ->
 *  components). People and components have no descendants. */
function subtreeIds(model: Model, rootId: string): Set<string> {
    const ids = new Set<string>([rootId])
    for (const sys of model.softwareSystems) {
        if (sys.id === rootId) {
            for (const c of sys.containers) {
                ids.add(c.id)
                for (const comp of c.components) ids.add(comp.id)
            }
            return ids
        }
        for (const c of sys.containers) {
            if (c.id === rootId) {
                for (const comp of c.components) ids.add(comp.id)
                return ids
            }
        }
    }
    return ids
}

function parseDynamicView(p: ContextAwareParser, model: Model): View | null {
    p.advance() // consume 'dynamic'

    // Scope: `*` (unscoped), or a software system / container reference —
    // possibly hierarchical (`sys1.api`).
    let scopeRef: string | undefined
    if (p.check('STAR')) {
        p.advance()
    } else {
        scopeRef = p.readQualifiedRef()?.ref
    }

    const key = p.readOptionalStringOrIdentifier() ?? ''
    const positionalDescription = p.readOptionalString()

    const view: View = {
        type: 'dynamic',
        key,
        title: positionalDescription,
        description: positionalDescription,
        elements: [],
        relationships: [],
    }

    if (scopeRef) {
        const resolvedId = p.resolveRef(scopeRef)
        const scopeType = resolvedId ? p.elementsById.get(resolvedId)?.type : undefined
        if (scopeType === 'container') {
            view.containerId = resolvedId
        } else {
            view.softwareSystemId = resolvedId ?? scopeRef
        }
    }

    p.skipNewlines()
    if (p.match('LBRACE')) {
        const order = { next: 1 }
        parseDynamicViewBody(p, view, model, order)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

function parseDynamicViewBody(p: ContextAwareParser, view: View, model: Model, order: { next: number }): void {
    // Dedup against the view itself — this body recurses for parallel groups,
    // and a snapshot set would miss elements added by inner/outer levels.
    const addElement = (id: string) => {
        if (!view.elements.some(e => e.id === id)) {
            view.elements.push({ id })
        }
    }

    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }

        // Parallel-sequence group. Structurizr clones the sequence counter at
        // `{` and reverts it at `}`: every branch numbers from the same base,
        // and the step after the groups reuses that base too (verified against
        // the real CLI — `a->b  {b->c  c->d}  {b->d}  d->e` numbers
        // 1, 2, 3, 2, 2). Duplicate orders across steps are therefore normal.
        if (token.type === 'LBRACE') {
            p.advance()
            const base = order.next
            parseDynamicViewBody(p, view, model, order)
            p.skipNewlines()
            p.expect('RBRACE')
            order.next = base
            continue
        }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'autolayout') {
                parseAutoLayoutInto(p, view)
                continue
            }
            if (kw === 'title') {
                p.advance()
                view.title = p.readOptionalString()
                continue
            }
            if (kw === 'description') {
                p.advance()
                view.description = p.readOptionalString()
                continue
            }
            if (kw === 'animation' || kw === 'properties') {
                p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
                continue
            }
            if (kw === 'default') {
                p.advance()
                continue
            }
        }

        // Interaction step: `source -> destination ["description"]`, where
        // either side may be a hierarchical (dotted) reference.
        if (p.looksLikeRelationship()) {
            const source = p.readQualifiedRef()!
            p.skipNewlines()
            p.advance() // consume ARROW
            p.skipNewlines()
            const dest = p.readQualifiedRef()
            if (!dest) {
                p.addError(`Expected interaction destination, got ${p.peekType()}`, p.peek())
                p.skipToNextLine()
                continue
            }
            const stepDescription = p.readOptionalString() || undefined

            const sourceId = p.resolveRef(source.ref)
            const destId = p.resolveRef(dest.ref)
            if (!sourceId || !destId) {
                p.addError(`Unresolved reference in dynamic view: '${!sourceId ? source.ref : dest.ref}'`, source.token)
                continue
            }

            // The step must reference an existing model relationship. Match
            // tiers mirror what the real Structurizr parser resolves:
            //   1. exact forward (source -> dest)
            //   2. hierarchy-implied forward — any relationship between a
            //      descendant of source and a descendant of dest (Structurizr
            //      materializes these as parent-level relationships when
            //      `!impliedRelationships` is on; we match them lazily)
            //   3/4. the same two reversed — a response message travelling
            //      back over an existing relationship.
            // Within a tier, prefer a description match when several qualify.
            const pick = (rels: Relationship[]) =>
                rels.find(r => stepDescription && r.description === stepDescription) ?? rels[0]
            const sourceTree = subtreeIds(model, sourceId)
            const destTree = subtreeIds(model, destId)
            const forward = pick(model.relationships.filter(
                r => r.sourceId === sourceId && r.destinationId === destId,
            )) ?? pick(model.relationships.filter(
                r => sourceTree.has(r.sourceId) && destTree.has(r.destinationId),
            ))
            const reverse = forward ? undefined : (pick(model.relationships.filter(
                r => r.sourceId === destId && r.destinationId === sourceId,
            )) ?? pick(model.relationships.filter(
                r => destTree.has(r.sourceId) && sourceTree.has(r.destinationId),
            )))
            const rel = forward ?? reverse
            if (!rel) {
                p.addError(
                    `Dynamic view step references a relationship that does not exist in the model: '${source.ref} -> ${dest.ref}'`,
                    source.token,
                )
                continue
            }

            view.relationships.push({
                id: rel.id,
                sourceId,
                destinationId: destId,
                response: reverse ? true : undefined,
                order: String(order.next++),
                description: stepDescription,
            })
            addElement(sourceId)
            addElement(destId)
            continue
        }

        if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
}

/** Parse `deployment <scope|*> <environment> [key] [description] { ... }`.
 *  The body is the standard view body (include/exclude/autoLayout/…). */
function parseDeploymentView(p: ContextAwareParser, model: Model): View | null {
    p.advance() // consume 'deployment'

    let scopeRef: string | undefined
    if (p.check('STAR')) {
        p.advance()
    } else {
        scopeRef = p.readQualifiedRef({ allowString: true })?.ref
    }

    // Environment: a string name, or an identifier assigned to a
    // deploymentEnvironment (resolved back to the environment's name).
    let environment = p.readOptionalStringOrIdentifier()
    if (environment !== undefined) {
        const resolved = p.resolveRef(environment)
        if (resolved && p.elementsById.get(resolved)?.type === 'deploymentEnvironment') {
            environment = p.elementsById.get(resolved)!.name
        }
    }

    const key = p.readOptionalStringOrIdentifier() ?? ''
    const positionalDescription = p.readOptionalString()

    const view: View = {
        type: 'deployment',
        key,
        title: positionalDescription,
        description: positionalDescription,
        environment,
        elements: [],
        relationships: [],
    }

    if (scopeRef) {
        const resolvedId = p.resolveRef(scopeRef)
        view.softwareSystemId = resolvedId ?? scopeRef
    }

    if (environment !== undefined && !model.deploymentEnvironments.some(e => e.name === environment)) {
        p.addError(`Deployment view references unknown environment '${environment}'`, p.peek())
    }

    p.skipNewlines()
    if (p.match('LBRACE')) {
        parseViewBody(p, view, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

function parseViewBody(p: ContextAwareParser, view: View, model: Model): void {
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'include') {
                p.advance()
                if (p.match('STAR')) {
                    view.elements.push({ id: '*' })
                } else {
                    // Each arg is either:
                    //   - an element ref (IDENTIFIER/STRING/KEYWORD)
                    //   - an expression: `element.type==X` or `element.parent==X`
                    //     (Structurizr cookbook: container-view-multiple-software-systems)
                    while (p.check('IDENTIFIER') || p.check('STRING') || p.check('KEYWORD')) {
                        const expansion = tryParseElementExpression(p, model)
                        if (expansion) {
                            for (const id of expansion) view.elements.push({ id })
                            continue
                        }
                        const ref = p.readQualifiedRef({ allowString: true })
                        if (!ref) { p.advance(); continue }
                        const resolvedId = p.resolveRef(ref.ref)
                        if (!resolvedId && ref.ref.includes('.')) {
                            p.addError(`Unresolved reference: '${ref.ref}'`, ref.token)
                        }
                        view.elements.push({ id: resolvedId ?? ref.ref })
                    }
                }
                continue
            }

            if (kw === 'exclude') {
                p.advance()
                const excluded = p.viewExcludedIds.get(view) ?? new Set<string>()
                while (p.check('STAR') || p.check('IDENTIFIER') || p.check('STRING') || p.check('KEYWORD')) {
                    if (p.check('STAR')) { excluded.add(p.advance().value); continue }
                    if (p.check('STRING') && p.peek().value.includes('->')) {
                        const expression = p.advance().value
                        const [sourceRef, destinationRef, ...rest] = expression.split('->').map(s => s.trim())
                        if (sourceRef && destinationRef && rest.length === 0) {
                            const sourceId = p.resolveRef(sourceRef) ?? sourceRef
                            const destinationId = p.resolveRef(destinationRef) ?? destinationRef
                            const ids = model.relationships
                                .filter(r => (sourceRef === '*' || r.sourceId === sourceId) && (destinationRef === '*' || r.destinationId === destinationId))
                                .map(r => r.id)
                            if (ids.length > 0) {
                                const excludedRelationships = (view.excludedRelationshipIds ??= [])
                                for (const id of ids) {
                                    if (!excludedRelationships.includes(id)) excludedRelationships.push(id)
                                }
                            }
                            continue
                        }
                    }
                    const ref = p.readQualifiedRef({ allowString: true })
                    if (!ref) { p.advance(); continue }
                    const resolvedId = p.resolveRef(ref.ref)
                    if (!resolvedId && ref.ref.includes('.')) {
                        p.addError(`Unresolved reference: '${ref.ref}'`, ref.token)
                    }
                    excluded.add(resolvedId ?? ref.ref)
                }
                p.viewExcludedIds.set(view, excluded)
                continue
            }

            if (kw === 'autolayout') {
                parseAutoLayoutInto(p, view)
                continue
            }

            if (kw === 'animation') {
                p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
                continue
            }

            if (kw === 'title') {
                p.advance()
                view.title = p.readOptionalString()
                continue
            }

            if (kw === 'description') {
                p.advance()
                view.description = p.readOptionalString()
                continue
            }

            if (kw === 'properties') {
                p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
                continue
            }

            if (kw === 'default') {
                p.advance()
                continue
            }

            // Unknown keyword: consume it and any inline args (stopping before LBRACE),
            // then skip any brace block so the view's closing RBRACE is not consumed.
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        // Unknown identifier (non-keyword directive): consume it and any inline args,
        // then skip any following brace block for the same reason as the KEYWORD path.
        if (token.type === 'IDENTIFIER') {
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
}

/**
 * Attempts to parse a Structurizr expression of the form
 * `element.<field>==<value>` from the current parser position. Returns the
 * list of element IDs the expression resolves to, or null if no expression
 * was found (in which case the caller falls through to the normal element-ref
 * path and the parser position is unchanged).
 *
 * Supported fields:
 *   - `element.type==<typename>` — every element of that type. Accepts the
 *     C4 type names: person, softwareSystem, container, component.
 *   - `element.parent==<ref>`    — every direct child of `<ref>` (containers
 *     of a system, or components of a container).
 *
 * Recognised at parse time inside `include` statements; the cookbook recipe
 * for "container view for multiple software systems" demonstrates the usage.
 * https://docs.structurizr.com/dsl/cookbook/container-view-multiple-software-systems/
 */
function tryParseElementExpression(p: ContextAwareParser, model: Model): string[] | null {
    // Lookahead must be: IDENTIFIER('element') DOT IDENTIFIER EQUALS EQUALS <value>
    if (p.peekValue() !== 'element' || p.tokens[p.pos + 1]?.type !== 'DOT') return null
    if (p.tokens[p.pos + 2]?.type !== 'IDENTIFIER' && p.tokens[p.pos + 2]?.type !== 'KEYWORD') return null
    if (p.tokens[p.pos + 3]?.type !== 'EQUALS' || p.tokens[p.pos + 4]?.type !== 'EQUALS') return null
    const valueTok = p.tokens[p.pos + 5]
    if (valueTok?.type !== 'IDENTIFIER' && valueTok?.type !== 'STRING' && valueTok?.type !== 'KEYWORD') return null

    const fieldName = p.tokens[p.pos + 2].value

    // Commit: consume `element . field = =`, then the value, which may itself be
    // a qualified path (`element.parent==mpng.studentApp`).
    p.advance(); p.advance(); p.advance(); p.advance(); p.advance()
    const value = p.readQualifiedRef({ allowString: true })?.ref ?? p.advance().value

    return resolveExpression(fieldName, value, model, p)
}

function resolveExpression(field: string, value: string, model: Model, p: ContextAwareParser): string[] {
    if (field === 'type') {
        return resolveTypeExpression(value, model)
    }
    if (field === 'parent') {
        return resolveParentExpression(value, model, p)
    }
    return []
}

function resolveTypeExpression(typeName: string, model: Model): string[] {
    const out: string[] = []
    const t = typeName.toLowerCase()
    if (t === 'person' || t === 'people') {
        for (const person of model.people) out.push(person.id)
    } else if (t === 'softwaresystem' || t === 'softwaresystems') {
        for (const sys of model.softwareSystems) out.push(sys.id)
    } else if (t === 'container' || t === 'containers') {
        for (const sys of model.softwareSystems) for (const c of sys.containers) out.push(c.id)
    } else if (t === 'component' || t === 'components') {
        for (const sys of model.softwareSystems) for (const c of sys.containers) for (const cmp of c.components) out.push(cmp.id)
    }
    return out
}

function resolveParentExpression(parentRef: string, model: Model, p: ContextAwareParser): string[] {
    const parentId = p.resolveRef(parentRef) ?? parentRef
    const out: string[] = []
    for (const sys of model.softwareSystems) {
        if (sys.id === parentId) {
            for (const c of sys.containers) out.push(c.id)
            return out
        }
        for (const c of sys.containers) {
            if (c.id === parentId) {
                for (const cmp of c.components) out.push(cmp.id)
                return out
            }
        }
    }
    return out
}
