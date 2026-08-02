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
                        if (valTok.type === 'STRING' || valTok.type === 'IDENTIFIER' || valTok.type === 'NUMBER') {
                            rel.properties[key] = p.advance().value
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

    applyRelationshipConventions(rel)
    return rel
}

/**
 * Hoist the property-encoded `lineStyle` / `interactionStyle` back onto the
 * relationship fields. Structurizr rejects both as bare keywords in a
 * relationship body, so the serializer emits them as `c4hero.lineStyle` /
 * `c4hero.interactionStyle` properties. The legacy bare keywords are still
 * accepted by the block parser above and win when both forms appear; only
 * valid enum members are hoisted — anything else stays a plain property so no
 * value is silently lost.
 */
function applyRelationshipConventions(rel: Relationship): void {
    const lineStyle = rel.properties['c4hero.lineStyle']
    if (lineStyle !== undefined && rel.lineStyle === undefined) {
        if (lineStyle === 'Curved' || lineStyle === 'Straight' || lineStyle === 'Orthogonal') {
            rel.lineStyle = lineStyle
            delete rel.properties['c4hero.lineStyle']
        }
    }
    const interactionStyle = rel.properties['c4hero.interactionStyle']
    if (interactionStyle !== undefined && rel.interactionStyle === undefined) {
        if (interactionStyle === 'Synchronous' || interactionStyle === 'Asynchronous') {
            rel.interactionStyle = interactionStyle
            delete rel.properties['c4hero.interactionStyle']
        }
    }
}
