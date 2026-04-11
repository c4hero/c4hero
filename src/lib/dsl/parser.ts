// Structurizr DSL Parser — converts a token stream into a Workspace model.
// Produces meaningful errors with line/column positions.

import type {
    Workspace,
    Model,
    Group,
    Person,
    SoftwareSystem,
    Container,
    Component,
    Relationship,
    InteractionStyle,
    View,
    ViewType,
    AutoLayout,
    LayoutDirection,
    ElementStyle,
    RelationshipStyle,
    ViewConfiguration,
    ElementInView,
    LineStyle,
} from '@/types/model'
import { lex } from './lexer'
import type { Token, TokenType } from './lexer'

/**
 * Expand an `include *` wildcard into the actual elements appropriate for the view type.
 * Structurizr semantics: landscape/context = people + systems; container = people + systems + containers
 * of the scoped system; component = people + systems + containers + components of the scoped container.
 */
function expandWildcard(model: Model, view: View): ElementInView[] {
    const ids: string[] = []

    const addId = (id: string) => { if (!ids.includes(id)) ids.push(id) }

    if (view.type === 'systemLandscape') {
        // Landscape: show everything — all people and software systems
        for (const p of model.people) addId(p.id)
        for (const s of model.softwareSystems) addId(s.id)
    } else if (view.type === 'systemContext' && view.softwareSystemId) {
        // System context: the scoped system + all elements directly connected to it.
        // Mirrors the Structurizr spec and the store's addView logic for systemContext.
        const scopeId = view.softwareSystemId
        addId(scopeId)
        const connectedIds = new Set<string>()
        for (const rel of model.relationships) {
            if (rel.sourceId === scopeId) connectedIds.add(rel.destinationId)
            if (rel.destinationId === scopeId) connectedIds.add(rel.sourceId)
        }
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

function nextId(): string {
    globalIdCounter++
    return `p${globalIdCounter}`
}

// ─── Parser Implementation ──────────────────────────────────────────

const MAX_DEPTH = 50

class ContextAwareParser {
    private tokens: Token[]
    private pos = 0
    private errors: ParseError[] = []
    private depth = 0

    // Variable name <-> element id mappings
    private varToId = new Map<string, string>()
    private nameToId = new Map<string, string>()
    private elementsById = new Map<string, { name: string; type: string }>()

    private relCounter = 0

    // Track elements excluded per view (used in post-processing to apply `exclude` directives)
    private viewExcludedIds = new Map<View, Set<string>>()

    getExcludedIdsForView(view: View): Set<string> {
        return this.viewExcludedIds.get(view) ?? new Set()
    }

    constructor(tokens: Token[]) {
        this.tokens = tokens
    }

    // ─── Token Navigation ────────────────────────────────────────────

    private peek(): Token {
        return this.tokens[this.pos]
    }

    private peekType(): TokenType {
        return this.tokens[this.pos].type
    }

    private peekValue(): string {
        return this.tokens[this.pos].value
    }

    private advance(): Token {
        const token = this.tokens[this.pos]
        this.pos++
        return token
    }

    private expect(type: TokenType, expectedValue?: string): Token {
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

    private match(type: TokenType, value?: string): boolean {
        const token = this.peek()
        if (token.type === type && (value === undefined || token.value === value)) {
            this.advance()
            return true
        }
        return false
    }

    private check(type: TokenType, value?: string): boolean {
        const token = this.peek()
        return token.type === type && (value === undefined || token.value === value)
    }

    private skipNewlines(): void {
        while (this.peekType() === 'NEWLINE' || this.peekType() === 'COMMENT') {
            this.advance()
        }
    }

    private skipToNextLine(): void {
        while (this.peekType() !== 'NEWLINE' && this.peekType() !== 'EOF') {
            this.advance()
        }
        if (this.peekType() === 'NEWLINE') {
            this.advance()
        }
    }

    private addError(message: string, token: Token): void {
        this.errors.push({ message, line: token.line, column: token.column })
    }

    private skipBraceBlock(): void {
        if (!this.match('LBRACE')) return
        let depth = 1
        while (depth > 0 && this.peekType() !== 'EOF') {
            if (this.peekType() === 'LBRACE') depth++
            if (this.peekType() === 'RBRACE') depth--
            if (depth > 0) this.advance()
        }
        if (this.peekType() === 'RBRACE') this.advance()
    }

    // ─── Registration ────────────────────────────────────────────────

    private registerElement(id: string, name: string, _type: string, varName?: string): void {
        this.elementsById.set(id, { name, type: _type })
        this.nameToId.set(name, id)
        if (varName) {
            this.varToId.set(varName, id)
        }
    }

    private resolveRef(ref: string): string | undefined {
        if (this.varToId.has(ref)) return this.varToId.get(ref)
        if (this.nameToId.has(ref)) return this.nameToId.get(ref)
        if (this.elementsById.has(ref)) return ref
        return undefined
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private readOptionalString(): string | undefined {
        if (this.check('STRING')) return this.advance().value
        return undefined
    }

    private readString(): string {
        if (this.check('STRING')) return this.advance().value
        this.addError(`Expected string, got ${this.peekType()} '${this.peekValue()}'`, this.peek())
        return ''
    }

    private readOptionalStringOrIdentifier(): string | undefined {
        if (this.check('STRING')) return this.advance().value
        if (this.check('IDENTIFIER')) return this.advance().value
        return undefined
    }

    private buildTags(defaultTag1: string, defaultTag2: string, extraTags?: string): string[] {
        const tags = [defaultTag1, defaultTag2]
        if (extraTags) {
            for (const t of extraTags.split(',')) {
                const trimmed = t.trim()
                if (trimmed && !tags.includes(trimmed)) tags.push(trimmed)
            }
        }
        return tags
    }

    private readStyleValue(): string | undefined {
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

            workspace.name = this.readOptionalString()
            workspace.description = this.readOptionalString()
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
                        this.parseModelBody(workspace.model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                } else if (kw === 'views') {
                    this.advance()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseViewsBody(workspace.views)
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
                    else {
                        this.addError(`Unknown scope value '${val.value}' — expected 'softwareSystem' or 'landscape'`, val)
                        workspace.scope = 'none'
                    }
                }
            } else {
                this.advance()
                this.skipToNextLine()
                // Unknown configuration properties may have a nested brace block (e.g. users { ... })
                this.skipNewlines()
                if (this.check('LBRACE')) this.skipBraceBlock()
            }
        }
    }

    // ─── Model Parsing ──────────────────────────────────────────────

    private parseModelBody(model: Model, groupRefIds?: string[]): void {
        this.depth++
        if (this.depth > MAX_DEPTH) { this.addError('Maximum nesting depth exceeded', this.peek()); this.depth--; return }
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'KEYWORD' && token.value.startsWith('!')) {
                // Preprocessor directives (!include, !const, !var, !identifiers, !docs, !adrs).
                // c4hero doesn't evaluate them, but must consume the keyword plus any inline
                // arguments on the same line to avoid mis-parsing them as model elements.
                this.advance()
                this.skipToNextLine()
                continue
            }

            if (token.type === 'COMMENT') {
                this.advance()
                continue
            }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'enterprise') {
                    this.advance()
                    this.readOptionalString()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseModelBody(model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                    continue
                }

                if (kw === 'group') {
                    this.advance()
                    const groupName = this.readOptionalString() ?? `Group ${model.groups.length + 1}`
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        const memberRefs: string[] = []
                        const beforePeople = model.people.length
                        const beforeSystems = model.softwareSystems.length
                        this.parseModelBody(model, memberRefs)
                        this.skipNewlines()
                        this.expect('RBRACE')
                        const definedIds = [
                            ...model.people.slice(beforePeople).map(p => p.id),
                            ...model.softwareSystems.slice(beforeSystems).map(s => s.id),
                        ]
                        const allIds = [...new Set([...definedIds, ...memberRefs])]
                        if (allIds.length > 0) {
                            const group: Group = { id: nextId(), name: groupName, elementIds: allIds }
                            model.groups.push(group)
                        }
                    }
                    continue
                }

                if (kw === 'person') {
                    const person = this.parsePerson()
                    if (person) model.people.push(person)
                    continue
                }

                if (kw === 'softwaresystem') {
                    const sys = this.parseSoftwareSystem(undefined, model)
                    if (sys) model.softwareSystems.push(sys)
                    continue
                }

                if (kw === 'deploymentenvironment' || kw === 'deploymentnode') {
                    this.advance()
                    while (this.check('STRING') || this.check('IDENTIFIER')) this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }

                if (kw === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }

                this.advance()
                this.skipToNextLine()
                continue
            }

            if (token.type === 'IDENTIFIER') {
                const saved = this.pos
                this.advance()
                this.skipNewlines()

                if (this.check('EQUALS')) {
                    this.advance()
                    this.skipNewlines()
                    const varName = token.value

                    if (this.check('KEYWORD')) {
                        const elementKw = this.peekValue().toLowerCase()

                        if (elementKw === 'person') {
                            const person = this.parsePerson(varName)
                            if (person) model.people.push(person)
                        } else if (elementKw === 'softwaresystem') {
                            const sys = this.parseSoftwareSystem(varName, model)
                            if (sys) model.softwareSystems.push(sys)
                        } else {
                            this.skipToNextLine()
                        }
                    } else {
                        this.skipToNextLine()
                    }
                    continue
                }

                if (this.check('ARROW')) {
                    this.pos = saved
                    const rel = this.parseRelationship()
                    if (rel) model.relationships.push(rel)
                    continue
                }

                // Standalone identifier — if collecting group refs, resolve it
                if (groupRefIds !== undefined) {
                    const resolvedId = this.resolveRef(token.value)
                    if (resolvedId) groupRefIds.push(resolvedId)
                }
                this.pos = saved
                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
        this.depth--
    }

    // ─── Element Parsing ────────────────────────────────────────────

    private parsePerson(varName?: string): Person | null {
        this.advance() // consume 'person'
        const name = this.readString()
        const description = this.readOptionalString()
        const tagsStr = this.readOptionalString()

        const id = varName ?? nextId()
        const person: Person = {
            id,
            type: 'person',
            name,
            description,
            tags: this.buildTags('Element', 'Person', tagsStr),
            properties: {},
        }

        this.registerElement(id, name, 'person', varName)

        this.skipNewlines()
        if (this.check('LBRACE')) {
            this.advance()
            this.parseSimpleElementBlock(person)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return person
    }

    private parseSoftwareSystem(varName?: string, model?: Model): SoftwareSystem | null {
        this.advance() // consume 'softwareSystem'
        const name = this.readString()
        const description = this.readOptionalString()
        const tagsStr = this.readOptionalString()

        const id = varName ?? nextId()
        const sys: SoftwareSystem = {
            id,
            type: 'softwareSystem',
            name,
            description,
            tags: this.buildTags('Element', 'Software System', tagsStr),
            properties: {},
            containers: [],
        }

        this.registerElement(id, name, 'softwareSystem', varName)

        this.skipNewlines()
        if (this.check('LBRACE')) {
            this.advance()
            this.parseSoftwareSystemBody(sys, model)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return sys
    }

    private parseSoftwareSystemBody(sys: SoftwareSystem, model?: Model): void {
        this.depth++
        if (this.depth > MAX_DEPTH) { this.addError('Maximum nesting depth exceeded', this.peek()); this.depth--; return }
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }
            if (token.type === 'KEYWORD' && token.value.startsWith('!')) { this.advance(); this.skipToNextLine(); continue }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'group') {
                    this.advance()
                    this.readOptionalString()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseSoftwareSystemBody(sys, model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                    continue
                }

                if (kw === 'container') {
                    const container = this.parseContainer(undefined, model)
                    if (container) sys.containers.push(container)
                    continue
                }

                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'location' || kw === 'status' || kw === 'owner') {
                    this.parseElementPropertyOnElement(sys, kw)
                    continue
                }

                this.advance()
                this.skipToNextLine()
                continue
            }

            if (token.type === 'IDENTIFIER') {
                const saved = this.pos
                this.advance()
                this.skipNewlines()

                if (this.check('EQUALS')) {
                    this.advance()
                    this.skipNewlines()
                    const vn = token.value

                    if (this.check('KEYWORD')) {
                        const ekw = this.peekValue().toLowerCase()
                        if (ekw === 'container') {
                            const container = this.parseContainer(vn, model)
                            if (container) sys.containers.push(container)
                        } else {
                            this.skipToNextLine()
                        }
                    } else {
                        this.skipToNextLine()
                    }
                    continue
                }

                if (this.check('ARROW')) {
                    this.pos = saved
                    if (model) {
                        const rel = this.parseRelationship()
                        if (rel) model.relationships.push(rel)
                    } else {
                        this.skipToNextLine()
                    }
                    continue
                }

                this.pos = saved
                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
        this.depth--
    }

    private parseContainer(varName?: string, model?: Model): Container | null {
        this.advance() // consume 'container'
        const name = this.readString()
        const description = this.readOptionalString()
        const technology = this.readOptionalString()
        const tagsStr = this.readOptionalString()

        const id = varName ?? nextId()
        const container: Container = {
            id,
            type: 'container',
            name,
            description,
            technology,
            tags: this.buildTags('Element', 'Container', tagsStr),
            properties: {},
            components: [],
        }

        this.registerElement(id, name, 'container', varName)

        this.skipNewlines()
        if (this.check('LBRACE')) {
            this.advance()
            this.parseContainerBody(container, model)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return container
    }

    private parseContainerBody(container: Container, model?: Model): void {
        this.depth++
        if (this.depth > MAX_DEPTH) { this.addError('Maximum nesting depth exceeded', this.peek()); this.depth--; return }
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }
            if (token.type === 'KEYWORD' && token.value.startsWith('!')) { this.advance(); this.skipToNextLine(); continue }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'group') {
                    this.advance()
                    this.readOptionalString()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseContainerBody(container, model)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                    continue
                }

                if (kw === 'component') {
                    const comp = this.parseComponent()
                    if (comp) container.components.push(comp)
                    continue
                }

                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'status' || kw === 'owner') {
                    this.parseElementPropertyOnElement(container, kw)
                    continue
                }

                this.advance()
                this.skipToNextLine()
                continue
            }

            if (token.type === 'IDENTIFIER') {
                const saved = this.pos
                this.advance()
                this.skipNewlines()

                if (this.check('EQUALS')) {
                    this.advance()
                    this.skipNewlines()
                    const vn = token.value

                    if (this.check('KEYWORD') && this.peekValue().toLowerCase() === 'component') {
                        const comp = this.parseComponent(vn)
                        if (comp) container.components.push(comp)
                    } else {
                        this.skipToNextLine()
                    }
                    continue
                }

                if (this.check('ARROW')) {
                    this.pos = saved
                    if (model) {
                        const rel = this.parseRelationship()
                        if (rel) model.relationships.push(rel)
                    } else {
                        this.skipToNextLine()
                    }
                    continue
                }

                this.pos = saved
                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
        this.depth--
    }

    private parseComponent(varName?: string): Component | null {
        this.advance() // consume 'component'
        const name = this.readString()
        const description = this.readOptionalString()
        const technology = this.readOptionalString()
        const tagsStr = this.readOptionalString()

        const id = varName ?? nextId()
        const component: Component = {
            id,
            type: 'component',
            name,
            description,
            technology,
            tags: this.buildTags('Element', 'Component', tagsStr),
            properties: {},
        }

        this.registerElement(id, name, 'component', varName)

        this.skipNewlines()
        if (this.check('LBRACE')) {
            this.advance()
            this.parseSimpleElementBlock(component)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return component
    }

    private parseSimpleElementBlock(element: Person | Component): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()
            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD' && token.value.startsWith('!')) {
                this.advance()
                this.skipToNextLine()
                continue
            }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()
                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'location' || kw === 'status' || kw === 'owner') {
                    this.parseElementPropertyOnElement(element, kw)
                    continue
                }
                // Unknown keyword: consume it and skip any brace block so the outer
                // RBRACE isn't mistakenly consumed as the inner block's closing brace.
                this.advance()
                this.skipToNextLine()
                this.skipNewlines()
                if (this.check('LBRACE')) this.skipBraceBlock()
                continue
            }

            this.advance()
        }
    }

    private parseElementPropertyOnElement(element: Person | SoftwareSystem | Container | Component, keyword: string): void {
        this.advance()

        if (keyword === 'tags') {
            while (this.check('STRING') || this.check('IDENTIFIER')) {
                const tagVal = this.advance().value
                for (const t of tagVal.split(',')) {
                    const trimmed = t.trim()
                    if (trimmed && !element.tags.includes(trimmed)) {
                        element.tags.push(trimmed)
                    }
                }
            }
        } else if (keyword === 'description') {
            const val = this.readOptionalString()
            if (val !== undefined) element.description = val
        } else if (keyword === 'technology') {
            const val = this.readOptionalString()
            if (val !== undefined && 'technology' in element) {
                (element as Container | Component).technology = val
            }
        } else if (keyword === 'url') {
            const val = this.readOptionalString()
            if (val !== undefined) element.url = val
        } else if (keyword === 'status') {
            const val = this.peek()
            if (val.type === 'IDENTIFIER' || val.type === 'KEYWORD' || val.type === 'STRING') {
                const s = this.advance().value
                if (s === 'Live' || s === 'Planned' || s === 'Deprecated' || s === 'Removed') {
                    element.status = s
                }
            }
        } else if (keyword === 'owner') {
            const val = this.readOptionalString()
            if (val !== undefined) element.owner = val
        } else if (keyword === 'location') {
            const val = this.peek()
            if (val.type === 'IDENTIFIER' || val.type === 'KEYWORD') {
                const loc = this.advance().value
                if (element.type === 'person' || element.type === 'softwareSystem') {
                    if (loc === 'External') (element as Person | SoftwareSystem).location = 'External'
                    else if (loc === 'Internal') (element as Person | SoftwareSystem).location = 'Internal'
                }
            }
        } else if (keyword === 'properties') {
            this.skipNewlines()
            if (this.match('LBRACE')) {
                this.parsePropertiesBlock(element)
                this.skipNewlines()
                this.expect('RBRACE')
            }
        } else if (keyword === 'perspectives') {
            this.skipNewlines()
            this.skipBraceBlock()
        }
    }

    /** Parse a `properties { "key" "value" ... }` block and attach known
     *  keys to the element. Recognizes `c4hero.location` for Person/SoftwareSystem. */
    private parsePropertiesBlock(element: Person | SoftwareSystem | Container | Component): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break
            const token = this.peek()
            if (token.type === 'COMMENT') { this.advance(); continue }
            if (token.type !== 'STRING' && token.type !== 'IDENTIFIER') { this.advance(); continue }
            const key = this.advance().value
            const valTok = this.peek()
            let val: string | undefined
            if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                val = this.advance().value
            }
            if (val === undefined) continue
            // Recognized: c4hero.location → element.location for persons/systems
            if (key === 'c4hero.location' && (element.type === 'person' || element.type === 'softwareSystem')) {
                if (val === 'External') (element as Person | SoftwareSystem).location = 'External'
                else if (val === 'Internal') (element as Person | SoftwareSystem).location = 'Internal'
            } else {
                // Generic passthrough to properties map
                element.properties[key] = val
            }
        }
    }

    // ─── Relationships ──────────────────────────────────────────────

    private parseRelationship(): Relationship | null {
        const sourceToken = this.advance()
        this.expect('ARROW')

        const destToken = this.peek()
        let destRef: string
        if (destToken.type === 'IDENTIFIER' || destToken.type === 'KEYWORD') {
            destRef = this.advance().value
        } else {
            this.addError(`Expected relationship destination, got ${destToken.type}`, destToken)
            this.skipToNextLine()
            return null
        }

        const description = this.readOptionalString()
        const technology = this.readOptionalString()
        const tagsStr = this.readOptionalString()

        const sourceId = this.resolveRef(sourceToken.value)
        const destId = this.resolveRef(destRef)

        if (!sourceId) {
            this.addError(`Unresolved reference: '${sourceToken.value}'`, sourceToken)
        }
        if (!destId) {
            this.addError(`Unresolved reference: '${destRef}'`, destToken)
        }

        this.relCounter++
        // Always seed with the built-in 'Relationship' tag — matches addRelationship() in the store.
        // The serializer strips this tag before emitting (it's implicit), so after a roundtrip the
        // parser must add it back, otherwise parsed relationships lose the tag entirely.
        const initialTags = ['Relationship']
        if (tagsStr) {
            for (const t of tagsStr.split(',')) {
                const trimmed = t.trim()
                if (trimmed && !initialTags.includes(trimmed)) initialTags.push(trimmed)
            }
        }
        const rel: Relationship = {
            id: `rel-${this.relCounter}`,
            sourceId: sourceId ?? sourceToken.value,
            destinationId: destId ?? destRef,
            description,
            technology,
            tags: initialTags,
            properties: {},
        }

        this.skipNewlines()
        if (this.check('LBRACE')) {
            this.advance()
            // Parse relationship block
            while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
                this.skipNewlines()
                if (this.check('RBRACE') || this.peekType() === 'EOF') break

                if (this.peekType() === 'COMMENT') { this.advance(); continue }
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'tags') {
                    this.advance()
                    while (this.check('STRING') || this.check('IDENTIFIER')) {
                        const tagVal = this.advance().value
                        for (const t of tagVal.split(',')) {
                            const trimmed = t.trim()
                            // Deduplicate: don't re-add tags already in the list
                            if (trimmed && !rel.tags.includes(trimmed)) rel.tags.push(trimmed)
                        }
                    }
                    continue
                }
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    if (this.check('LBRACE')) {
                        this.advance()
                        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
                            this.skipNewlines()
                            if (this.check('RBRACE') || this.peekType() === 'EOF') break
                            if (this.peekType() === 'COMMENT') { this.advance(); continue }
                            if (this.peek().type !== 'STRING' && this.peek().type !== 'IDENTIFIER') { this.advance(); continue }
                            const key = this.advance().value
                            const valTok = this.peek()
                            if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                                rel.properties[key] = this.advance().value
                            }
                        }
                        if (this.check('RBRACE')) this.advance()
                    }
                    continue
                }
                // 'interactionStyle' is not a reserved keyword so it arrives as IDENTIFIER
                if ((this.peekType() === 'IDENTIFIER' || this.peekType() === 'KEYWORD') &&
                    this.peekValue().toLowerCase() === 'interactionstyle') {
                    this.advance()
                    const valTok = this.peek()
                    if (valTok.type === 'IDENTIFIER' || valTok.type === 'KEYWORD') {
                        const raw = this.advance().value
                        if (raw === 'Synchronous' || raw === 'Asynchronous') {
                            rel.interactionStyle = raw as InteractionStyle
                        }
                    }
                    continue
                }
                // 'description' in relationship body (Structurizr keyword form)
                // Prefer the block keyword over any inline positional description already read.
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'description') {
                    this.advance()
                    const val = this.readOptionalString()
                    if (val !== undefined) rel.description = val
                    continue
                }
                // 'technology' in relationship body (Structurizr keyword form)
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'technology') {
                    this.advance()
                    const val = this.readOptionalString()
                    if (val !== undefined) rel.technology = val
                    continue
                }
                // 'url' in relationship body
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'url') {
                    this.advance()
                    if (this.peekType() === 'STRING') rel.url = this.advance().value
                    continue
                }
                // 'lineStyle' in relationship body (Curved | Straight | Orthogonal)
                if ((this.peekType() === 'IDENTIFIER' || this.peekType() === 'KEYWORD') &&
                    this.peekValue().toLowerCase() === 'linestyle') {
                    this.advance()
                    const valTok = this.peek()
                    if (valTok.type === 'IDENTIFIER' || valTok.type === 'KEYWORD') {
                        const raw = this.advance().value
                        if (raw === 'Curved' || raw === 'Straight' || raw === 'Orthogonal') {
                            rel.lineStyle = raw as LineStyle
                        }
                    }
                    continue
                }
                this.advance()
            }
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return rel
    }

    // ─── Views ──────────────────────────────────────────────────────

    private parseViewsBody(views: Workspace['views']): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'systemlandscape') {
                    const view = this.parseSystemLandscapeView()
                    if (view) views.systemLandscapeViews.push(view)
                    continue
                }
                if (kw === 'systemcontext') {
                    const view = this.parseElementView('systemContext')
                    if (view) views.systemContextViews.push(view)
                    continue
                }
                if (kw === 'container') {
                    const view = this.parseElementView('container')
                    if (view) views.containerViews.push(view)
                    continue
                }
                if (kw === 'component') {
                    const view = this.parseElementView('component')
                    if (view) views.componentViews.push(view)
                    continue
                }
                if (kw === 'styles') {
                    this.advance()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseStylesBody(views.configuration)
                        this.skipNewlines()
                        this.expect('RBRACE')
                    }
                    continue
                }
                if (kw === 'theme' || kw === 'themes') {
                    this.advance()
                    const themes: string[] = []
                    while (this.check('STRING') || this.check('IDENTIFIER')) {
                        themes.push(this.advance().value)
                    }
                    views.configuration.themes = themes
                    continue
                }
                if (kw === 'dynamic' || kw === 'deployment' || kw === 'filtered' || kw === 'custom') {
                    this.advance()
                    while (this.check('STRING') || this.check('IDENTIFIER')) this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }
                if (kw === 'branding' || kw === 'terminology' || kw === 'configuration' || kw === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }
                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
    }

    private parseSystemLandscapeView(): View | null {
        this.advance() // consume 'systemLandscape'
        const key = this.readOptionalStringOrIdentifier() ?? ''
        const title = this.readOptionalString()

        const view: View = {
            type: 'systemLandscape',
            key,
            title,
            elements: [],
            relationships: [],
        }

        this.skipNewlines()
        if (this.match('LBRACE')) {
            this.parseViewBody(view)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return view
    }

    private parseElementView(type: ViewType): View | null {
        this.advance() // consume keyword

        const elementRef = this.readOptionalStringOrIdentifier()
        const key = this.readOptionalStringOrIdentifier() ?? ''
        const title = this.readOptionalString()

        const view: View = {
            type,
            key,
            title,
            elements: [],
            relationships: [],
        }

        if (elementRef) {
            const resolvedId = this.resolveRef(elementRef)
            if (type === 'systemContext' || type === 'container') {
                view.softwareSystemId = resolvedId ?? elementRef
            } else if (type === 'component') {
                view.containerId = resolvedId ?? elementRef
            }
        }

        this.skipNewlines()
        if (this.match('LBRACE')) {
            this.parseViewBody(view)
            this.skipNewlines()
            this.expect('RBRACE')
        }

        return view
    }

    private parseViewBody(view: View): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'include') {
                    this.advance()
                    if (this.match('STAR')) {
                        view.elements.push({ id: '*' })
                    } else {
                        while (this.check('IDENTIFIER') || this.check('STRING') || this.check('KEYWORD')) {
                            const ref = this.advance().value
                            const resolvedId = this.resolveRef(ref)
                            view.elements.push({ id: resolvedId ?? ref })
                        }
                    }
                    continue
                }

                if (kw === 'exclude') {
                    this.advance()
                    const excluded = this.viewExcludedIds.get(view) ?? new Set<string>()
                    while (this.check('STAR') || this.check('IDENTIFIER') || this.check('STRING') || this.check('KEYWORD')) {
                        const ref = this.advance().value
                        const resolvedId = this.resolveRef(ref)
                        excluded.add(resolvedId ?? ref)
                    }
                    this.viewExcludedIds.set(view, excluded)
                    continue
                }

                if (kw === 'autolayout') {
                    this.advance()
                    const layout: AutoLayout = { direction: 'TB' }
                    if (this.check('IDENTIFIER') || this.check('KEYWORD')) {
                        const dir = this.peekValue().toUpperCase()
                        if (dir === 'TB' || dir === 'BT' || dir === 'LR' || dir === 'RL') {
                            layout.direction = dir as LayoutDirection
                            this.advance()
                        }
                    }
                    if (this.check('NUMBER')) {
                        layout.rankSeparation = parseInt(this.advance().value, 10)
                    }
                    if (this.check('NUMBER')) {
                        layout.nodeSeparation = parseInt(this.advance().value, 10)
                    }
                    view.autoLayout = layout
                    continue
                }

                if (kw === 'animation') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }

                if (kw === 'title') {
                    this.advance()
                    view.title = this.readOptionalString()
                    continue
                }

                if (kw === 'description') {
                    this.advance()
                    view.description = this.readOptionalString()
                    continue
                }

                if (kw === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                    continue
                }

                if (kw === 'default') {
                    this.advance()
                    continue
                }

                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
    }

    // ─── Styles ─────────────────────────────────────────────────────

    private parseStylesBody(config: ViewConfiguration): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()
            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()

                if (kw === 'element') {
                    this.advance()
                    const style = this.parseElementStyleBlock()
                    if (style) config.styles.elements.push(style)
                    continue
                }

                if (kw === 'relationship') {
                    this.advance()
                    const style = this.parseRelationshipStyleBlock()
                    if (style) config.styles.relationships.push(style)
                    continue
                }
            }

            this.advance()
        }
    }

    private parseElementStyleBlock(): ElementStyle | null {
        const tag = this.readString()
        const style: ElementStyle = { tag }

        this.skipNewlines()
        if (!this.match('LBRACE')) return style

        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()
            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
                const prop = this.advance().value.toLowerCase()
                this.applyStyleProperty(style, prop)
                continue
            }

            this.advance()
        }

        this.skipNewlines()
        this.expect('RBRACE')

        return style
    }

    private parseRelationshipStyleBlock(): RelationshipStyle | null {
        const tag = this.readString()
        const style: RelationshipStyle = { tag }

        this.skipNewlines()
        if (!this.match('LBRACE')) return style

        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()
            if (token.type === 'COMMENT') { this.advance(); continue }

            if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
                const prop = this.advance().value.toLowerCase()
                this.applyRelStyleProperty(style, prop)
                continue
            }

            this.advance()
        }

        this.skipNewlines()
        this.expect('RBRACE')

        return style
    }

    private applyStyleProperty(style: ElementStyle, prop: string): void {
        const val = this.readStyleValue()
        if (val === undefined) return

        switch (prop) {
            case 'background': style.background = val; break
            case 'color': case 'colour': style.color = val; break
            case 'shape': style.shape = val; break
            case 'fontsize': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.fontSize = n
                break
            }
            case 'border': style.border = val; break
            case 'opacity': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.opacity = n
                break
            }
            case 'icon': style.icon = val; break
            case 'stroke': style.stroke = val; break
            case 'strokewidth': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.strokeWidth = n
                break
            }
            // Silently consume unknown properties
        }
    }

    private applyRelStyleProperty(style: RelationshipStyle, prop: string): void {
        const val = this.readStyleValue()
        if (val === undefined) return

        switch (prop) {
            case 'color': case 'colour': style.color = val; break
            case 'thickness': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.thickness = n
                break
            }
            case 'dashed': style.dashed = val.toLowerCase() === 'true'; break
            case 'fontsize': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.fontSize = n
                break
            }
            case 'opacity': {
                const n = parseInt(val, 10)
                if (!isNaN(n)) style.opacity = n
                break
            }
            // Silently consume unknown properties
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
            // Apply `exclude` directives for explicit includes
            let elements = view.elements
            if (excluded.size > 0) {
                elements = elements.filter(e => !excluded.has(e.id))
                view.elements = elements
            }
            const elementIds = new Set(elements.map(e => e.id))
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
