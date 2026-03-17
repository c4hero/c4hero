// Structurizr DSL Parser — converts a token stream into a Workspace model.
// Produces meaningful errors with line/column positions.

import type {
    Workspace,
    Model,
    Person,
    SoftwareSystem,
    Container,
    Component,
    Relationship,
    View,
    ViewType,
    AutoLayout,
    LayoutDirection,
    ElementStyle,
    RelationshipStyle,
    ViewConfiguration,
} from '@/types/model'
import { lex } from './lexer'
import type { Token, TokenType } from './lexer'

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

let idCounter = 0

function resetIdCounter(): void {
    idCounter = 0
}

function nextId(): string {
    idCounter++
    return String(idCounter)
}

// ─── Parser Implementation ──────────────────────────────────────────

class ContextAwareParser {
    private tokens: Token[]
    private pos = 0
    private errors: ParseError[] = []

    // Variable name <-> element id mappings
    private varToId = new Map<string, string>()
    private nameToId = new Map<string, string>()
    private elementsById = new Map<string, { name: string; type: string }>()

    private relCounter = 0

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
        resetIdCounter()
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
                    this.advance()
                } else if (kw === 'configuration' || kw === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
                } else {
                    this.advance()
                    this.skipToNextLine()
                }
            } else {
                this.advance()
            }
        }
    }

    // ─── Model Parsing ──────────────────────────────────────────────

    private parseModelBody(model: Model): void {
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'KEYWORD' && token.value.startsWith('!')) {
                this.advance()
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
                    this.readOptionalString()
                    this.skipNewlines()
                    if (this.match('LBRACE')) {
                        this.parseModelBody(model)
                        this.skipNewlines()
                        this.expect('RBRACE')
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

                this.pos = saved
                this.advance()
                this.skipToNextLine()
                continue
            }

            this.advance()
        }
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
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }
            if (token.type === 'KEYWORD' && token.value.startsWith('!')) { this.advance(); continue }

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

                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties') {
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
        while (!this.check('RBRACE') && this.peekType() !== 'EOF') {
            this.skipNewlines()
            if (this.check('RBRACE') || this.peekType() === 'EOF') break

            const token = this.peek()

            if (token.type === 'COMMENT') { this.advance(); continue }
            if (token.type === 'KEYWORD' && token.value.startsWith('!')) { this.advance(); continue }

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

                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties') {
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

            if (token.type === 'KEYWORD') {
                const kw = token.value.toLowerCase()
                if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives') {
                    this.parseElementPropertyOnElement(element, kw)
                    continue
                }
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
        } else if (keyword === 'properties' || keyword === 'perspectives') {
            this.skipNewlines()
            this.skipBraceBlock()
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
        const rel: Relationship = {
            id: `rel-${this.relCounter}`,
            sourceId: sourceId ?? sourceToken.value,
            destinationId: destId ?? destRef,
            description,
            technology,
            tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
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
                            if (trimmed) rel.tags.push(trimmed)
                        }
                    }
                    continue
                }
                if (this.peekType() === 'KEYWORD' && this.peekValue().toLowerCase() === 'properties') {
                    this.advance()
                    this.skipNewlines()
                    this.skipBraceBlock()
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
                    while (this.check('STAR') || this.check('IDENTIFIER') || this.check('STRING')) {
                        this.advance()
                    }
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
    const lexResult = lex(input)
    const parser = new ContextAwareParser(lexResult.tokens)
    const result = parser.parse()

    // Combine lexer and parser errors
    const errors = [...lexResult.errors, ...result.errors]

    return {
        workspace: result.workspace,
        errors,
    }
}
