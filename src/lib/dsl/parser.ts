// Structurizr DSL Parser — converts a token stream into a Workspace model.
// Produces meaningful errors with line/column positions.

import type {
    Workspace,
    Model,
    View,
    ElementInView,
} from '@/types/model'
import { lex } from './lexer'
import type { Token, TokenType } from './lexer'
import { parseViewsBody } from './parser-views'
import { parseModelBody } from './parser-model'

/**
 * Expand an `include *` wildcard into the actual elements appropriate for the view type.
 * Structurizr semantics: landscape/context = people + systems; container = people + systems + containers
 * of the scoped system; component = people + systems + containers + components of the scoped container.
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

    if (view.type === 'systemLandscape') {
        // Landscape: show everything — all people and software systems
        for (const p of model.people) addId(p.id)
        for (const s of model.softwareSystems) addId(s.id)
    } else if (view.type === 'systemContext' && view.softwareSystemId) {
        // System context: the scoped system + all people/systems connected to it.
        // We follow relationships at BOTH the system level AND the container/component
        // level of the scope system, then promote those to the system context. This
        // matches Structurizr's "implied relationships" behavior and what users
        // typically intend — DSL authors usually write relationships at container
        // granularity, then expect the system context to summarize the system's
        // collaborators rather than appear empty. (Strict spec without implied
        // relationships would only follow system-level edges.)
        const scopeId = view.softwareSystemId
        addId(scopeId)
        const scopeSys = model.softwareSystems.find(s => s.id === scopeId)
        const scopeInternalIds = new Set<string>([scopeId])
        if (scopeSys) {
            for (const c of scopeSys.containers) {
                scopeInternalIds.add(c.id)
                for (const comp of c.components) scopeInternalIds.add(comp.id)
            }
        }
        const connectedIds = new Set<string>()
        for (const rel of model.relationships) {
            if (scopeInternalIds.has(rel.sourceId)) connectedIds.add(rel.destinationId)
            if (scopeInternalIds.has(rel.destinationId)) connectedIds.add(rel.sourceId)
        }
        // Filter the connected set down to just people and OTHER software systems —
        // never the scope's own containers/components, and never elements inside the
        // scope. The system context is a system-level view.
        for (const p of model.people) { if (connectedIds.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) { if (s.id !== scopeId && connectedIds.has(s.id)) addId(s.id) }
    } else if (view.type === 'container' && view.softwareSystemId) {
        // Container view: containers of the scoped system + people/systems with direct
        // relationships to those containers. Mirrors addView() logic in the store.
        const scopeSys = model.softwareSystems.find(s => s.id === view.softwareSystemId)
        if (scopeSys) {
            for (const c of scopeSys.containers) addId(c.id)
        }
        const containerIds = new Set(ids)
        const relatedIds = new Set<string>()
        for (const rel of model.relationships) {
            if (containerIds.has(rel.sourceId)) relatedIds.add(rel.destinationId)
            if (containerIds.has(rel.destinationId)) relatedIds.add(rel.sourceId)
        }
        for (const p of model.people) { if (relatedIds.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) {
            if (s.id !== view.softwareSystemId && relatedIds.has(s.id)) addId(s.id)
            // Also include containers from other systems that are directly related
            for (const c of s.containers) {
                if (relatedIds.has(c.id)) addId(c.id)
            }
        }
    } else if (view.type === 'component' && view.containerId) {
        // Component view: components of the scoped container + directly related elements.
        const containerId = view.containerId
        for (const s of model.softwareSystems) {
            const parentContainer = s.containers.find(c => c.id === containerId)
            if (parentContainer) {
                for (const comp of parentContainer.components) addId(comp.id)
            }
        }
        const componentIds = new Set(ids)
        const relatedToComponents = new Set<string>()
        for (const rel of model.relationships) {
            if (componentIds.has(rel.sourceId)) relatedToComponents.add(rel.destinationId)
            if (componentIds.has(rel.destinationId)) relatedToComponents.add(rel.sourceId)
        }
        for (const p of model.people) { if (relatedToComponents.has(p.id)) addId(p.id) }
        for (const s of model.softwareSystems) {
            if (relatedToComponents.has(s.id)) addId(s.id)
            for (const c of s.containers) {
                if (c.id !== containerId && relatedToComponents.has(c.id)) addId(c.id)
                // If a component in another container is related, show that container as the C4 boundary
                else if (c.id !== containerId && c.components.some(comp => relatedToComponents.has(comp.id))) addId(c.id)
            }
        }
    }

    return ids.map(id => ({ id }))
}

// ─── Public Types ────────────────────────────────────────────────────

export interface ParseError {
    message: string
    line: number
    column: number
}

export interface ParseResult {
    workspace: Workspace
    errors: ParseError[]
}

// ─── ID Generation ───────────────────────────────────────────────────

let globalIdCounter = 0

export function nextId(): string {
    globalIdCounter++
    return `p${globalIdCounter}`
}

// ─── Parser Implementation ──────────────────────────────────────────

export const MAX_DEPTH = 50

export class ContextAwareParser {
    tokens: Token[]
    pos = 0
    errors: ParseError[] = []
    depth = 0

    // Variable name <-> element id mappings
    varToId = new Map<string, string>()
    nameToId = new Map<string, string>()
    elementsById = new Map<string, { name: string; type: string }>()

    relCounter = 0

    // Track elements excluded per view (used in post-processing to apply `exclude` directives)
    viewExcludedIds = new Map<View, Set<string>>()

    getExcludedIdsForView(view: View): Set<string> {
        return this.viewExcludedIds.get(view) ?? new Set()
    }

    constructor(tokens: Token[]) {
        this.tokens = tokens
    }

    // ─── Token Navigation ────────────────────────────────────────────

    peek(): Token {
        return this.tokens[this.pos]
    }

    peekType(): TokenType {
        return this.tokens[this.pos].type
    }

    peekValue(): string {
        return this.tokens[this.pos].value
    }

    advance(): Token {
        const token = this.tokens[this.pos]
        this.pos++
        return token
    }

    expect(type: TokenType, expectedValue?: string): Token {
        const token = this.peek()
        if (token.type !== type || (expectedValue !== undefined && token.value !== expectedValue)) {
            this.addError(
                `Expected ${type}${expectedValue ? ` '${expectedValue}'` : ''}, got ${token.type} '${token.value}'`,
                token
            )
            return token
        }
        return this.advance()
    }

    match(type: TokenType, value?: string): boolean {
        const token = this.peek()
        if (token.type === type && (value === undefined || token.value === value)) {
            this.advance()
            return true
        }
        return false
    }

    check(type: TokenType, value?: string): boolean {
        const token = this.peek()
        return token.type === type && (value === undefined || token.value === value)
    }

    skipNewlines(): void {
        while (this.peekType() === 'NEWLINE' || this.peekType() === 'COMMENT') {
            this.advance()
        }
    }

    skipToNextLine(): void {
        while (this.peekType() !== 'NEWLINE' && this.peekType() !== 'EOF') {
            this.advance()
        }
        if (this.peekType() === 'NEWLINE') {
            this.advance()
        }
    }

    addError(message: string, token: Token): void {
        this.errors.push({ message, line: token.line, column: token.column })
    }

    skipBraceBlock(): void {
        if (!this.match('LBRACE')) return
        let depth = 1
        while (depth > 0 && this.peekType() !== 'EOF') {
            if (this.peekType() === 'LBRACE') depth++
            if (this.peekType() === 'RBRACE') depth--
            if (depth > 0) this.advance()
        }
        if (this.peekType() === 'RBRACE') this.advance()
    }

    /** Consume inline args (until newline/EOF/LBRACE), then skip any following brace
     *  block. Used to gracefully ignore unknown keywords/identifiers in element bodies
     *  without mistakenly consuming the parent's closing `}`. */
    skipUnknownDirective(): void {
        while (this.peekType() !== 'NEWLINE' && this.peekType() !== 'EOF' && !this.check('LBRACE')) {
            this.advance()
        }
        if (this.peekType() === 'NEWLINE') this.advance()
        this.skipNewlines()
        if (this.check('LBRACE')) this.skipBraceBlock()
    }

    // ─── Registration ────────────────────────────────────────────────

    registerElement(id: string, name: string, _type: string, varName?: string): void {
        this.elementsById.set(id, { name, type: _type })
        this.nameToId.set(name, id)
        if (varName) {
            this.varToId.set(varName, id)
        }
    }

    resolveRef(ref: string): string | undefined {
        if (this.varToId.has(ref)) return this.varToId.get(ref)
        if (this.nameToId.has(ref)) return this.nameToId.get(ref)
        if (this.elementsById.has(ref)) return ref
        return undefined
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    readOptionalString(): string | undefined {
        if (this.check('STRING')) return this.advance().value
        return undefined
    }

    readString(): string {
        if (this.check('STRING')) return this.advance().value
        this.addError(`Expected string, got ${this.peekType()} '${this.peekValue()}'`, this.peek())
        return ''
    }

    readOptionalStringOrIdentifier(): string | undefined {
        if (this.check('STRING')) return this.advance().value
        if (this.check('IDENTIFIER')) return this.advance().value
        return undefined
    }

    buildTags(defaultTag1: string, defaultTag2: string, extraTags?: string): string[] {
        const tags = [defaultTag1, defaultTag2]
        if (extraTags) {
            for (const t of extraTags.split(',')) {
                const trimmed = t.trim()
                if (trimmed && !tags.includes(trimmed)) tags.push(trimmed)
            }
        }
        return tags
    }

    readStyleValue(): string | undefined {
        if (this.check('STRING')) return this.advance().value
        if (this.check('NUMBER')) return this.advance().value
        if (this.check('IDENTIFIER') || this.check('KEYWORD')) return this.advance().value
        return undefined
    }

    // ─── Main Parse ──────────────────────────────────────────────────

    parse(): ParseResult {
        const workspace = this.createEmptyWorkspace()

        this.skipNewlines()

        if (this.check('KEYWORD', 'workspace')) {
            this.advance()

            // Check for 'extends'
            if (this.check('KEYWORD', 'extends') || this.check('IDENTIFIER', 'extends')) {
                this.skipToNextLine()
                this.skipBraceBlock()
                return { workspace, errors: this.errors }
            }

            workspace.name = this.readOptionalString() || undefined
            workspace.description = this.readOptionalString() || undefined
            this.skipNewlines()

            if (this.match('LBRACE')) {
                this.parseWorkspaceBody(workspace)
                this.skipNewlines()
                this.match('RBRACE')
            }
        }

        return { workspace, errors: this.errors }
    }

    private createEmptyWorkspace(): Workspace {
        return {
            name: undefined,
            description: undefined,
            model: {
                people: [],
                softwareSystems: [],
                relationships: [],
                groups: [],
            },
            views: {
                systemLandscapeViews: [],
                systemContextViews: [],
                containerViews: [],
                componentViews: [],
                configuration: {
                    styles: { elements: [], relationships: [] },
                },
            },
        }
    }

    private parseWorkspaceBody(workspace: Workspace): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'model') {
                    this.advance()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        parseModelBody(this, workspace.model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                } else if (kw === 'views') {
                    this.advance()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        parseViewsBody(this, workspace.views, workspace.model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                } else if (token.value.startsWith('!')) {
                    // Preprocessor directive — consume keyword + inline args on this line
                    this.advance()
                    this.skipToNextLine()
                } else if (kw === 'configuration') {
                    this.advance()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseWorkspaceConfiguration(workspace)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                } else if (kw === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                } else {
                    // Unknown workspace-level keyword (e.g. branding, terminology, !identifiers).
                    // Consume keyword + any inline string args, then skip a brace block if present.
                    this.advance()
                    while (this.check('STRING') || this.check('IDENTIFIER') || this.check('NUMBER')) this.advance()
                    this.skipNewlines()
                    if (this.check('LBRACE')) this.skipBraceBlock()
                }
            } else {
                this.advance()
            }
        }
    }

    private parseWorkspaceConfiguration(workspace: Workspace): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break
            const token = this.peek()
            // 'scope' is not a reserved keyword in the lexer, so it comes through as IDENTIFIER.
            if ((token.type === 'IDENTIFIER' || token.type === 'KEYWORD') && token.value.toLowerCase() === 'scope') {
                this.advance()
                const val = this.peek()
                if (val.type === 'IDENTIFIER' || val.type === 'KEYWORD') {
                    this.advance()
                    const s = val.value.toLowerCase()
                    if (s === 'softwaresystem') workspace.scope = 'softwaresystem'
                    else if (s === 'landscape') workspace.scope = 'landscape'
                    else if (s === 'none') workspace.scope = 'none'
                    else {
                        this.addError(`Unknown scope value '${val.value}' — expected 'softwareSystem', 'landscape', or 'none'`, val)
                        workspace.scope = 'none'
                    }
                }
            } else {
                this.advance()
                // Unknown configuration properties may have a nested brace block (e.g. users { ... })
                // Stop before LBRACE so inline `{` is not consumed by the line-skip.
                this.skipUnknownDirective()
            }
        }
    }

}

