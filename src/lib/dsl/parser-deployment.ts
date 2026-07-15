// DSL parser — `deploymentEnvironment { ... }` blocks and the deployment
// element family (deploymentNode, infrastructureNode, containerInstance,
// softwareSystemInstance).
//
// Follows the same conventions as parser-model.ts: every parser takes the
// shared ContextAwareParser instance, ids come from an assigned identifier
// (varName) or nextId(), and unknown constructs are skipped leniently.

import type {
    Model,
    DeploymentEnvironment,
    DeploymentNode,
    InfrastructureNode,
    ContainerInstance,
    SoftwareSystemInstance,
} from '@/types/model'
import type { ContextAwareParser } from './parser'
import { nextId, MAX_DEPTH } from './parser'
import { parseRelationship } from './parser-relationship'

export function parseDeploymentEnvironment(p: ContextAwareParser, model: Model, varName?: string): void {
    p.advance() // consume 'deploymentEnvironment'
    const name = p.readString()
    const id = varName ?? nextId()
    const env: DeploymentEnvironment = { id, name, deploymentNodes: [] }

    // Register the environment identifier (if any) so deployment views can
    // reference it by variable. Never register by name — an environment named
    // like a model element would otherwise shadow that element in resolveRef.
    p.registerDeploymentElement(id, name, 'deploymentEnvironment', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseDeploymentEnvironmentBody(p, env, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    model.deploymentEnvironments.push(env)
}

function parseDeploymentEnvironmentBody(p: ContextAwareParser, env: DeploymentEnvironment, model: Model): void {
    p.depth++
    if (p.depth > MAX_DEPTH) { p.addError('Maximum nesting depth exceeded', p.peek()); p.depth--; return }
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }
        if (token.type === 'KEYWORD' && token.value.startsWith('!')) { p.advance(); p.skipToNextLine(); continue }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'deploymentnode') {
                const node = parseDeploymentNode(p, model)
                if (node) env.deploymentNodes.push(node)
                continue
            }

            // Deployment groups add instance-scoping we don't model; parse the
            // body transparently so nodes inside the group are not lost.
            if (kw === 'group') {
                p.advance()
                p.readOptionalString()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseDeploymentEnvironmentBody(p, env, model)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }

            if (kw === 'properties') {
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
            const saved = p.pos
            p.advance()
            p.skipNewlines()

            if (p.check('EQUALS')) {
                p.advance()
                p.skipNewlines()
                const vn = token.value
                if (p.check('KEYWORD') && p.peekValue().toLowerCase() === 'deploymentnode') {
                    const node = parseDeploymentNode(p, model, vn)
                    if (node) env.deploymentNodes.push(node)
                } else {
                    p.skipUnknownDirective()
                }
                continue
            }

            if (p.check('ARROW')) {
                p.pos = saved
                const rel = parseRelationship(p)
                if (rel) model.relationships.push(rel)
                continue
            }

            p.pos = saved
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
    p.depth--
}

function parseDeploymentNode(p: ContextAwareParser, model: Model, varName?: string): DeploymentNode | null {
    p.advance() // consume 'deploymentNode'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const technology = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const node: DeploymentNode = {
        id,
        type: 'deploymentNode',
        name,
        description,
        technology,
        tags: p.buildTags('Element', 'Deployment Node', tagsStr),
        properties: {},
        children: [],
        infrastructureNodes: [],
        containerInstances: [],
        softwareSystemInstances: [],
    }

    p.registerDeploymentElement(id, name, 'deploymentNode', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseDeploymentNodeBody(p, node, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return node
}

function parseDeploymentNodeBody(p: ContextAwareParser, node: DeploymentNode, model: Model): void {
    p.depth++
    if (p.depth > MAX_DEPTH) { p.addError('Maximum nesting depth exceeded', p.peek()); p.depth--; return }
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'COMMENT') { p.advance(); continue }
        if (token.type === 'KEYWORD' && token.value.startsWith('!')) { p.advance(); p.skipToNextLine(); continue }

        if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
            const kw = token.value.toLowerCase()

            if (token.type === 'KEYWORD' && kw === 'deploymentnode') {
                const child = parseDeploymentNode(p, model)
                if (child) node.children.push(child)
                continue
            }
            if (token.type === 'KEYWORD' && kw === 'infrastructurenode') {
                const infra = parseInfrastructureNode(p)
                if (infra) node.infrastructureNodes.push(infra)
                continue
            }
            if (token.type === 'KEYWORD' && kw === 'containerinstance') {
                const inst = parseElementInstance(p, 'containerInstance')
                if (inst) node.containerInstances.push(inst as ContainerInstance)
                continue
            }
            if (token.type === 'KEYWORD' && kw === 'softwaresysteminstance') {
                const inst = parseElementInstance(p, 'softwareSystemInstance')
                if (inst) node.softwareSystemInstances.push(inst as SoftwareSystemInstance)
                continue
            }

            // `instances` is not a reserved lexer keyword, so accept either token type.
            if (kw === 'instances') {
                p.advance()
                const val = p.peek()
                if (val.type === 'NUMBER' || val.type === 'STRING' || val.type === 'IDENTIFIER') {
                    node.instances = p.advance().value
                }
                continue
            }

            if (token.type === 'KEYWORD' && (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties')) {
                parseDeploymentElementProperty(p, node, kw)
                continue
            }

            if (token.type === 'KEYWORD' && kw === 'group') {
                p.advance()
                p.readOptionalString()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseDeploymentNodeBody(p, node, model)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }

            if (token.type === 'IDENTIFIER') {
                const saved = p.pos
                p.advance()
                p.skipNewlines()

                if (p.check('EQUALS')) {
                    p.advance()
                    p.skipNewlines()
                    const vn = token.value
                    if (p.check('KEYWORD')) {
                        const ekw = p.peekValue().toLowerCase()
                        if (ekw === 'deploymentnode') {
                            const child = parseDeploymentNode(p, model, vn)
                            if (child) node.children.push(child)
                        } else if (ekw === 'infrastructurenode') {
                            const infra = parseInfrastructureNode(p, vn)
                            if (infra) node.infrastructureNodes.push(infra)
                        } else if (ekw === 'containerinstance') {
                            const inst = parseElementInstance(p, 'containerInstance', vn)
                            if (inst) node.containerInstances.push(inst as ContainerInstance)
                        } else if (ekw === 'softwaresysteminstance') {
                            const inst = parseElementInstance(p, 'softwareSystemInstance', vn)
                            if (inst) node.softwareSystemInstances.push(inst as SoftwareSystemInstance)
                        } else {
                            p.skipUnknownDirective()
                        }
                    } else {
                        p.skipUnknownDirective()
                    }
                    continue
                }

                if (p.check('ARROW')) {
                    p.pos = saved
                    const rel = parseRelationship(p)
                    if (rel) model.relationships.push(rel)
                    continue
                }

                p.pos = saved
                p.advance()
                p.skipUnknownDirective()
                continue
            }

            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
    p.depth--
}

function parseInfrastructureNode(p: ContextAwareParser, varName?: string): InfrastructureNode | null {
    p.advance() // consume 'infrastructureNode'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const technology = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const infra: InfrastructureNode = {
        id,
        type: 'infrastructureNode',
        name,
        description,
        technology,
        tags: p.buildTags('Element', 'Infrastructure Node', tagsStr),
        properties: {},
    }

    p.registerDeploymentElement(id, name, 'infrastructureNode', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
            p.skipNewlines()
            if (p.check('RBRACE') || p.peekType() === 'EOF') break
            const t = p.peek()
            if (t.type === 'COMMENT') { p.advance(); continue }
            if (t.type === 'KEYWORD' && (t.value.toLowerCase() === 'tags' || t.value.toLowerCase() === 'description' || t.value.toLowerCase() === 'technology' || t.value.toLowerCase() === 'url' || t.value.toLowerCase() === 'properties')) {
                parseDeploymentElementProperty(p, infra, t.value.toLowerCase())
                continue
            }
            p.advance()
            p.skipUnknownDirective()
        }
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return infra
}

/** Parse `containerInstance <ref>` / `softwareSystemInstance <ref>` including
 *  optional deployment-group identifiers (ignored) and a trailing tags string. */
function parseElementInstance(
    p: ContextAwareParser,
    type: 'containerInstance' | 'softwareSystemInstance',
    varName?: string,
): ContainerInstance | SoftwareSystemInstance | null {
    const instanceToken = p.advance() // consume the instance keyword

    const refToken = p.peek()
    if (refToken.type !== 'IDENTIFIER' && refToken.type !== 'STRING' && refToken.type !== 'KEYWORD') {
        p.addError(`Expected ${type} element reference, got ${refToken.type}`, refToken)
        p.skipUnknownDirective()
        return null
    }
    const ref = p.advance().value
    const referencedId = p.resolveRef(ref)
    if (!referencedId) {
        p.addError(`Unresolved reference: '${ref}'`, instanceToken)
    }

    // Optional deployment-group identifiers — not modelled, consume them.
    while (p.check('IDENTIFIER')) p.advance()
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const defaultTag = type === 'containerInstance' ? 'Container Instance' : 'Software System Instance'
    const tags = [defaultTag]
    if (tagsStr) {
        for (const t of tagsStr.split(',')) {
            const trimmed = t.trim()
            if (trimmed && !tags.includes(trimmed)) tags.push(trimmed)
        }
    }

    const referencedName = p.elementsById.get(referencedId ?? '')?.name ?? ref
    p.registerDeploymentElement(id, referencedName, type, varName)

    const base = { id, tags, properties: {} as Record<string, string> }
    const instance: ContainerInstance | SoftwareSystemInstance =
        type === 'containerInstance'
            ? { ...base, type, containerId: referencedId ?? ref }
            : { ...base, type, softwareSystemId: referencedId ?? ref }

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
            p.skipNewlines()
            if (p.check('RBRACE') || p.peekType() === 'EOF') break
            const t = p.peek()
            if (t.type === 'COMMENT') { p.advance(); continue }
            const kw = t.value.toLowerCase()
            if (t.type === 'KEYWORD' && kw === 'tags') {
                p.advance()
                while (p.check('STRING') || p.check('IDENTIFIER')) {
                    for (const tag of p.advance().value.split(',')) {
                        const trimmed = tag.trim()
                        if (trimmed && !instance.tags.includes(trimmed)) instance.tags.push(trimmed)
                    }
                }
                continue
            }
            if (t.type === 'KEYWORD' && kw === 'url') {
                p.advance()
                const val = p.readOptionalString()
                if (val !== undefined) instance.url = val
                continue
            }
            if (t.type === 'KEYWORD' && kw === 'properties') {
                p.advance()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
                        p.skipNewlines()
                        if (p.check('RBRACE') || p.peekType() === 'EOF') break
                        const keyTok = p.peek()
                        if (keyTok.type !== 'STRING' && keyTok.type !== 'IDENTIFIER') { p.advance(); continue }
                        const key = p.advance().value
                        const valTok = p.peek()
                        if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                            instance.properties[key] = p.advance().value
                        }
                    }
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }
            // healthCheck and anything else we don't model
            p.advance()
            p.skipUnknownDirective()
        }
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return instance
}

