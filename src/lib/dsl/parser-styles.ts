// DSL parser — `styles { ... }` block handling.
//
// Extracted from parser.ts to keep the per-section parsing logic localized.
// The functions here are standalone (no `this`) and take the parser as their
// first argument so they can access the shared token-navigation helpers
// (peek/advance/check/expect/readString/readStyleValue) without inheriting
// the entire 1.6k-line parser class.

import type { ElementStyle, RelationshipStyle, ViewConfiguration } from '@/types/model'
import type { ContextAwareParser } from './parser'

export function parseStylesBody(p: ContextAwareParser, config: ViewConfiguration): void {
    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()
        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD') {
            const kw = token.value.toLowerCase()

            if (kw === 'element') {
                p.advance()
                const style = parseElementStyleBlock(p)
                if (style) config.styles.elements.push(style)
                continue
            }

            if (kw === 'relationship') {
                p.advance()
                const style = parseRelationshipStyleBlock(p)
                if (style) config.styles.relationships.push(style)
                continue
            }
        }

        p.advance()
    }
}

function parseElementStyleBlock(p: ContextAwareParser): ElementStyle | null {
    const tag = p.readString()
    const style: ElementStyle = { tag }

    p.skipNewlines()
    if (!p.match('LBRACE')) return style

    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()
        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
            const prop = p.advance().value.toLowerCase()
            applyStyleProperty(p, style, prop)
            continue
        }

        p.advance()
    }

    p.skipNewlines()
    p.expect('RBRACE')

    return style
}

function parseRelationshipStyleBlock(p: ContextAwareParser): RelationshipStyle | null {
    const tag = p.readString()
    const style: RelationshipStyle = { tag }

    p.skipNewlines()
    if (!p.match('LBRACE')) return style

    while (!p.check('RBRACE') && p.peekType() !== 'EOF') {
        p.skipNewlines()
        if (p.check('RBRACE') || p.peekType() === 'EOF') break

        const token = p.peek()
        if (token.type === 'COMMENT') { p.advance(); continue }

        if (token.type === 'KEYWORD' || token.type === 'IDENTIFIER') {
            const prop = p.advance().value.toLowerCase()
            applyRelStyleProperty(p, style, prop)
            continue
        }

        p.advance()
    }

    p.skipNewlines()
    p.expect('RBRACE')

    return style
}

function applyStyleProperty(p: ContextAwareParser, style: ElementStyle, prop: string): void {
    const val = p.readStyleValue()
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

function applyRelStyleProperty(p: ContextAwareParser, style: RelationshipStyle, prop: string): void {
    const val = p.readStyleValue()
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
