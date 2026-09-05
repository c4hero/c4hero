import { StreamLanguage } from '@codemirror/language'

// Keyword set mirrors what the DSL lexer/parser recognize (lexer.ts KEYWORDS +
// view/style block openers). Highlighting only — unknown words fall through as
// plain identifiers, so this list going stale never breaks editing.
const KEYWORDS = new Set([
  'workspace', 'model', 'views', 'configuration', 'properties',
  'person', 'softwaresystem', 'container', 'component', 'group',
  'deploymentenvironment', 'deploymentnode', 'infrastructurenode',
  'containerinstance', 'softwaresysteminstance',
  'systemlandscape', 'systemcontext', 'containers', 'components',
  'dynamic', 'deployment', 'filtered', 'custom', 'image',
  'include', 'exclude', 'autolayout', 'animation',
  'styles', 'element', 'relationship', 'theme', 'themes', 'branding', 'terminology',
  'tags', 'description', 'technology', 'url', 'title', 'scope',
  'docs', 'adrs', 'identifiers', 'impliedrelationships',
])

const PROPERTY_WORDS = new Set([
  'background', 'color', 'colour', 'shape', 'fontsize', 'border', 'opacity',
  'icon', 'stroke', 'strokewidth', 'thickness', 'dashed', 'width', 'height',
  'location', 'owner', 'status', 'instances', 'routing',
])

interface StructurizrStreamState {
  inBlockComment: boolean
}

/** Minimal Structurizr DSL highlighting for the code pane. Comment rules match
 *  the app's own lexer: `//` and `#` line comments (a `#` followed by 3/6/8 hex
 *  digits is a color literal, not a comment), plus slash-star block comments. */
export const structurizrLanguage = StreamLanguage.define<StructurizrStreamState>({
  name: 'structurizr',
  startState: () => ({ inBlockComment: false }),
  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match(/^.*?\*\//)) state.inBlockComment = false
      else stream.skipToEnd()
      return 'comment'
    }
    if (stream.eatSpace()) return null

    if (stream.match('//')) { stream.skipToEnd(); return 'comment' }
    if (stream.match('/*')) {
      state.inBlockComment = true
      if (stream.match(/^.*?\*\//)) state.inBlockComment = false
      else stream.skipToEnd()
      return 'comment'
    }
    if (stream.peek() === '#') {
      if (stream.match(/^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/)) return 'color'
      stream.skipToEnd()
      return 'comment'
    }

    if (stream.match('"')) {
      // Quoted string with backslash escapes (see lexer.ts scanQuotedString).
      let escaped = false
      while (!stream.eol()) {
        const ch = stream.next()
        if (escaped) { escaped = false; continue }
        if (ch === '\\') { escaped = true; continue }
        if (ch === '"') break
      }
      return 'string'
    }

    if (stream.match('->')) return 'operator'
    if (stream.match('=')) return 'operator'
    if (stream.match(/^[{}]/)) return 'brace'
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number'
    if (stream.match('*')) return 'operator'
    if (stream.match('!')) return 'meta' // directive prefix (!docs, !adrs, ...)

    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_.-]*/)
    if (word) {
      const lower = (word as RegExpMatchArray)[0].toLowerCase()
      if (KEYWORDS.has(lower)) return 'keyword'
      if (PROPERTY_WORDS.has(lower)) return 'propertyName'
      return 'variableName'
    }

    stream.next()
    return null
  },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
})