/** Property keywords shared by deploymentNode and infrastructureNode bodies. */
function parseDeploymentElementProperty(p: ContextAwareParser, element: DeploymentNode | InfrastructureNode, keyword: string): void {
    p.advance()

    if (keyword === 'tags') {
        while (p.check('STRING') || p.check('IDENTIFIER')) {
            for (const t of p.advance().value.split(',')) {
                const trimmed = t.trim()
                if (trimmed && !element.tags.includes(trimmed)) element.tags.push(trimmed)
            }
        }
    } else if (keyword === 'description') {
        const val = p.readOptionalString()
        if (val !== undefined) element.description = val
    } else if (keyword === 'technology') {
        const val = p.readOptionalString()
        if (val !== undefined) element.technology = val
    } else if (keyword === 'url') {
        const val = p.readOptionalString()
        if (val !== undefined) element.url = val
    } else if (keyword === 'properties') {
        p.skipNewlines()
        if (p.match('LBRACE')) {
            while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
                p.skipNewlines()
                if (p.check('RBRACE') || p.peekType() === 'EOF') break
                const keyTok = p.peek()
                if (keyTok.type !== 'STRING' && keyTok.type !== 'IDENTIFIER') { p.advance(); continue }
                const key = p.advance().value
                const valTok = p.peek()
                if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                    element.properties[key] = p.advance().value
                }
            }
            p.skipNewlines()
            p.expect('RBRACE')
        }
    }
}
