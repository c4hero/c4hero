// DSL parser — `views { ... }` block handling.
//
// Extracted from parser.ts. Each function takes the parser instance as its
// first argument so it can use the shared token-navigation helpers and
// access viewExcludedIds / the resolveRef map without inheriting the full
// parser class.

import type { Workspace, View, ViewType, AutoLayout, LayoutDirection } from '@/types/model'
import type { ContextAwareParser } from './parser'
import { parseStylesBody } from './parser-styles'

interface ViewsContainer {
    systemLandscapeViews: View[]
    systemContextViews: View[]
    containerViews: View[]
    componentViews: View[]
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
        : 'Components'
    const base = elementRef ? `${typeKey}-${elementRef}` : typeKey
    const existing = [
        ...viewsContainer.systemLandscapeViews,
        ...viewsContainer.systemContextViews,
        ...viewsContainer.containerViews,
        ...viewsContainer.componentViews,
    ]
    let candidate = base
    let suffix = 2
    while (existing.some(v => v.key === candidate)) {
        candidate = `${base}-${suffix++}`
    }
    view.key = candidate
    view.autoKey = true
}

export function parseViewsBody(p: ContextAwareParser, views: Workspace['views']): void {
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'systemlandscape') {
                const view = parseSystemLandscapeView(p)
                if (view) {
                    ensureViewKey(view, views, undefined)
                    views.systemLandscapeViews.push(view)
                }
                continue
            }
            if (kw === 'systemcontext') {
                const view = parseElementView(p, 'systemContext')
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId)
                    views.systemContextViews.push(view)
                }
                continue
            }
            if (kw === 'container') {
                const view = parseElementView(p, 'container')
                if (view) {
                    ensureViewKey(view, views, view.softwareSystemId)
                    views.containerViews.push(view)
                }
                continue
            }
            if (kw === 'component') {
                const view = parseElementView(p, 'component')
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
            if (kw === 'dynamic' || kw === 'deployment' || kw === 'filtered' || kw === 'custom') {
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

function parseSystemLandscapeView(p: ContextAwareParser): View | null {
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
        parseViewBody(p, view)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

function parseElementView(p: ContextAwareParser, type: ViewType): View | null {
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
        parseViewBody(p, view)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return view
}

function parseViewBody(p: ContextAwareParser, view: View): void {
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
                    while (p.check('IDENTIFIER') || p.check('STRING') || p.check('KEYWORD')) {
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
                p.advance()
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
