// DSL parser — `model { ... }` block plus all element parsers
// (person, softwareSystem, container, component) and shared element-body
// helpers.

import type { Workspace, Model, Group, Person, SoftwareSystem, Container, Component } from '@/types/model'
import type { ContextAwareParser } from './parser'
import { nextId, MAX_DEPTH } from './parser'
import { parseRelationship } from './parser-relationship'

type Element = Person | SoftwareSystem | Container | Component

export function parseModelBody(p: ContextAwareParser, model: Model, groupRefIds?: string[]): void {
    p.depth++
    if (p.depth > MAX_DEPTH) { p.addError('Maximum nesting depth exceeded', p.peek()); p.depth--; return }
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()

        if (token.type === 'KEYWORD' && token.value.startsWith('!')) {
            // Preprocessor directives (!include, !const, !var, !identifiers, !docs, !adrs).
            // c4hero doesn't evaluate them, but must consume the keyword plus any inline
            // arguments on the same line to avoid mis-parsing them as model elements.
            p.advance()
            p.skipToNextLine()
            continue
        }

        if (token.type === 'COMMENT') {
            p.advance()
            continue
        }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'enterprise') {
                p.advance()
                p.readOptionalString()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseModelBody(p, model)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }

            if (kw === 'group') {
                p.advance()
                const groupName = p.readOptionalString() ?? `Group ${model.groups.length + 1}`
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    const memberRefs: string[] = []
                    const beforePeople = model.people.length
                    const beforeSystems = model.softwareSystems.length
                    parseModelBody(p, model, memberRefs)
                    p.skipNewlines()
                    p.expect('RBRACE')
                    const definedIds = [
                        ...model.people.slice(beforePeople).map(pp => pp.id),
                        ...model.softwareSystems.slice(beforeSystems).map(s => s.id),
                    ]
                    const allIds = [...new Set([...definedIds, ...memberRefs])]
                    const group: Group = { id: nextId(), name: groupName, elementIds: allIds }
                    model.groups.push(group)
                }
                continue
            }

            if (kw === 'person') {
                const person = parsePerson(p)
                if (person) model.people.push(person)
                continue
            }

            if (kw === 'softwaresystem') {
                const sys = parseSoftwareSystem(p, undefined, model)
                if (sys) model.softwareSystems.push(sys)
                continue
            }

            if (kw === 'deploymentenvironment' || kw === 'deploymentnode') {
                p.advance()
                while (p.check('STRING') || p.check('IDENTIFIER')) p.advance()
                p.skipNewlines()
                p.skipBraceBlock()
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
                const varName = token.value

                if (p.check('KEYWORD')) {
                    const elementKw = p.peekValue().toLowerCase()

                    if (elementKw === 'person') {
                        const person = parsePerson(p, varName)
                        if (person) model.people.push(person)
                    } else if (elementKw === 'softwaresystem') {
                        const sys = parseSoftwareSystem(p, varName, model)
                        if (sys) model.softwareSystems.push(sys)
                    } else {
                        // Unknown element type (e.g. deploymentEnvironment) — skip inline
                        // args (stopping before any `{`) then skip any following brace block.
                        p.skipUnknownDirective()
                    }
                } else {
                    // After `=`, the value is not a keyword — skip inline args and any block.
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

            // Standalone identifier — if collecting group refs, resolve it
            if (groupRefIds !== undefined) {
                const resolvedId = p.resolveRef(token.value)
                if (resolvedId) groupRefIds.push(resolvedId)
            }
            p.pos = saved
            p.advance()
            // Stop before any inline `{` so we don't consume it with the rest of the line
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
    p.depth--
}

function parsePerson(p: ContextAwareParser, varName?: string): Person | null {
    p.advance() // consume 'person'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const person: Person = {
        id,
        type: 'person',
        name,
        description,
        tags: p.buildTags('Element', 'Person', tagsStr),
        properties: {},
    }

    p.registerElement(id, name, 'person', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseSimpleElementBlock(p, person)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return person
}

function parseSoftwareSystem(p: ContextAwareParser, varName?: string, model?: Model): SoftwareSystem | null {
    p.advance() // consume 'softwareSystem'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const sys: SoftwareSystem = {
        id,
        type: 'softwareSystem',
        name,
        description,
        tags: p.buildTags('Element', 'Software System', tagsStr),
        properties: {},
        containers: [],
    }

    p.registerElement(id, name, 'softwareSystem', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseSoftwareSystemBody(p, sys, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return sys
}

function parseSoftwareSystemBody(p: ContextAwareParser, sys: SoftwareSystem, model?: Model): void {
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

            if (kw === 'group') {
                p.advance()
                p.readOptionalString()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseSoftwareSystemBody(p, sys, model)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }

            if (kw === 'container') {
                const container = parseContainer(p, undefined, model)
                if (container) sys.containers.push(container)
                continue
            }

            if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'location' || kw === 'status' || kw === 'owner') {
                parseElementPropertyOnElement(p, sys, kw)
                continue
            }

            // Unknown keyword: consume keyword + any inline args (stopping before LBRACE),
            // then skip any brace block so the parent element's closing RBRACE is not
            // mistakenly consumed as the inner block's.
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

                if (p.check('KEYWORD')) {
                    const ekw = p.peekValue().toLowerCase()
                    if (ekw === 'container') {
                        const container = parseContainer(p, vn, model)
                        if (container) sys.containers.push(container)
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
                if (model) {
                    const rel = parseRelationship(p)
                    if (rel) model.relationships.push(rel)
                } else {
                    p.skipToNextLine()
                }
                continue
            }

            // Standalone identifier (unknown reference/annotation): consume it and any
            // inline args, then skip any brace block so the parent element's closing
            // RBRACE is not mistakenly consumed as the inner block's closing brace.
            p.pos = saved
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
    p.depth--
}

function parseContainer(p: ContextAwareParser, varName?: string, model?: Model): Container | null {
    p.advance() // consume 'container'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const technology = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const container: Container = {
        id,
        type: 'container',
        name,
        description,
        technology,
        tags: p.buildTags('Element', 'Container', tagsStr),
        properties: {},
        components: [],
    }

    p.registerElement(id, name, 'container', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseContainerBody(p, container, model)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return container
}

function parseContainerBody(p: ContextAwareParser, container: Container, model?: Model): void {
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

            if (kw === 'group') {
                p.advance()
                p.readOptionalString()
                p.skipNewlines()
                if (p.match('LBRACE')) {
                    parseContainerBody(p, container, model)
                    p.skipNewlines()
                    p.expect('RBRACE')
                }
                continue
            }

            if (kw === 'component') {
                const comp = parseComponent(p)
                if (comp) container.components.push(comp)
                continue
            }

            if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'status' || kw === 'owner') {
                parseElementPropertyOnElement(p, container, kw)
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

                if (p.check('KEYWORD') && p.peekValue().toLowerCase() === 'component') {
                    const comp = parseComponent(p, vn)
                    if (comp) container.components.push(comp)
                } else {
                    p.skipUnknownDirective()
                }
                continue
            }

            if (p.check('ARROW')) {
                p.pos = saved
                if (model) {
                    const rel = parseRelationship(p)
                    if (rel) model.relationships.push(rel)
                } else {
                    p.skipToNextLine()
                }
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

function parseComponent(p: ContextAwareParser, varName?: string): Component | null {
    p.advance() // consume 'component'
    const name = p.readString()
    const description = p.readOptionalString() || undefined
    const technology = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const id = varName ?? nextId()
    const component: Component = {
        id,
        type: 'component',
        name,
        description,
        technology,
        tags: p.buildTags('Element', 'Component', tagsStr),
        properties: {},
    }

    p.registerElement(id, name, 'component', varName)

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        parseSimpleElementBlock(p, component)
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return component
}

function parseSimpleElementBlock(p: ContextAwareParser, element: Person | Component): void {
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()
        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD' && token.value.startsWith('!')) {
            p.advance()
            p.skipToNextLine()
            continue
        }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()
            if (kw === 'tags' || kw === 'description' || kw === 'technology' || kw === 'url' || kw === 'properties' || kw === 'perspectives' || kw === 'location' || kw === 'status' || kw === 'owner') {
                parseElementPropertyOnElement(p, element, kw)
                continue
            }
            p.advance()
            p.skipUnknownDirective()
            continue
        }

        p.advance()
    }
}

