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
 * doubled backslashes and unescaped `\n`/`\t` (real Structurizr does
 * neither -- see dsl-strings.ts). The rule, applied once per `lex()` call:
 *
 *   The document is legacy iff
 *     (i)  every backslash found inside a quoted string literal is
 *          immediately followed by one of `"`, `\`, `n`, `t` (i.e. there is
 *          no backslash that could only make sense as a literal Windows
 *          path separator or similar), AND
 *     (ii) at least one `\\` (doubled-backslash) sequence occurs inside a
 *          string literal, OR the document contains at least one line
 *          matching LEGACY_KEYWORD_LINE above.
 *
 * Known false positive (documented, not fixed -- the rule is a heuristic):
 * a modern file whose only backslash sequences happen to look like `\\`
 * (e.g. a value that legitimately ends in two literal backslash characters
 * followed by `n`/`t`/`"`/`\`, such as `"a\\\\"` meaning two literal
 * backslashes) will be misdetected as legacy and have its backslashes
 * halved on load. This is considered acceptable: such values are rare, and
 * the alternative (never detecting legacy files) would break every
 * pre-existing c4hero-authored DSL file on disk.
 */
export function detectLegacyEscapes(input: string): boolean {
    let i = 0
    const n = input.length
    let allBackslashesValid = true
    let sawDoubleBackslash = false

    while (i < n) {
        if (input[i] !== '"') {
            i++
            continue
        }
        i++ // consume opening quote
        while (i < n && input[i] !== '"') {
            if (input[i] === '\\') {
                const next = input[i + 1]
                if (next === '"' || next === '\\' || next === 'n' || next === 't') {
                    if (next === '\\') sawDoubleBackslash = true
                    i += 2
                    continue
                }
                allBackslashesValid = false
                i += 1
                continue
            }
            i++
        }
        i++ // consume closing quote (or run off the end if unterminated)
    }

    return allBackslashesValid && (sawDoubleBackslash || LEGACY_KEYWORD_LINE.test(input))
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
                    // Only pre-fix c4hero output unescapes these two-char
                    // sequences; real Structurizr never does (see
                    // dsl-strings.ts), so a modern document keeps them as
                    // the two literal characters they are.
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