// ─── Public API ─────────────────────────────────────────────────────

export function parse(input: string): ParseResult {
    globalIdCounter = 0 // Reset per parse call to avoid growing IDs across invocations
    const lexResult = lex(input)
    const parser = new ContextAwareParser(lexResult.tokens)
    const result = parser.parse()

    // Combine lexer and parser errors
    const errors = [...lexResult.errors, ...result.errors]

    // Post-process: populate view.relationships from model relationships.
    // The DSL doesn't store relationship refs in views — Structurizr infers them.
    // We do the same: for each view, include any model relationship whose source
    // AND destination are both present in that view's element set.
    const ws = result.workspace
    const allViews = [
        ...ws.views.systemLandscapeViews,
        ...ws.views.systemContextViews,
        ...ws.views.containerViews,
        ...ws.views.componentViews,
    ]
    for (const view of allViews) {
        const excluded = parser.getExcludedIdsForView(view)
        const hasWildcard = view.elements.some(e => e.id === '*')
        if (hasWildcard) {
            // Expand `include *` to all elements appropriate for this view type
            let expanded = expandWildcard(ws.model, view)
            // Apply `exclude` directives after wildcard expansion
            if (excluded.size > 0) {
                expanded = expanded.filter(e => !excluded.has(e.id))
            }
            view.elements = expanded
            // Wildcard views include all relationships between expanded elements
            const expandedIds = new Set(expanded.map(e => e.id))
            view.relationships = ws.model.relationships
                .filter(r => expandedIds.has(r.sourceId) && expandedIds.has(r.destinationId))
                .map(r => ({ id: r.id }))
        } else {
            // Apply `exclude` directives and deduplicate for explicit includes
            let elements = view.elements
            if (excluded.size > 0) {
                elements = elements.filter(e => !excluded.has(e.id))
            }
            // Deduplicate: DSL may include the same element twice (e.g. two separate `include alice` lines)
            const seen = new Set<string>()
            elements = elements.filter(e => {
                if (seen.has(e.id)) return false
                seen.add(e.id)
                return true
            })
            view.elements = elements
            const elementIds = seen
            view.relationships = ws.model.relationships
                .filter(r => elementIds.has(r.sourceId) && elementIds.has(r.destinationId))
                .map(r => ({ id: r.id }))
        }
    }

    return {
        workspace: ws,
        errors,
    }
}