function parseElementPropertyOnElement(p: ContextAwareParser, element: Element, keyword: string): void {
    p.advance()

    if (keyword === 'tags') {
        while (p.check('STRING') || p.check('IDENTIFIER')) {
            const tagVal = p.advance().value
            for (const t of tagVal.split(',')) {
                const trimmed = t.trim()
                if (trimmed && !element.tags.includes(trimmed)) {
                    element.tags.push(trimmed)
                }
            }
        }
    } else if (keyword === 'description') {
        const val = p.readOptionalString()
        if (val !== undefined) element.description = val
    } else if (keyword === 'technology') {
        const val = p.readOptionalString()
        if (val !== undefined && 'technology' in element) {
            (element as Container | Component).technology = val
        }
    } else if (keyword === 'url') {
        const val = p.readOptionalString()
        if (val !== undefined) element.url = val
    } else if (keyword === 'status') {
        const val = p.peek()
        if (val.type === 'IDENTIFIER' || val.type === 'KEYWORD' || val.type === 'STRING') {
            const s = p.advance().value
            if (s === 'Live' || s === 'Planned' || s === 'Deprecated' || s === 'Removed') {
                element.status = s
            }
        }
    } else if (keyword === 'owner') {
        const val = p.readOptionalString()
        if (val !== undefined) element.owner = val
    } else if (keyword === 'location') {
        const val = p.peek()
        if (val.type === 'IDENTIFIER' || val.type === 'KEYWORD') {
            const loc = p.advance().value
            if (element.type === 'person' || element.type === 'softwareSystem') {
                if (loc === 'External') (element as Person | SoftwareSystem).location = 'External'
                else if (loc === 'Internal') (element as Person | SoftwareSystem).location = 'Internal'
            }
        }
    } else if (keyword === 'properties') {
        p.skipNewlines()
        if (p.match('LBRACE')) {
            parsePropertiesBlock(p, element)
            p.skipNewlines()
            p.expect('RBRACE')
        }
    } else if (keyword === 'perspectives') {
        p.skipNewlines()
        p.skipBraceBlock()
    }
}

/** Parse a `properties { "key" "value" ... }` block and attach known
 *  keys to the element. Recognizes `c4hero.location` for Person/SoftwareSystem. */
function parsePropertiesBlock(p: ContextAwareParser, element: Element): void {
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break
        const token = p.peek()
        if (token.type === 'COMMENT') { p.advance(); continue }
        if (token.type !== 'STRING' && token.type !== 'IDENTIFIER') { p.advance(); continue }
        const key = p.advance().value
        const valTok = p.peek()
        let val: string | undefined
        if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
            val = p.advance().value
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

// Re-export Workspace for type compatibility with parseModelBody calls
export type { Workspace }
