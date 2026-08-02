// Structurizr DSL Serializer — converts a Workspace model back to clean,
// idiomatic Structurizr DSL text with proper formatting.

import type {
    Workspace,
    Person,
    SoftwareSystem,
    Container,
    Component,
    Relationship,
    View,
    AutoLayout,
    ElementStyle,
    RelationshipStyle,
    ViewConfiguration,
} from '@/types/model'

const INDENT = '    ' // 4 spaces

// ─── Public API ─────────────────────────────────────────────────────

export function serialize(workspace: Workspace): string {
    const ctx = new SerializerContext(workspace)
    return ctx.serialize()
}

// ─── Serializer Context ─────────────────────────────────────────────

class SerializerContext {
    private workspace: Workspace
    private lines: string[] = []
    private depth = 0

    // Track which element IDs map to which variable-like names
    // IDs that look like valid identifiers are used as variable names
    private idToVar = new Map<string, string>()

    // Track all element IDs for relationship serialization
    private allElementIds = new Set<string>()

    constructor(workspace: Workspace) {
        this.workspace = workspace
        this.buildIdMaps()
    }

    private buildIdMaps(): void {
        const model = this.workspace.model

        for (const person of model.people) {
            this.registerElement(person.id)
        }

        for (const sys of model.softwareSystems) {
            this.registerElement(sys.id)
            for (const container of sys.containers) {
                this.registerElement(container.id)
                for (const comp of container.components) {
                    this.registerElement(comp.id)
                }
            }
        }
    }

    private usedVarNames = new Set<string>()

