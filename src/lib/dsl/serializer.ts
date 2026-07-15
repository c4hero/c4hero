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
    DeploymentEnvironment,
    DeploymentNode,
    InfrastructureNode,
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

        // Tolerate workspaces persisted before deployment support existed.
        for (const env of model.deploymentEnvironments ?? []) {
            this.registerDeploymentNodes(env.deploymentNodes)
        }
    }

    private registerDeploymentNodes(nodes: DeploymentNode[]): void {
        for (const node of nodes) {
            this.registerElement(node.id)
            for (const infra of node.infrastructureNodes) this.registerElement(infra.id)
            for (const inst of node.containerInstances) this.registerElement(inst.id)
            for (const inst of node.softwareSystemInstances) this.registerElement(inst.id)
            this.registerDeploymentNodes(node.children)
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

        // Deployment environments (before relationships — instance identifiers
        // must be defined before any relationship lines that reference them)
        for (const env of model.deploymentEnvironments ?? []) {
            this.emitBlank()
            this.serializeDeploymentEnvironment(env)
        }

        // Relationships. Implied instance relationships are parser-derived
        // (replicated from container/system relationships) — never emitted.
        const explicitRels = model.relationships.filter(r => !r.implied)
        if (explicitRels.length > 0) {
            this.emitBlank()
            for (const rel of explicitRels) {
                this.serializeRelationship(rel)
            }
        }

        this.depth--
        this.emit('}')
    }

    // ─── Deployment ─────────────────────────────────────────────────

    private serializeDeploymentEnvironment(env: DeploymentEnvironment): void {
        this.emit(`deploymentEnvironment "${this.escapeString(env.name)}" {`)
        this.depth++
        for (let i = 0; i < env.deploymentNodes.length; i++) {
            if (i > 0) this.emitBlank()
            this.serializeDeploymentNode(env.deploymentNodes[i])
        }
        this.depth--
        this.emit('}')
    }

    private serializeDeploymentNode(node: DeploymentNode): void {
        const varName = this.idToVar.get(node.id)
        const extraTags = this.getExtraTags(node.tags, ['Element', 'Deployment Node'])
        const hasProperties = Object.keys(node.properties).length > 0

        const parts: string[] = []
        parts.push('deploymentNode')
        parts.push(`"${this.escapeString(node.name)}"`)
        if (node.description || node.technology || extraTags) {
            parts.push(`"${this.escapeString(node.description ?? '')}"`)
        }
        if (node.technology || extraTags) {
            parts.push(`"${this.escapeString(node.technology ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''
        this.emit(`${prefix}${parts.join(' ')} {`)
        this.depth++

        if (node.instances !== undefined) this.emit(`instances ${/^\d+$/.test(node.instances) ? node.instances : `"${this.escapeString(node.instances)}"`}`)
        if (node.url) this.emit(`url "${this.escapeString(node.url)}"`)
        if (hasProperties) this.serializeProperties(node.properties)

        for (const infra of node.infrastructureNodes) {
            this.serializeInfrastructureNode(infra)
        }
        for (const inst of node.softwareSystemInstances) {
            this.serializeElementInstance('softwareSystemInstance', inst.id, inst.softwareSystemId, inst.tags, ['Software System Instance'], inst.url, inst.properties)
        }
        for (const inst of node.containerInstances) {
            this.serializeElementInstance('containerInstance', inst.id, inst.containerId, inst.tags, ['Container Instance'], inst.url, inst.properties)
        }
        for (const child of node.children) {
            this.serializeDeploymentNode(child)
        }

        this.depth--
        this.emit('}')
    }

    private serializeInfrastructureNode(infra: InfrastructureNode): void {
        const varName = this.idToVar.get(infra.id)
        const extraTags = this.getExtraTags(infra.tags, ['Element', 'Infrastructure Node'])
        const hasProperties = Object.keys(infra.properties).length > 0
        const hasBlock = !!infra.url || hasProperties

        const parts: string[] = []
        parts.push('infrastructureNode')
        parts.push(`"${this.escapeString(infra.name)}"`)
        if (infra.description || infra.technology || extraTags) {
            parts.push(`"${this.escapeString(infra.description ?? '')}"`)
        }
        if (infra.technology || extraTags) {
            parts.push(`"${this.escapeString(infra.technology ?? '')}"`)
        }
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''
        if (hasBlock) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++
            if (infra.url) this.emit(`url "${this.escapeString(infra.url)}"`)
            if (hasProperties) this.serializeProperties(infra.properties)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeElementInstance(
        keyword: 'containerInstance' | 'softwareSystemInstance',
        id: string,
        referencedId: string,
        tags: string[],
        defaultTags: string[],
        url: string | undefined,
        properties: Record<string, string>,
    ): void {
        const varName = this.idToVar.get(id)
        const ref = this.idToVar.get(referencedId) ?? referencedId
        const extraTags = this.getExtraTags(tags, defaultTags)
        const hasProperties = Object.keys(properties).length > 0
        const hasBlock = !!url || hasProperties

        const parts: string[] = [keyword, ref]
        if (extraTags) parts.push(`"${extraTags}"`)

        const prefix = varName ? `${varName} = ` : ''
        if (hasBlock) {
            this.emit(`${prefix}${parts.join(' ')} {`)
            this.depth++
            if (url) this.emit(`url "${this.escapeString(url)}"`)
            if (hasProperties) this.serializeProperties(properties)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializePerson(person: Person): void {
        const varName = this.idToVar.get(person.id)
        const extraTags = this.getExtraTags(person.tags, ['Element', 'Person'])
        const isExternal = person.location === 'External'
        const hasProperties = Object.keys(person.properties).length > 0
        const hasBlock = isExternal || !!person.url || !!person.status || !!person.owner || hasProperties

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
            if (person.status) this.emit(`status ${person.status}`)
            if (person.owner) this.emit(`owner "${this.escapeString(person.owner)}"`)
            if (isExternal) this.emit('location External')
            if (hasProperties) this.serializeProperties(person.properties)
            this.depth--
            this.emit('}')
        } else {
            this.emit(`${prefix}${parts.join(' ')}`)
        }
    }

    private serializeSoftwareSystem(sys: SoftwareSystem): void {
        const varName = this.idToVar.get(sys.id)
        const extraTags = this.getExtraTags(sys.tags, ['Element', 'Software System'])
        const isExternal = sys.location === 'External'
        const hasProperties = Object.keys(sys.properties).length > 0
        const hasBody = sys.containers.length > 0 || isExternal || !!sys.url || !!sys.status || !!sys.owner || hasProperties

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
            if (sys.status) this.emit(`status ${sys.status}`)
            if (sys.owner) this.emit(`owner "${this.escapeString(sys.owner)}"`)
            if (isExternal) this.emit('location External')
            if (hasProperties) this.serializeProperties(sys.properties)

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
        const hasProperties = Object.keys(container.properties).length > 0
        const hasBody = container.components.length > 0 || !!container.url || !!container.status || !!container.owner || hasProperties

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
            if (container.status) this.emit(`status ${container.status}`)
            if (container.owner) this.emit(`owner "${this.escapeString(container.owner)}"`)
            if (hasProperties) this.serializeProperties(container.properties)
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
        const hasProperties = Object.keys(comp.properties).length > 0
        const hasBlock = !!comp.url || !!comp.status || !!comp.owner || hasProperties

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
            if (comp.status) this.emit(`status ${comp.status}`)
            if (comp.owner) this.emit(`owner "${this.escapeString(comp.owner)}"`)
            if (hasProperties) this.serializeProperties(comp.properties)
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
        const hasProperties = Object.keys(rel.properties).length > 0
        const needsBlock = !!rel.interactionStyle || !!rel.url || !!rel.lineStyle || hasProperties

        if (needsBlock) {
            // Use block form when interactionStyle, url, lineStyle, or properties are present
            this.emit(`${parts.join(' ')} {`)
            this.depth++
            if (rel.url) this.emit(`url "${this.escapeString(rel.url)}"`)
            if (rel.interactionStyle) this.emit(`interactionStyle ${rel.interactionStyle}`)
            if (rel.lineStyle) this.emit(`lineStyle ${rel.lineStyle}`)
            if (hasProperties) this.serializeProperties(rel.properties)
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

        for (const view of views.dynamicViews ?? []) {
            if (view.autoView) continue
            if (needsBlank) this.emitBlank()
            this.serializeDynamicView(view)
            needsBlank = true
        }

        for (const view of views.deploymentViews ?? []) {
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
        } else if (view.type === 'deployment') {
            parts.push('deployment')
            if (view.softwareSystemId) {
                parts.push(this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId)
            } else {
                parts.push('*')
            }
            parts.push(`"${this.escapeString(view.environment ?? '')}"`)
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

    /** Dynamic views serialize as an ordered list of interaction steps
     *  (`source -> destination "description"`), not as include lines. */
    private serializeDynamicView(view: View): void {
        const parts: string[] = ['dynamic']
        const scopeId = view.softwareSystemId ?? view.containerId
        if (scopeId) {
            parts.push(this.idToVar.get(scopeId) ?? scopeId)
        } else {
            parts.push('*')
        }
        if (view.key && !view.autoKey) parts.push(`"${this.escapeString(view.key)}"`)

        this.emit(`${parts.join(' ')} {`)
        this.depth++

        if (view.title) this.emit(`title "${this.escapeString(view.title)}"`)
        if (view.description) this.emit(`description "${this.escapeString(view.description)}"`)

        const relById = new Map(this.workspace.model.relationships.map(r => [r.id, r]))
        for (const step of view.relationships) {
            const rel = relById.get(step.id)
            if (!rel) continue
            const sourceRef = this.idToVar.get(rel.sourceId) ?? rel.sourceId
            const destRef = this.idToVar.get(rel.destinationId) ?? rel.destinationId
            const description = step.description ?? rel.description
            const line = description
                ? `${sourceRef} -> ${destRef} "${this.escapeString(description)}"`
                : `${sourceRef} -> ${destRef}`
            this.emit(line)
        }

        if (view.autoLayout) {
            this.serializeAutoLayout(view.autoLayout)
        }

        this.depth--
        this.emit('}')
    }

    private serializeAutoLayout(layout: AutoLayout): void {
        const parts: string[] = ['autoLayout']

        if (layout.direction !== 'TB' || layout.rankSeparation !== undefined || layout.nodeSeparation !== undefined) {
            parts.push(layout.direction)
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

    private escapeString(s: string): string {
        return s
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t')
    }

    private getExtraTags(tags: string[], defaults: string[]): string | undefined {
        const extra = tags.filter(t => !defaults.includes(t))
        if (extra.length === 0) return undefined
        return extra.join(',')
    }
}
