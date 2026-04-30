import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportAsJSON, downloadFile, downloadBlob, exportCanvasAsSVG } from './exportUtils'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    description: '',
    scope: 'SoftwareSystem',
    model: {
      people: [],
      softwareSystems: [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      styles: { elements: [], relationships: [] },
    },
  } as unknown as Workspace
}

describe('exportAsJSON', () => {
  it('serializes a workspace to pretty-printed JSON', () => {
    const ws = makeWorkspace()
    const json = exportAsJSON(ws)
    expect(json).toContain('"name": "Test"')
    expect(json).toContain('"scope": "SoftwareSystem"')
  })

  it('produces parseable JSON', () => {
    const ws = makeWorkspace()
    const json = exportAsJSON(ws)
    const parsed = JSON.parse(json)
    expect(parsed.name).toBe('Test')
  })

  it('uses 2-space indentation', () => {
    const ws = makeWorkspace()
    const json = exportAsJSON(ws)
    expect(json).toContain('  "name"')
  })
})

describe('downloadFile / downloadBlob', () => {
  let createdAnchors: HTMLAnchorElement[]
  let appendSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createdAnchors = []
    // Track <a> elements created; capture the one that downloadBlob creates
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag)
      if (tag === 'a') createdAnchors.push(el as HTMLAnchorElement)
      return el
    })
    appendSpy = vi.spyOn(document.body, 'appendChild')
    removeSpy = vi.spyOn(document.body, 'removeChild')
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    // jsdom doesn't implement URL.createObjectURL
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn()
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloadFile creates an anchor, sets download and href, and clicks it', () => {
    downloadFile('hello world', 'test.txt', 'text/plain')
    expect(createdAnchors.length).toBeGreaterThan(0)
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('test.txt')
    expect(a.href).toBe('blob:mock-url')
    expect(clickSpy).toHaveBeenCalled()
    expect(appendSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
  })

  it('sanitizes path separators in the filename', () => {
    downloadBlob(new Blob(['x']), 'foo/bar/baz.dsl')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('foo_bar_baz.dsl')
  })

  it('sanitizes Windows-reserved characters', () => {
    downloadBlob(new Blob(['x']), 'a:b*c?d"e<f>g|h.json')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('a_b_c_d_e_f_g_h.json')
  })

  it('replaces backslashes', () => {
    downloadBlob(new Blob(['x']), 'foo\\bar.txt')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('foo_bar.txt')
  })

  it('replaces leading dots to prevent hidden files', () => {
    downloadBlob(new Blob(['x']), '...hidden.txt')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('_hidden.txt')
  })

  it('leaves safe filenames untouched', () => {
    downloadBlob(new Blob(['x']), 'workspace-2026-04-12.dsl')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('workspace-2026-04-12.dsl')
  })

  it('trims whitespace around downloaded filenames', () => {
    downloadBlob(new Blob(['x']), '  workspace.dsl  ')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('workspace.dsl')
  })

  it('replaces control characters in downloaded filenames', () => {
    downloadBlob(new Blob(['x']), 'line\nbreak.dsl')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('line_break.dsl')
  })

  it('falls back when filename has no usable characters', () => {
    downloadBlob(new Blob(['x']), '...')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('download')
  })

  it('prefixes Windows reserved filenames', () => {
    downloadBlob(new Blob(['x']), 'CON.dsl')
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download).toBe('_CON.dsl')
  })

  it('limits very long downloaded filenames', () => {
    downloadBlob(new Blob(['x']), `${'a'.repeat(220)}.dsl`)
    const a = createdAnchors[createdAnchors.length - 1]
    expect(a.download.length).toBe(180)
  })

  it('revokes the object URL after click', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    downloadBlob(new Blob(['x']), 'test.txt')
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url')
  })
})

describe('exportCanvasAsSVG', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('strips scripts, event handlers, and unsafe URL references', () => {
    document.body.innerHTML = `
      <div class="react-flow__viewport">
        <div onclick="alert(1)" style="background-image: url(javascript:alert(1)); color: red">
          <script>alert(1)</script>
          <a href="javascript:alert(1)">bad</a>
        </div>
      </div>
    `

    const svg = exportCanvasAsSVG()

    expect(svg).not.toBeNull()
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('onclick')
    expect(svg).not.toContain('javascript:')
  })

  it('preserves fragment URL references used by SVG markers', () => {
    document.body.innerHTML = `
      <div class="react-flow__viewport">
        <svg><path marker-end="url(#c4-arrow)" d="M0 0 L1 1"></path></svg>
      </div>
    `

    const svg = exportCanvasAsSVG()

    expect(svg).toContain('url(#c4-arrow)')
  })
})
