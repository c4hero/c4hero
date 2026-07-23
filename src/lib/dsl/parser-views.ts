// DSL parser — `views { ... }` block handling.
//
// Extracted from parser.ts. Each function takes the parser instance as its
// first argument so it can use the shared token-navigation helpers and
// access viewExcludedIds / the resolveRef map without inheriting the full
// parser class.

import type { Workspace, View, ViewType, AutoLayout, LayoutDirection, Model } from '@/types/model'
import type { ContextAwareParser } from './parser'
import { parseStylesBody } from './parser-styles'

interface ViewsContainer {
    systemLandscapeViews: View[]
    systemContextViews: View[]
    containerViews: View[]
    componentViews: View[]
    dynamicViews: View[]
    deploymentViews: View[]
}

/** Generate a stable, unique view key when the DSL doesn't provide one.
 *  Mirrors the Structurizr default-key convention (Type-ScopeRef) and falls
 *  back to a numeric suffix on collision. Empty/missing keys break navigation
 *  in the workspace store, so we always assign one. */
function ensureViewKey(view: View, viewsContainer: ViewsContainer, elementRef: string | undefined): void {
    if (view.key) return
    const typeKey =
        view.type === 'systemLandscape' ? 'SystemLandscape'
        : view.type === 'systemContext' ? 'SystemContext'
        : view.type === 'container' ? 'Containers'
        : view.type === 'component' ? 'Components'
        : view.type === 'dynamic' ? 'Dynamic'
        : 'Deployment'
    const base = elementRef ? `${typeKey}-${elementRef}` : typeKey
    const existing = [
        ...viewsContainer.systemLandscapeViews,
        ...viewsContainer.systemContextViews,
        ...viewsContainer.containerViews,
        ...viewsContainer.componentViews,
        ...viewsContainer.dynamicViews,
        ...viewsContainer.deploymentViews,
    ]
    let candidate = base
    let suffix = 2
    while (existing.some(v => v.key === candidate)) {
        candidate = `${base}-${suffix++}`
    }
    view.key = candidate
    view.autoKey = true
}

export function parseViewsBody(p: ContextAwareParser, views: Workspace['views'], model: Model): void {
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
                    ensureViewKey(view, views, undefined)
                    views.systemLandscapeViews.push(view)
                }
                continue
            }
            if (kw === 'systemcontext') {
                const view = parseElementView(p, 'systemContext', model)
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId)
                    views.systemContextViews.push(view)
                }
                continue
            }
            if (kw === 'container') {
                const view = parseElementView(p, 'container', model)
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId)
                    views.containerViews.push(view)
                }
                continue
            }
            if (kw === 'component') {
                const view = parseElementView(p, 'component', model)
                if (view) {
                    ensureViewKey(view, views, view.containerId)
                    views.componentViews.push(view)
                }
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
                continue
            }
            if (kw === 'dynamic') {
                const view = parseDynamicView(p, model)
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId ?? view.containerId)
                    views.dynamicViews.push(view)
                }
                continue
            }
            if (kw === 'deployment') {
                const view = parseDeploymentView(p, model)
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId ?? view.environment)
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

    const elementRef = p.readOptionalStringOrIdentifier()
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

    if (elementRef) {
        const resolvedId = p.resolveRef(elementRef)
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
function parseDynamicView(p: ContextAwareParser, model: Model): View | null {
    p.advance() // consume 'dynamic'

    // Scope: `*` (unscoped), or a software system / container reference.
    let scopeRef: string | undefined
    if (p.check('STAR')) {
        p.advance()
    } else {
        scopeRef = p.readOptionalStringOrIdentifier()
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

        // Parallel-sequence group: Structurizr numbers these 2a/2b/…; we
        // flatten them into the running sequence so no step is lost.
        if (token.type === 'LBRACE') {
            p.advance()
            parseDynamicViewBody(p, view, model, order)
            p.skipNewlines()
            p.expect('RBRACE')
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

        // Interaction step: `source -> destination ["description"]`
        if ((token.type === 'IDENTIFIER' || token.type === 'KEYWORD') && p.tokens[p.pos + 1]?.type === 'ARROW') {
            const sourceToken = p.advance()
            p.advance() // consume ARROW
            const destToken = p.peek()
            if (destToken.type !== 'IDENTIFIER' && destToken.type !== 'KEYWORD') {
                p.addError(`Expected interaction destination, got ${destToken.type}`, destToken)
                p.skipToNextLine()
                continue
            }
            p.advance()
            const stepDescription = p.readOptionalString() || undefined

            const sourceId = p.resolveRef(sourceToken.value)
            const destId = p.resolveRef(destToken.value)
            if (!sourceId || !destId) {
                p.addError(`Unresolved reference in dynamic view: '${!sourceId ? sourceToken.value : destToken.value}'`, sourceToken)
                continue
            }

            // The step must reference an existing model relationship. Prefer a
            // description match when several connect the same pair.
            const candidates = model.relationships.filter(
                r => !r.implied && r.sourceId === sourceId && r.destinationId === destId
            )
            const rel = candidates.find(r => stepDescription && r.description === stepDescription) ?? candidates[0]
            if (!rel) {
                p.addError(
                    `Dynamic view step references a relationship that does not exist in the model: '${sourceToken.value} -> ${destToken.value}'`,
                    sourceToken
                )
                continue
            }

            view.relationships.push({
                id: rel.id,
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
        scopeRef = p.readOptionalStringOrIdentifier()
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
                        const ref = p.advance().value
                        const resolvedId = p.resolveRef(ref)
                        view.elements.push({ id: resolvedId ?? ref })
                    }
                }
                continue
            }

            if (kw === 'exclude') {
                p.advance()
                const excluded = p.viewExcludedIds.get(view) ?? new Set<string>()
                while (p.check('STAR') || p.check('IDENTIFIER') || p.check('STRING') || p.check('KEYWORD')) {
                    const ref = p.advance().value
                    const resolvedId = p.resolveRef(ref)
                    excluded.add(resolvedId ?? ref)
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
    const value = valueTok.value

    // Commit: consume all 6 tokens
    p.advance(); p.advance(); p.advance(); p.advance(); p.advance(); p.advance()

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
