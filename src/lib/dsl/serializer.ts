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
import { escapeDslString, sanitizeTag } from './dsl-strings'

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

    /** Merge derived reserved-key properties (owner, status) with the element's
     *  own user-defined properties into a single new object, without mutating
     *  the workspace model. Real Structurizr rejects the bare `owner`/`status`
     *  keywords inside an element block (only `description`, `tags`, `url`,
     *  `properties`, `perspectives` are accepted there), so c4hero carries them
     *  as `"owner"` / `"c4hero.status"` properties instead (see parser-model.ts
     *  for the read-back side). Derived values win over any same-named
     *  user-defined property. */
    private mergeElementProperties(element: { properties: Record<string, string>; owner?: string; status?: string }): Record<string, string> {
        const merged: Record<string, string> = { ...element.properties }
        if (element.owner) merged.owner = element.owner
        if (element.status) merged['c4hero.status'] = element.status
        return merged
    }

    /** Same merging as {@link mergeElementProperties} but for relationships:
     *  real Structurizr rejects bare `lineStyle`/`interactionStyle` keywords
     *  inside a relationship block, so they are carried as `"c4hero.lineStyle"`
     *  / `"c4hero.interactionStyle"` properties instead. */
    private mergeRelationshipProperties(rel: Relationship): Record<string, string> {
        const merged: Record<string, string> = { ...rel.properties }
        if (rel.lineStyle) merged['c4hero.lineStyle'] = rel.lineStyle
        if (rel.interactionStyle) merged['c4hero.interactionStyle'] = rel.interactionStyle
        return merged
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
        const isExternal = person.location === 'External'
        // Real Structurizr rejects the bare `location` keyword inside an element
        // block, so an External person is instead tagged `External` and routed
        // through the same tag-sanitising/dedup path as any other tag (an
        // element that already carries the tag emits it exactly once). The tag
        // is promoted back to `location: 'External'` on import — see
        // applyExternalTagToLocation() in parser-model.ts.
        const tagsForExtra = isExternal ? [...person.tags, 'External'] : person.tags
        const extraTags = this.getExtraTags(tagsForExtra, ['Element', 'Person'])
        const properties = this.mergeElementProperties(person)
        const hasProperties = Object.keys(properties).length > 0
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
            if (hasProperties) this.serializeProperties(properties)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeSoftwareSystem(sys: SoftwareSystem): void {
        const varName = this.idToVar.get(sys.id)
        const isExternal = sys.location === 'External'
        // See serializePerson() for why External is emitted as a tag, not a
        // `location` keyword.
        const tagsForExtra = isExternal ? [...sys.tags, 'External'] : sys.tags
        const extraTags = this.getExtraTags(tagsForExtra, ['Element', 'Software System'])
        const properties = this.mergeElementProperties(sys)
        const hasProperties = Object.keys(properties).length > 0
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
            if (hasProperties) this.serializeProperties(properties)

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
        const properties = this.mergeElementProperties(container)
        const hasProperties = Object.keys(properties).length > 0
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
            if (hasProperties) this.serializeProperties(properties)
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
        const properties = this.mergeElementProperties(comp)
        const hasProperties = Object.keys(properties).length > 0
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
            if (hasProperties) this.serializeProperties(properties)
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
        const properties = this.mergeRelationshipProperties(rel)
        const hasProperties = Object.keys(properties).length > 0
        const needsBlock = !!rel.url || hasProperties

        if (needsBlock) {
            // Use block form when url or (merged) properties are present.
            this.emit(`${parts.join(' ')} {`)
            this.depth++
            if (rel.url) this.emit(`url "${this.escapeString(rel.url)}"`)
            if (hasProperties) this.serializeProperties(properties)
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
            // Structurizr requires the rank direction lowercase (tb|bt|lr|rl);
            // an uppercase direction like `LR` is rejected by the real parser.
            // The parser upper-cases on read (parser-views.ts), so the
            // in-memory LayoutDirection value and round-trip are unaffected.
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

    // Thin wrapper kept so every call site above reads `this.escapeString(...)`
    // without a wider diff; the real implementation lives in dsl-strings.ts
    // and matches exactly what the real Structurizr parser accepts.
    private escapeString(s: string): string {
        return escapeDslString(s)
    }

    private getExtraTags(tags: string[], defaults: string[]): string | undefined {
        const seen = new Set<string>()
        const extra: string[] = []
        for (const tag of tags) {
            if (defaults.includes(tag)) continue
            const sanitized = sanitizeTag(tag)
            if (sanitized === '') continue
            if (seen.has(sanitized)) continue
            seen.add(sanitized)
            extra.push(sanitized)
        }
        if (extra.length === 0) return undefined
        // Tags have no escape mechanism for a comma (see dsl-strings.ts), but
        // the tag list itself is embedded inside a quoted string, so each
        // tag still needs quote-escaping before being joined.
        return extra.map(t => escapeDslString(t)).join(',')
    }
}
