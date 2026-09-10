import { describe, it, expect } from 'vitest'
import { splitArgs, unquote, tokenizeMacroLines, args } from './macroCall'

describe('splitArgs', () => {
  it('splits on top-level commas only', () => {
    expect(splitArgs('a, "b, c", d(e, f), \'g,h\'')).toEqual(['a', '"b, c"', 'd(e, f)', "'g,h'"])
  })
  it('keeps an escaped quote inside a string', () => {
    expect(splitArgs('"say \\"hi\\", ok", 2')).toEqual(['"say \\"hi\\", ok"', '2'])
  })
  it('returns [] for an empty list', () => {
    expect(splitArgs('')).toEqual([])
  })
})

describe('unquote', () => {
  it('strips matching quotes and decodes \\n and \\"', () => {
    expect(unquote('"a\\nb \\"c\\""')).toBe('a\nb "c"')
    expect(unquote("'x'")).toBe('x')
    expect(unquote('bare')).toBe('bare')
    expect(unquote('"unterminated')).toBe('"unterminated')
  })
})

describe('tokenizeMacroLines', () => {
  it('recognises calls, blocks, bare lines and skips comments', () => {
    const lines = tokenizeMacroLines(`@startuml
' a comment
%% another
System_Boundary(c1, "Bank") {
  Container(web, "Web App", "Java", "Serves pages")
}
Rel(a, b, "Uses")
`)
    expect(lines.map((l) => l.kind)).toEqual(['bare', 'call', 'call', 'close', 'call'])
    const boundary = lines[1]
    expect(boundary.kind === 'call' && boundary.name).toBe('System_Boundary')
    expect(boundary.kind === 'call' && boundary.opensBlock).toBe(true)
    expect(boundary.line).toBe(4)
    const web = lines[2]
    expect(web.kind === 'call' && web.positional).toEqual(['web', 'Web App', 'Java', 'Serves pages'])
  })

  it('parses $named arguments and lets them override positional order', () => {
    const [l] = tokenizeMacroLines('Person($alias="p1", $label="Someone", $descr="d")')
    expect(l.kind === 'call' && l.named).toEqual({ alias: 'p1', label: 'Someone', descr: 'd' })
    const a = args(l as Extract<typeof l, { kind: 'call' }>, ['alias', 'label', 'descr'])
    expect(a).toEqual({ alias: 'p1', label: 'Someone', descr: 'd' })
  })

  it('treats empty strings as not given', () => {
    const [l] = tokenizeMacroLines('Container(c, "C", "", "desc")')
    const a = args(l as Extract<typeof l, { kind: 'call' }>, ['alias', 'label', 'techn', 'descr'])
    expect(a.techn).toBeUndefined()
    expect(a.descr).toBe('desc')
  })
})
