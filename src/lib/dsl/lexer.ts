// Structurizr DSL Lexer — tokenizes DSL source text into a stream of tokens
// with line/column tracking for error reporting.

export type TokenType =
    | 'KEYWORD'
    | 'IDENTIFIER'
    | 'STRING'
    | 'ARROW'
    | 'LBRACE'
    | 'RBRACE'
    | 'EQUALS'
    | 'STAR'
    | 'DOT'
    | 'NEWLINE'
    | 'COMMENT'
    | 'NUMBER'
    | 'EOF'

export interface Token {
    type: TokenType
    value: string
    line: number
    column: number
}

const KEYWORDS = new Set([
    'workspace',
    'model',
    'views',
    'person',
    'softwareSystem',
    'softwaresystem',
    'container',
    'component',
    'group',
    'enterprise',
    'element',
    'relationship',
    'styles',
    'systemLandscape',
    'systemlandscape',
    'systemContext',
    'systemcontext',
    'dynamic',
    'deployment',
    'filtered',
    'custom',
    'include',
    'exclude',
    'autoLayout',
    'autolayout',
    'animation',
    'title',
    'description',
    'technology',
    'tags',
    'url',
    'properties',
    'perspectives',
    'extends',
    'theme',
    'themes',
    'branding',
    'terminology',
    'configuration',
    'users',
    'deploymentEnvironment',
    'deploymentNode',
    'infrastructureNode',
    'softwareSystemInstance',
    'containerInstance',
    'healthCheck',
    'default',
    'location',
    'status',
    'owner',
])

// Directives that start opaque pass-through blocks
const OPAQUE_DIRECTIVES = new Set([
    '!script',
    '!docs',
    '!adrs',
    '!include',
    '!const',
    '!var',
    '!element',
    '!relationship',
    // Workspace-level configuration directives — consume whole line, no-op
    '!identifiers',
    '!impliedRelationships',
    '!extend',
    '!plugin',
])

export interface LexerError {
    message: string
    line: number
    column: number
}

export interface LexResult {
    tokens: Token[]
    errors: LexerError[]
}

