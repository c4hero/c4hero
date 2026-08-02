// DSL parser — relationship statement (`a -> b "..."`) handling.

import type { Relationship, InteractionStyle, LineStyle } from '@/types/model'
import type { ContextAwareParser } from './parser'

export function parseRelationship(p: ContextAwareParser): Relationship | null {
    // Both endpoints may be qualified paths (`mpng.gatewayApi`,
    // `pathways.navigatorApi.jwksController`), so consume the whole path —
    // reading a single token would bind the relationship to the parent element
    // and leave the remaining segments sitting in the description slot.
    const source = p.readQualifiedRef()
    if (!source) {
        p.addError(`Expected relationship source, got ${p.peekType()}`, p.peek())
        p.skipToNextLine()
        return null
    }
    const sourceToken = source.token
    p.skipNewlines()
    p.expect('ARROW')

    const dest = p.readQualifiedRef()
    if (!dest) {
        p.addError(`Expected relationship destination, got ${p.peekType()}`, p.peek())
        p.skipToNextLine()
        return null
    }
    const destRef = dest.ref
    const destToken = dest.token

    const description = p.readOptionalString() || undefined
    const technology = p.readOptionalString() || undefined
    const tagsStr = p.readOptionalString()

    const sourceId = p.resolveRef(source.ref)
    const destId = p.resolveRef(destRef)

    if (!sourceId) {
        p.addError(`Unresolved reference: '${source.ref}'`, sourceToken)
    }
    if (!destId) {
        p.addError(`Unresolved reference: '${destRef}'`, destToken)
    }

    p.relCounter++
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
        id: `rel-${p.relCounter}`,
        sourceId: sourceId ?? source.ref,
        destinationId: destId ?? destRef,
        description,
        technology,
        tags: initialTags,
        properties: {},
    }

    p.skipNewlines()
    if (p.check('LBRACE')) {
        p.advance()
        // Parse relationship block
        while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
            p.skipNewlines()
            if (p.check('RBRACE') || p.peekType() === 'EOF') break

            if (p.peekType() === 'COMMENT') { p.advance(); continue }
            if (p.peekType() === 'KEYWORD' && p.peekValue().toLowerCase() === 'tags') {
                p.advance()
                while (p.check('STRING') || p.check('IDENTIFIER')) {
                    const tagVal = p.advance().value
                    for (const t of tagVal.split(',')) {
                        const trimmed = t.trim()
                        // Deduplicate: don't re-add tags already in the list
                        if (trimmed && !rel.tags.includes(trimmed)) rel.tags.push(trimmed)
                    }
                }
                continue
            }
            if (p.peekType() === 'KEYWORD' && p.peekValue().toLowerCase() === 'properties') {
                p.advance()
                p.skipNewlines()
                if (p.check('LBRACE')) {
                    p.advance()
                    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
                        p.skipNewlines()
                        if (p.check('RBRACE') || p.peekType() === 'EOF') break
                        if (p.peekType() === 'COMMENT') { p.advance(); continue }
                        if (p.peek().type !== 'STRING' && p.peek().type !== 'IDENTIFIER') { p.advance(); continue }
                        const key = p.advance().value
                        const valTok = p.peek()
                        let val: string | undefined
                        if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                            val = p.advance().value
                        }
                        if (val === undefined) continue
                        // Real Structurizr rejects bare `lineStyle`/`interactionStyle` keywords
                        // inside a relationship's `properties { }` block (only description, tags,
                        // url, properties, perspectives are accepted there), so c4hero encodes
                        // them as reserved property keys instead. Consume recognized keys with
                        // valid enum values; fall back to a plain property so nothing is lost
                        // for an unrecognized value.
                        if (key === 'c4hero.lineStyle') {
                            if (val === 'Curved' || val === 'Straight' || val === 'Orthogonal') {
                                rel.lineStyle = val as LineStyle
                            } else {
                                rel.properties[key] = val
                            }
                        } else if (key === 'c4hero.interactionStyle') {
                            if (val === 'Synchronous' || val === 'Asynchronous') {
                                rel.interactionStyle = val as InteractionStyle
                            } else {
                                rel.properties[key] = val
                            }
                        } else {
                            rel.properties[key] = val
                        }
                    }
                    if (p.check('RBRACE')) p.advance()
                }
                continue
            }
            // 'interactionStyle' is not a reserved keyword so it arrives as IDENTIFIER
            if ((p.peekType() === 'IDENTIFIER' || p.peekType() === 'KEYWORD') &&
                p.peekValue().toLowerCase() === 'interactionstyle') {
                p.advance()
                const valTok = p.peek()
                if (valTok.type === 'IDENTIFIER' || valTok.type === 'KEYWORD') {
                    const raw = p.advance().value
                    if (raw === 'Synchronous' || raw === 'Asynchronous') {
                        rel.interactionStyle = raw as InteractionStyle
                    }
                }
                continue
            }
            // 'description' in relationship body (Structurizr keyword form)
            // Prefer the block keyword over any inline positional description already read.
            if (p.peekType() === 'KEYWORD' && p.peekValue().toLowerCase() === 'description') {
                p.advance()
                const val = p.readOptionalString()
                if (val !== undefined) rel.description = val
                continue
            }
            // 'technology' in relationship body (Structurizr keyword form)
            if (p.peekType() === 'KEYWORD' && p.peekValue().toLowerCase() === 'technology') {
                p.advance()
                const val = p.readOptionalString()
                if (val !== undefined) rel.technology = val
                continue
            }
            // 'url' in relationship body
            if (p.peekType() === 'KEYWORD' && p.peekValue().toLowerCase() === 'url') {
                p.advance()
                if (p.peekType() === 'STRING') rel.url = p.advance().value
                continue
            }
            // 'lineStyle' in relationship body (Curved | Straight | Orthogonal)
            if ((p.peekType() === 'IDENTIFIER' || p.peekType() === 'KEYWORD') &&
                p.peekValue().toLowerCase() === 'linestyle') {
                p.advance()
                const valTok = p.peek()
                if (valTok.type === 'IDENTIFIER' || valTok.type === 'KEYWORD') {
                    const raw = p.advance().value
                    if (raw === 'Curved' || raw === 'Straight' || raw === 'Orthogonal') {
                        rel.lineStyle = raw as LineStyle
                    }
                }
                continue
            }
            // Unknown keyword/identifier — skip through end of line (stopping before any
            // inline LBRACE) and any following brace block so the block's closing RBRACE
            // isn't mistaken for the relationship body's own RBRACE.
            if (p.peek().type === 'KEYWORD' || p.peek().type === 'IDENTIFIER') {
                p.advance()
                p.skipUnknownDirective()
                continue
            }
            p.advance()
        }
        p.skipNewlines()
        p.expect('RBRACE')
    }

    return rel
}
