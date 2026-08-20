// Structurizr DSL Parser — converts a token stream into a Workspace model.
// Produces meaningful errors with line/column positions.

import type {
    Workspace,
    Model,
    View,
    ElementInView,
} from '@/types/model'
import { expandDeploymentElements } from '@/lib/deployment'
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

/**
 * Store a parsed user property. defineProperty, not assignment: a
 * "__proto__" key would otherwise set the object's prototype instead of
 * storing the property. Every properties-block parser must use this.
 */
export function setUserProperty(props: Record<string, string>, key: string, value: string): void {
    Object.defineProperty(props, key, { value, enumerable: true, writable: true, configurable: true })
}

export class ContextAwareParser {
    tokens: Token[]
    pos = 0
    errors: ParseError[] = []
    depth = 0

    // Variable name <-> element id mappings
    varToId = new Map<string, string>()
    nameToId = new Map<string, string>()
    elementsById = new Map<string, { name: string; type: string }>()
    // Qualified (hierarchical) paths — `mpng.gatewayApi`,
    // `pathways.navigatorApi.jwksController` — to element id.
    qualifiedToId = new Map<string, string>()

    // Every id handed out so far. The same variable name may legally appear in
    // several scopes when identifiers are hierarchical, so ids need dedup.
    usedIds = new Set<string>()

    /** Set by `!identifiers hierarchical`. Refs are resolved qualified-first
     *  either way; the flag records the DSL's declared intent. */
    hierarchicalIdentifiers = false

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

    /**
     * Pick a unique element id for a declaration. The DSL variable name is used
     * verbatim when it's still free, so ids survive a serialize → parse
     * roundtrip. When the same variable name is reused in another scope (legal
     * with hierarchical identifiers — `ctk.gatewayApi` and `mpng.gatewayApi`
     * both declare `gatewayApi`), fall back to the qualified path with dots
     * replaced by underscores so the id stays a valid DSL identifier.
     */
    allocateId(varName: string | undefined, parentPath?: string): string {
        if (!varName) {
            let generated = nextId()
            while (this.usedIds.has(generated)) generated = nextId()
            this.usedIds.add(generated)
            return generated
        }
        if (!this.usedIds.has(varName)) {
            this.usedIds.add(varName)
            return varName
        }
        const base = (parentPath ? `${parentPath}.${varName}` : varName).replace(/\./g, '_')
        let candidate = base
        let suffix = 2
        while (this.usedIds.has(candidate)) candidate = `${base}_${suffix++}`
        this.usedIds.add(candidate)
        return candidate
    }

    /**
     * Record an element under every name it can be referenced by, and return
     * its own qualified path so children can build theirs.
     *
     * `parentPath` is the qualified path of the enclosing element (undefined at
     * the top level). A container inside `mpng` is registered as both the bare
     * `gatewayApi` and the qualified `mpng.gatewayApi`; bare names are ambiguous
     * across scopes, which is why resolveRef() prefers the qualified match.
     */
    registerElement(id: string, name: string, _type: string, varName?: string, parentPath?: string): string {
        this.elementsById.set(id, { name, type: _type })
        this.nameToId.set(name, id)
        if (varName) {
            this.varToId.set(varName, id)
        }
        const segment = varName ?? name
        const path = parentPath ? `${parentPath}.${segment}` : segment
        if (parentPath) {
            this.qualifiedToId.set(path, id)
            // Nested elements may also be referenced by display name
            // (`mpng.Sequencer API`) when they have no variable name.
            const namePath = `${parentPath}.${name}`
            if (!this.qualifiedToId.has(namePath)) this.qualifiedToId.set(namePath, id)
        }
        return path
    }

    /** Register a deployment-family element (environment, node, instance).
     *  Unlike registerElement this never maps the display name, because
     *  deployment names routinely duplicate model element names (an instance
     *  shares its container's name) and must not shadow them in resolveRef. */
    registerDeploymentElement(id: string, name: string, _type: string, varName?: string): void {
        this.elementsById.set(id, { name, type: _type })
        if (varName) {
            this.varToId.set(varName, id)
        }
    }

    resolveRef(ref: string): string | undefined {
        // Qualified paths win: the same bare variable name may be declared in
        // several scopes, in which case varToId only remembers the last one.
        const qualified = this.qualifiedToId.get(ref)
        if (qualified !== undefined) return qualified
        if (this.varToId.has(ref)) return this.varToId.get(ref)
        if (this.nameToId.has(ref)) return this.nameToId.get(ref)
        if (this.elementsById.has(ref)) return ref
        return undefined
    }