// Pre-fix c4hero artefact lines: keywords the real Structurizr parser never
// accepts inside element/relationship blocks (`location`, bare `owner`,
// `status`, `lineStyle`, `interactionStyle`). Their presence marks a file as
// having been written by an older c4hero version.
const LEGACY_KEYWORD_LINE =
    /^\s*(location\s+(External|Internal)|owner\s+"|status\s+(Live|Planned|Deprecated|Removed)|lineStyle\s+|interactionStyle\s+)/m

/**
 * Detect whether `input` was produced by a pre-fix c4hero version that
 * doubled backslashes and unescaped BOTH `\n` and `\t` on load (real
 * Structurizr, measured, unescapes `\n` into a real newline but leaves
 * `\t` as two literal characters -- see GROUND TRUTH in dsl-strings.ts).
 * The modern serializer never emits a backslash immediately before `n`
 * (it strips the run at emission time -- dsl-strings.ts), so a modern
 * document never contains `\n` for this function or the lexer's modern
 * path to worry about; the legacy path below still decodes it for
 * pre-fix files that do contain it.
 *
 *   The document is legacy iff it contains at least one line matching
 *   LEGACY_KEYWORD_LINE above -- `location`/bare `owner`/`status`/
 *   `lineStyle`/`interactionStyle` are never emitted by any DSL writer
 *   except pre-fix c4hero (real Structurizr rejects them outright inside
 *   element/relationship blocks -- see GROUND TRUTH in dsl-strings.ts), so
 *   this line's presence is unambiguous, positive proof of pre-fix origin.
 *
 * The keyword-line marker is the ONLY signal used. An earlier version of
 * this function also treated a `\\` (doubled-backslash) sighting inside a
 * string, or a backslash-run-parity argument, as a second, independent
 * legacy signal. Both were content-based heuristics operating on the same
 * bytes a real value can legitimately contain, so they were provably
 * unsound: `serializeDSL` never doubles a backslash and never escapes
 * anything but a literal quote (see dsl-strings.ts), so ANY backslash
 * pattern -- one run, many runs, odd length, even length, adjacent to `n`/
 * `t`/`"`/another `\`, anywhere in the document -- can legitimately appear
 * in a modern value (e.g. a Windows UNC path `\\HOST-01\temp`, or a value
 * that is simply two literal backslashes `a\\b`). There is no backslash
 * shape a content-based heuristic can treat as "legacy evidence" without
 * also matching some real modern value and corrupting it on load. Only the
 * keyword-line marker is structurally impossible for the modern serializer
 * to produce, so it is the only condition allowed to flip this flag.
 *
 * Residual, deliberately accepted ambiguity (documented per the task, not
 * an oversight): a genuinely pre-fix file whose ONLY legacy artefacts are
 * escape sequences inside string values -- a doubled `\\` for a real
 * backslash, or a `\n`/`\t` for a real newline/tab -- with NO
 * location/owner/status/lineStyle/interactionStyle line anywhere in the
 * whole document, is no longer detected as legacy. Its doubled backslashes
 * and `\n`/`\t` sequences load as the literal characters they are, not as
 * the halved backslash / decoded newline-tab the pre-fix writer intended.
 * This is the necessary trade-off for eliminating the false positive: any
 * content-based rule permissive enough to catch that residual case is also
 * permissive enough to silently corrupt a modern value that happens to
 * contain the same bytes, which is strictly worse (active, silent data
 * loss on every save/reload of a document nobody wrote with a legacy tool,
 * vs. a one-time, non-destructive miss on the increasingly rare file that
 * both predates the fix AND never uses `location`/`owner`/`status`/
 * `lineStyle`/`interactionStyle` anywhere).
 */
export function detectLegacyEscapes(input: string): boolean {
    return LEGACY_KEYWORD_LINE.test(input)
}

export function lex(input: string): LexResult {
    const tokens: Token[] = []
    const errors: LexerError[] = []
    const legacyEscapes = detectLegacyEscapes(input)
    let pos = 0
    let line = 1
    let column = 1

    function peek(): string {
        return pos < input.length ? input[pos] : '\0'
    }

    function peekAt(offset: number): string {
        const idx = pos + offset
        return idx < input.length ? input[idx] : '\0'
    }

    function advance(): string {
        const ch = input[pos]
        pos++
        if (ch === '\n') {
            line++
            column = 1
        } else {
            column++
        }
        return ch
    }

    function skipWhitespaceExceptNewline(): void {
        while (pos < input.length) {
            const ch = input[pos]
            if (ch === ' ' || ch === '\t' || ch === '\r') {
                advance()
            } else {
                break
            }
        }
    }

    function readString(): Token {
        const startLine = line
        const startCol = column
        advance() // consume opening "
        let value = ''
        while (pos < input.length && peek() !== '"') {
            if (peek() === '\\') {
                advance()
                const escaped = peek()
                // `\"` always decodes to `"` -- this matches real Structurizr
                // exactly, in both legacy and modern documents.
                if (escaped === '"') {
                    value += advance()
                } else if (legacyEscapes && (escaped === '\\' || escaped === 'n' || escaped === 't')) {
                    // Pre-fix c4hero output unescaped all three of these
                    // two-char sequences on load, so a legacy document must
                    // still be decoded that way for backward compatibility.
                    // Real Structurizr itself only unescapes `\n` (measured,
                    // see GROUND TRUTH in dsl-strings.ts) and leaves `\\`/
                    // `\t` as literal characters -- but that distinction is
                    // moot here: the modern serializer never emits a
                    // backslash before `n` at all (it strips the run at
                    // emission time), so a MODERN document never contains
                    // `\n` for this branch to see in the first place; this
                    // branch only ever fires for legacy-marked documents,
                    // where decoding `\n` here matches what the old,
                    // now-removed sanitisation used to intend.
                    advance()
                    if (escaped === 'n') value += '\n'
                    else if (escaped === 't') value += '\t'
                    else value += '\\'
                } else {
                    // A backslash not followed by `"` (or, in legacy mode,
                    // one of `\`/`n`/`t`) is a literal backslash -- e.g.
                    // `"C:\folder"` reads back as `C:\folder`.
                    value += '\\'
                }
            } else {
                value += advance()
            }
        }
        if (pos < input.length) {
            advance() // consume closing "
        } else {
            errors.push({
                message: 'Unterminated string literal',
                line: startLine,
                column: startCol,
            })
        }
        return { type: 'STRING', value, line: startLine, column: startCol }
    }

    function readWord(): Token {
        const startLine = line
        const startCol = column
        let value = ''

        // Handle directive words starting with !
        if (peek() === '!') {
            value += advance()
        }

        while (pos < input.length) {
            const ch = peek()
            if (/[a-zA-Z0-9_]/.test(ch)) {
                value += advance()
            } else {
                break
            }
        }

        // Check if this is an opaque directive
        if (OPAQUE_DIRECTIVES.has(value)) {
            // Read the rest of the line as part of the value
            let rest = ''
            while (pos < input.length && peek() !== '\n') {
                rest += advance()
            }
            return { type: 'KEYWORD', value: value + rest, line: startLine, column: startCol }
        }

        const type = KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER'
        return { type, value, line: startLine, column: startCol }
    }

    function readNumber(): Token {
        const startLine = line
        const startCol = column
        let value = ''
        while (pos < input.length && /[0-9]/.test(peek())) {
            value += advance()
        }
        return { type: 'NUMBER', value, line: startLine, column: startCol }
    }

    function readHexValue(): Token {
        const startLine = line
        const startCol = column
        let value = ''
        value += advance() // consume #
        while (pos < input.length && /[0-9a-fA-F]/.test(peek())) {
            value += advance()
        }
        return { type: 'IDENTIFIER', value, line: startLine, column: startCol }
    }

    function readLineComment(): Token {
        const startLine = line
        const startCol = column
        let value = ''
        // consume // or #
        if (peek() === '#') {
            value += advance()
        } else {
            value += advance() // first /
            value += advance() // second /
        }
        while (pos < input.length && peek() !== '\n') {
            value += advance()
        }
        return { type: 'COMMENT', value, line: startLine, column: startCol }
    }

    function readBlockComment(): Token {
        const startLine = line
        const startCol = column
        let value = ''
        value += advance() // /
        value += advance() // *
        while (pos < input.length) {
            if (peek() === '*' && peekAt(1) === '/') {
                value += advance() // *
                value += advance() // /
                break
            }
            value += advance()
        }
        if (!value.endsWith('*/')) {
            errors.push({
                message: 'Unterminated block comment',
                line: startLine,
                column: startCol,
            })
        }
        return { type: 'COMMENT', value, line: startLine, column: startCol }
    }

    while (pos < input.length) {
        skipWhitespaceExceptNewline()
        if (pos >= input.length) break

        const ch = peek()
        const startLine = line
        const startCol = column

        if (ch === '\n') {
            advance()
            tokens.push({ type: 'NEWLINE', value: '\n', line: startLine, column: startCol })
            continue
        }

        if (ch === '"') {
            tokens.push(readString())
            continue
        }

        if (ch === '{') {
            advance()
            tokens.push({ type: 'LBRACE', value: '{', line: startLine, column: startCol })
            continue
        }

        if (ch === '}') {
            advance()
            tokens.push({ type: 'RBRACE', value: '}', line: startLine, column: startCol })
            continue
        }

        if (ch === '=') {
            advance()
            tokens.push({ type: 'EQUALS', value: '=', line: startLine, column: startCol })
            continue
        }

        if (ch === '*') {
            advance()
            tokens.push({ type: 'STAR', value: '*', line: startLine, column: startCol })
            continue
        }

        if (ch === '.') {
            // The dot separates the segments of a hierarchical (qualified)
            // identifier — `mpng.gatewayApi`, `pathways.navigatorApi.jwksController` —
            // and also appears in `element.type==X` / `element.parent==X`
            // expressions inside `include` / `exclude` statements. It stays a
            // standalone token: the parser joins segments via readQualifiedRef()
            // and tells the two forms apart by looking ahead for `==`.
            advance()
            tokens.push({ type: 'DOT', value: '.', line: startLine, column: startCol })
            continue
        }

        if (ch === '-' && peekAt(1) === '>') {
            advance()
            advance()
            tokens.push({ type: 'ARROW', value: '->', line: startLine, column: startCol })
            continue
        }

        if (ch === '/' && peekAt(1) === '/') {
            tokens.push(readLineComment())
            continue
        }

        if (ch === '/' && peekAt(1) === '*') {
            tokens.push(readBlockComment())
            continue
        }

        if (ch === '#') {
            // Distinguish hex color values (#ffffff) from # comments
            const nextCh = peekAt(1)
            if (/[0-9a-fA-F]/.test(nextCh)) {
                // Hex color value — read as identifier
                tokens.push(readHexValue())
            } else {
                tokens.push(readLineComment())
            }
            continue
        }

        if (/[0-9]/.test(ch)) {
            tokens.push(readNumber())
            continue
        }

        if (/[a-zA-Z_!]/.test(ch)) {
            tokens.push(readWord())
            continue
        }

        // Unknown character — skip and report
        errors.push({
            message: `Unexpected character: '${ch}'`,
            line: startLine,
            column: startCol,
        })
        advance()
    }

    tokens.push({ type: 'EOF', value: '', line, column })
    return { tokens, errors }
}