    private registerElement(id: string): void {
        this.allElementIds.add(id)
        // Use the element's own ID as the DSL variable name so that IDs
        // survive a serialize → parse roundtrip (critical for sidecar data).
        // Sanitize to make it a valid identifier:
        //   - replace hyphens and other invalid chars with underscores
        //   - prepend 'e' if the first character is a digit
        const sanitized = id
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^([0-9])/, 'e$1')
        // Ensure uniqueness (rare: two distinct IDs with the same sanitized form)
        let varName = sanitized || 'element'
        if (this.usedVarNames.has(varName)) {
            let i = 2
            while (this.usedVarNames.has(`${sanitized}_${i}`)) i++
            varName = `${sanitized}_${i}`
        }
        this.idToVar.set(id, varName)
        this.usedVarNames.add(varName)
    }

    private indent(): string {
        return INDENT.repeat(this.depth)
    }

    private emit(line: string): void {
        if (line === '') {
            this.lines.push('')
        } else {
            this.lines.push(this.indent() + line)
        }
    }

    private emitBlank(): void {
        // Only emit blank if last line isn't already blank
        if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== '') {
            this.lines.push('')
        }
    }

    /**
     * Tags to emit for an element that has a `location`.
     *
     * Structurizr removed the `location` keyword; externality is now carried
     * by the `External` tag. c4hero keeps the field (it drives the UI and the
     * model), and the parser maps the tag back on import.
     */
    private locationAwareTags(
        el: { tags: string[]; location?: string },
        defaults: string[],
    ): string | undefined {
        const tags = el.location === 'External' && !el.tags.includes('External')
            ? [...el.tags, 'External']
            : el.tags
        return this.getExtraTags(tags, defaults)
    }

    /**
     * Properties to emit for an element. `owner` and `status` are not
     * Structurizr keywords (the real parser rejects them inside an element
     * block), so they travel inside the `properties` block — `owner` under the
     * bare `owner` key, `status` under `c4hero.status`; the parser hoists both
     * back to their fields. Derived keys are emitted first and win over a
     * colliding user property, so serialize → parse → serialize is
     * byte-identical.
     */
    private elementProperties(
        el: { owner?: string; status?: string; properties: Record<string, string> },
    ): Record<string, string> {
        const props: Record<string, string> = {}
        if (el.owner) props.owner = el.owner
        if (el.status) props['c4hero.status'] = el.status
        for (const [key, val] of Object.entries(el.properties)) {
            if (!(key in props)) props[key] = val
        }
        return props
    }

    /**
     * Properties to emit for a relationship. `lineStyle` and `interactionStyle`
     * are not Structurizr keywords in a relationship body (the real parser
     * rejects them), so they travel as `c4hero.lineStyle` /
     * `c4hero.interactionStyle` properties, with the same derived-first,
     * derived-wins rules as elementProperties().
     */
    private relationshipProperties(rel: Relationship): Record<string, string> {
        const props: Record<string, string> = {}
        if (rel.lineStyle) props['c4hero.lineStyle'] = rel.lineStyle
        if (rel.interactionStyle) props['c4hero.interactionStyle'] = rel.interactionStyle
        for (const [key, val] of Object.entries(rel.properties)) {
            if (!(key in props)) props[key] = val
        }
        return props
    }

    /** Emit a `properties { }` block for any user-defined key/value pairs. */
    private serializeProperties(props: Record<string, string>): void {
        const entries = Object.entries(props)
        if (entries.length === 0) return
        this.emit('properties {')
        this.depth++
        for (const [key, val] of entries) {
            this.emit(`"${this.escapeString(key)}" "${this.escapeString(val)}"`)
        }
        this.depth--
        this.emit('}')
    }

    // ─── Main Serialize ─────────────────────────────────────────────

    serialize(): string {
        const ws = this.workspace
        const parts: string[] = []

        parts.push('workspace')
        if (ws.name) parts.push(`"${this.escapeString(ws.name)}"`)
        if (ws.description) parts.push(`"${this.escapeString(ws.description)}"`)

        this.emit(parts.join(' ') + ' {')
        this.depth++

        this.emitBlank()
        this.serializeModel()
        this.emitBlank()
        this.serializeViews()

        if (ws.scope && ws.scope !== 'none') {
            this.emitBlank()
            this.emit('configuration {')
            this.depth++
            this.emit(`scope ${ws.scope}`)
            this.depth--
            this.emit('}')
        }

        this.emitBlank()

        this.depth--
        this.emit('}')

        // Clean up trailing blank lines
        while (this.lines.length > 0 && this.lines[this.lines.length - 1] === '') {
            this.lines.pop()
        }
        this.lines.push('') // final newline

        return this.lines.join('\n')
    }

    // ─── Model ──────────────────────────────────────────────────────

    private serializeModel(): void {
        this.emit('model {')
        this.depth++

        const model = this.workspace.model

        // People
        for (const person of model.people) {
            this.serializePerson(person)
        }

        if (model.people.length > 0 && model.softwareSystems.length > 0) {
            this.emitBlank()
        }

        // Software Systems
        for (let i = 0; i < model.softwareSystems.length; i++) {
            if (i > 0) this.emitBlank()
            this.serializeSoftwareSystem(model.softwareSystems[i])
        }

        // Groups
        if (model.groups.length > 0) {
            this.emitBlank()
            for (const group of model.groups) {
                this.emit(`group "${this.escapeString(group.name)}" {`)
                this.depth++
                for (const elementId of group.elementIds) {
                    this.emit(this.idToVar.get(elementId) ?? elementId)
                }
                this.depth--
                this.emit('}')
            }
        }

        // Relationships
        if (model.relationships.length > 0) {
            this.emitBlank()
            for (const rel of model.relationships) {
                this.serializeRelationship(rel)
            }
        }

        this.depth--
        this.emit('}')
    }

    private serializePerson(person: Person): void {
        const varName = this.idToVar.get(person.id)
        const extraTags = this.locationAwareTags(person, ['Element', 'Person'])
        const props = this.elementProperties(person)
        const hasProperties = Object.keys(props).length > 0
        const hasBlock = !!person.url || hasProperties

        const parts: string[] = []
        parts.push('person')
        parts.push(`"${this.escapeString(person.name)}"`)
        if (person.description || extraTags) {
            parts.push(`"${this.escapeString(person.description ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''

        if (hasBlock) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++
            if (person.url) this.emit(`url "${this.escapeString(person.url)}"`)
            if (hasProperties) this.serializeProperties(props)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeSoftwareSystem(sys: SoftwareSystem): void {
        const varName = this.idToVar.get(sys.id)
        const extraTags = this.locationAwareTags(sys, ['Element', 'Software System'])
        const props = this.elementProperties(sys)
        const hasProperties = Object.keys(props).length > 0
        const hasBody = sys.containers.length > 0 || !!sys.url || hasProperties

        const parts: string[] = []
        parts.push('softwareSystem')
        parts.push(`"${this.escapeString(sys.name)}"`)
        if (sys.description || extraTags) {
            parts.push(`"${this.escapeString(sys.description ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''

        if (hasBody) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++

            if (sys.url) this.emit(`url "${this.escapeString(sys.url)}"`)
            if (hasProperties) this.serializeProperties(props)

            for (let i = 0; i < sys.containers.length; i++) {
                if (i > 0) this.emitBlank()
                this.serializeContainer(sys.containers[i])
            }

            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeContainer(container: Container): void {
        const varName = this.idToVar.get(container.id)
        const extraTags = this.getExtraTags(container.tags, ['Element', 'Container'])
        const props = this.elementProperties(container)
        const hasProperties = Object.keys(props).length > 0
        const hasBody = container.components.length > 0 || !!container.url || hasProperties

        const parts: string[] = []
        parts.push('container')
        parts.push(`"${this.escapeString(container.name)}"`)
        if (container.description || container.technology || extraTags) {
            parts.push(`"${this.escapeString(container.description ?? '')}"`)
        }
        if (container.technology || extraTags) {
            parts.push(`"${this.escapeString(container.technology ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''

        if (hasBody) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++

            if (container.url) this.emit(`url "${this.escapeString(container.url)}"`)
            if (hasProperties) this.serializeProperties(props)
            for (const comp of container.components) {
                this.serializeComponent(comp)
            }

            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeComponent(comp: Component): void {
        const varName = this.idToVar.get(comp.id)
        const extraTags = this.getExtraTags(comp.tags, ['Element', 'Component'])
        const props = this.elementProperties(comp)
        const hasProperties = Object.keys(props).length > 0
        const hasBlock = !!comp.url || hasProperties

        const parts: string[] = []
        parts.push('component')
        parts.push(`"${this.escapeString(comp.name)}"`)
        if (comp.description || comp.technology || extraTags) {
            parts.push(`"${this.escapeString(comp.description ?? '')}"`)
        }
        if (comp.technology || extraTags) {
            parts.push(`"${this.escapeString(comp.technology ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''

        if (hasBlock) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++
            if (comp.url) this.emit(`url "${this.escapeString(comp.url)}"`)
            if (hasProperties) this.serializeProperties(props)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeRelationship(rel: Relationship): void {
        const sourceRef = this.idToVar.get(rel.sourceId) ?? rel.sourceId
        const destRef = this.idToVar.get(rel.destinationId) ?? rel.destinationId

        const parts: string[] = []
        parts.push(`${sourceRef} -> ${destRef}`)
        // When technology is set, description must be emitted first (positional arg).
        // Emit an empty string for description if absent so technology lands in the right slot.
        if (rel.description || rel.technology) parts.push(`"${this.escapeString(rel.description ?? '')}"`)
        if (rel.technology) parts.push(`"${this.escapeString(rel.technology)}"`)

        const extraTags = this.getExtraTags(rel.tags, ['Relationship'])
        const props = this.relationshipProperties(rel)
        const hasProperties = Object.keys(props).length > 0
        const needsBlock = !!rel.url || hasProperties

        if (needsBlock) {
            // Use block form when url or properties (including the folded-in
            // lineStyle/interactionStyle) are present
            this.emit(`${parts.join(' ')} {`)
            this.depth++
            if (rel.url) this.emit(`url "${this.escapeString(rel.url)}"`)
            if (hasProperties) this.serializeProperties(props)
            if (extraTags) this.emit(`tags "${extraTags}"`)
            this.depth--
            this.emit('}')
        } else if (extraTags) {
            // Inline form: tags are the 4th positional arg in Structurizr DSL.
            // All preceding slots must be filled, so rebuild with explicit slots.
            const inline = [
                `${sourceRef} -> ${destRef}`,
                `"${this.escapeString(rel.description ?? '')}"`,
                `"${this.escapeString(rel.technology ?? '')}"`,
                `"${extraTags}"`,
            ]
            this.emit(inline.join(' '))
        } else {
            this.emit(parts.join(' '))
        }
    }

    // ─── Views ──────────────────────────────────────────────────────

    private serializeViews(): void {
        this.emit('views {')
        this.depth++

        const views = this.workspace.views
        let needsBlank = false

        // Skip parser-synthesised views — they exist to give the canvas
        // something to render when the DSL declares no views; serializing them
        // would mutate the source DSL.
        for (const view of views.systemLandscapeViews) {
            if (view.autoView) continue
            if (needsBlank) this.emitBlank()
            this.serializeView(view)
            needsBlank = true
        }

        for (const view of views.systemContextViews) {
            if (view.autoView) continue
            if (needsBlank) this.emitBlank()
            this.serializeView(view)
            needsBlank = true
        }

        for (const view of views.containerViews) {
            if (view.autoView) continue
            if (needsBlank) this.emitBlank()
            this.serializeView(view)
            needsBlank = true
        }

        for (const view of views.componentViews) {
            if (view.autoView) continue
            if (needsBlank) this.emitBlank()
            this.serializeView(view)
            needsBlank = true
        }

        // Styles
        if (this.hasStyles(views.configuration)) {
            if (needsBlank) this.emitBlank()
            this.serializeStyles(views.configuration)
            needsBlank = true
        }

        // Themes
        if (views.configuration.themes && views.configuration.themes.length > 0) {
            if (needsBlank) this.emitBlank()
            this.emit(`themes ${views.configuration.themes.map(t => `"${this.escapeString(t)}"`).join(' ')}`)
        }

        this.depth--
        this.emit('}')
    }

    private serializeView(view: View): void {
        const parts: string[] = []

        if (view.type === 'systemLandscape') {
            parts.push('systemLandscape')
        } else if (view.type === 'systemContext') {
            parts.push('systemContext')
            if (view.softwareSystemId) {
                const ref = this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId
                parts.push(ref)
            }
        } else if (view.type === 'container') {
            parts.push('container')
            if (view.softwareSystemId) {
                const ref = this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId
                parts.push(ref)
            }
        } else if (view.type === 'component') {
            parts.push('component')
            if (view.containerId) {
                const ref = this.idToVar.get(view.containerId) ?? view.containerId
                parts.push(ref)
            }
        }

        // Skip parser-synthesised keys so DSL without explicit view keys
        // roundtrips byte-identical.
        if (view.key && !view.autoKey) parts.push(`"${this.escapeString(view.key)}"`)

        this.emit(`${parts.join(' ')} {`)
        this.depth++

        // Structurizr view headers use the second optional string as a
        // description, not a title. Emit titles with the standard child keyword.
        if (view.title) {
            this.emit(`title "${this.escapeString(view.title)}"`)
        }

        // Description (block property — cannot be expressed as a positional arg)
        if (view.description) {
            this.emit(`description "${this.escapeString(view.description)}"`)
        }

        // Elements
        const hasWildcard = view.elements.some(e => e.id === '*')
        if (hasWildcard) {
            this.emit('include *')
        } else if (view.elements.length > 0) {
            for (const el of view.elements) {
                const ref = this.idToVar.get(el.id) ?? el.id
                this.emit(`include ${ref}`)
            }
        }

        // Auto layout
        if (view.autoLayout) {
            this.serializeAutoLayout(view.autoLayout)
        }

        this.depth--
        this.emit('}')
    }

    private serializeAutoLayout(layout: AutoLayout): void {
        const parts: string[] = ['autoLayout']

        if (layout.direction !== 'TB' || layout.rankSeparation !== undefined || layout.nodeSeparation !== undefined) {
            // Structurizr accepts only lowercase rank directions (tb|bt|lr|rl)
            // and rejects the uppercase form c4hero stores internally.
            parts.push(layout.direction.toLowerCase())
        }

        if (layout.rankSeparation !== undefined) {
            parts.push(String(layout.rankSeparation))
        }

        if (layout.nodeSeparation !== undefined) {
            parts.push(String(layout.nodeSeparation))
        }

        this.emit(parts.join(' '))
    }

    // ─── Styles ─────────────────────────────────────────────────────

    private hasStyles(config: ViewConfiguration): boolean {
        return config.styles.elements.length > 0 || config.styles.relationships.length > 0
    }

    private serializeStyles(config: ViewConfiguration): void {
        this.emit('styles {')
        this.depth++

        let needsBlank = false

        for (const style of config.styles.elements) {
            if (needsBlank) this.emitBlank()
            this.serializeElementStyle(style)
            needsBlank = true
        }

        for (const style of config.styles.relationships) {
            if (needsBlank) this.emitBlank()
            this.serializeRelationshipStyle(style)
            needsBlank = true
        }

        this.depth--
        this.emit('}')
    }

    private serializeElementStyle(style: ElementStyle): void {
        this.emit(`element "${this.escapeString(style.tag)}" {`)
        this.depth++

        if (style.background !== undefined) this.emit(`background ${style.background}`)
        if (style.color !== undefined) this.emit(`color ${style.color}`)
        if (style.shape !== undefined) this.emit(`shape ${style.shape}`)
        if (style.fontSize !== undefined) this.emit(`fontSize ${style.fontSize}`)
        if (style.border !== undefined) this.emit(`border ${style.border}`)
        if (style.opacity !== undefined) this.emit(`opacity ${style.opacity}`)
        if (style.icon !== undefined) this.emit(`icon "${this.escapeString(style.icon)}"`)
        if (style.stroke !== undefined) this.emit(`stroke ${style.stroke}`)
        if (style.strokeWidth !== undefined) this.emit(`strokeWidth ${style.strokeWidth}`)

        this.depth--
        this.emit('}')
    }

    private serializeRelationshipStyle(style: RelationshipStyle): void {
        this.emit(`relationship "${this.escapeString(style.tag)}" {`)
        this.depth++

        if (style.color !== undefined) this.emit(`color ${style.color}`)
        if (style.thickness !== undefined) this.emit(`thickness ${style.thickness}`)
        if (style.dashed !== undefined) this.emit(`dashed ${style.dashed}`)
        if (style.fontSize !== undefined) this.emit(`fontSize ${style.fontSize}`)
        if (style.opacity !== undefined) this.emit(`opacity ${style.opacity}`)

        this.depth--
        this.emit('}')
    }

    // ─── Helpers ────────────────────────────────────────────────────

    /**
     * Encode a value as the body of a Structurizr double-quoted string.
     *
     * Structurizr's tokenizer (verified against structurizr-java 5.0.2)
     * recognises exactly two escapes inside a quoted string: `\"` and `\n`.
     * Every other backslash is kept verbatim — `\\` is NOT collapsed to a
     * single backslash the way JSON does it, and after a missed escape the
     * tokenizer consumes only the backslash, re-examining the next char.
     * Emitting JSON-style escapes therefore corrupts the value rather than
     * protecting it.
     *
     * A backslash before a quote IS representable: the quote's own `\"`
     * escape leaves the backslash a literal miss, so raw `a\"b` emits as
     * `a\\"b` and decodes back exactly. Because there is no way to escape a
     * backslash itself, it stays unrepresentable in two positions where it
     * would be read as (part of) an escape:
     *
     *   - immediately before an `n` (any run length — `\\n` still decodes
     *     as literal-backslash + newline), and
     *   - at the very end of the value, where it escapes the closing quote
     *     and swallows the rest of the line ("Too many tokens").
     *
     * Those backslashes are dropped. Everything else round-trips exactly.
     */
    private escapeString(s: string): string {
        return s
            .replace(/\\+(?=n)/g, '')
            .replace(/\\+$/, '')
            .replace(/"/g, '\\"')
            .replace(/\r\n|\r|\n/g, '\\n')
    }

    /**
     * Structurizr splits a tag string on commas, so a tag containing a comma
     * would silently become two tags. Drop commas rather than corrupt the set.
     * Values still go through escapeString like every other quoted string.
     */
    private getExtraTags(tags: string[], defaults: string[]): string | undefined {
        const extra = tags
            .filter(t => !defaults.includes(t))
            .map(t => this.escapeString(t.replace(/,/g, '')))
            .filter(t => t.length > 0)
        if (extra.length === 0) return undefined
        return extra.join(',')
    }
}