    /** Record the effect of a preprocessor directive. The lexer folds the whole
     *  line into the keyword's value, so `!identifiers hierarchical` arrives as
     *  a single token. c4hero always registers bare *and* qualified names, so
     *  the flag only records intent — resolution prefers qualified regardless. */
    noteDirective(value: string): void {
        if (/^!identifiers\b/.test(value) && /\bhierarchical\b/.test(value)) {
            this.hierarchicalIdentifiers = true
        }
    }

    // ─── Qualified (hierarchical) references ─────────────────────────

    /** True when the token at `index` can be a segment of a qualified path.
     *  Keywords are allowed because element variables may be named after them
     *  (`spine.status`, `atk.default`). */
    private isRefSegment(index: number): boolean {
        const t = this.tokens[index]
        return t !== undefined && (t.type === 'IDENTIFIER' || t.type === 'KEYWORD')
    }

    /** True when `DOT IDENT` at `dotIndex` is the head of a Structurizr
     *  expression (`element.type==X`, `element.parent==Y`) rather than a
     *  qualified path segment. */
    private isExpressionTail(dotIndex: number): boolean {
        return this.tokens[dotIndex + 2]?.type === 'EQUALS' && this.tokens[dotIndex + 3]?.type === 'EQUALS'
    }

    /**
     * Consume an element reference — `IDENT (DOT IDENT)*` — and return the
     * joined path plus the token it starts at (for error positions).
     * Returns null when the current token cannot start a reference.
     *
     * `element.type==` / `element.parent==` expressions are left alone: the
     * `==` lookahead stops the join, so `include` / `exclude` still hand those
     * to the expression parser.
     */
    readQualifiedRef(options?: { allowString?: boolean }): { ref: string; token: Token } | null {
        const start = this.peek()
        const startsRef =
            start.type === 'IDENTIFIER' ||
            start.type === 'KEYWORD' ||
            (options?.allowString === true && start.type === 'STRING')
        if (!startsRef) return null
        this.advance()
        let ref = start.value
        while (this.check('DOT') && this.isRefSegment(this.pos + 1) && !this.isExpressionTail(this.pos)) {
            this.advance() // consume DOT
            ref += '.' + this.advance().value
        }
        return { ref, token: start }
    }

    /** True when the statement at the current position is a relationship —
     *  `ref (.ref)* ->`. Needed because a dotted source puts a DOT, not an
     *  ARROW, immediately after the first identifier. Newlines before the arrow
     *  are tolerated, as they were before qualified refs existed. */
    looksLikeRelationship(): boolean {
        if (!this.isRefSegment(this.pos)) return false
        let i = this.pos + 1
        while (this.tokens[i]?.type === 'DOT' && this.isRefSegment(i + 1)) i += 2
        while (this.tokens[i]?.type === 'NEWLINE' || this.tokens[i]?.type === 'COMMENT') i++
        return this.tokens[i]?.type === 'ARROW'
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
                deploymentEnvironments: [],
            },
            views: {
                systemLandscapeViews: [],
                systemContextViews: [],
                containerViews: [],
                componentViews: [],
                dynamicViews: [],
                deploymentViews: [],
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
                    this.noteDirective(token.value)
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

    // Implied instance relationships are NOT materialized here — the canvas
    // derives them per deployment view via deriveInstanceRelationships(), so
    // the model only ever holds relationships the user authored.
    const ws = result.workspace

    // Post-process: populate view.relationships from model relationships.
    // The DSL doesn't store relationship refs in views — Structurizr infers them.
    // We do the same: for each view, include any model relationship whose source
    // AND destination are both present in that view's element set.
    // Dynamic views are excluded: their relationship list is an explicit,
    // ordered interaction sequence built during parsing.
    const allViews = [
        ...ws.views.systemLandscapeViews,
        ...ws.views.systemContextViews,
        ...ws.views.containerViews,
        ...ws.views.componentViews,
        ...ws.views.deploymentViews,
    ]
    for (const view of allViews) {
        const excluded = parser.getExcludedIdsForView(view)
        const hasWildcard = view.elements.some(e => e.id === '*')
        if (hasWildcard) {
            // Expand `include *` to all elements appropriate for this view type
            let expanded = view.type === 'deployment'
                ? expandDeploymentElements(ws.model, view.environment, view.softwareSystemId)
                : expandWildcard(ws.model, view)
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
