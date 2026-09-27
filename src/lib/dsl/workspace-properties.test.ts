import { describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import { loadWorkspaceDocument, restitchWorkspaceDocument } from '@/lib/workspaceDocument'
import { planIncludedWrites, serializeRoot } from '@/lib/includeWriteback'
import { isWorkspaceShape } from '@/lib/fileIO'
import { findSerializationLoss } from '@/lib/serializationLoss'

const model = 'model {\n s = softwareSystem "S"\n}\nviews {}'

describe('workspace properties (#219)', () => {
  it('preserves properties before and after model/views across repeated saves', () => {
    const { workspace, errors } = parseDSL(`workspace "W" {
      properties {
        "team" "platform"
        "c4hero.statuses" "Proposed, Awaiting sign-off"
      }
      ${model}
      properties {
        // Later values override earlier values.
        "team" "architecture"
        "region" "eu"
      }
    }`)
    expect(errors).toEqual([])
    expect(workspace.properties).toEqual({ team: 'architecture', 'c4hero.statuses': 'Proposed, Awaiting sign-off', region: 'eu' })
    const saved = serializeDSL(workspace)
    expect(saved.indexOf('properties {')).toBeLessThan(saved.indexOf('model {'))
    const reopened = parseDSL(saved)
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.properties).toEqual(workspace.properties)
    expect(serializeDSL(reopened.workspace)).toBe(saved)
  })

  it('uses the existing property escaping and safely stores prototype-shaped keys', () => {
    const workspace = parseDSL(`workspace { ${model} }`).workspace
    workspace.properties = JSON.parse('{"__proto__":"ordinary value","constructor":"also ordinary"}')
    workspace.properties!.notes = 'A "quote"\nAnother line'
    workspace.properties!.path = 'C:\\Program Files'
    const reopened = parseDSL(serializeDSL(workspace))
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.properties).toEqual(workspace.properties)
    expect(Object.getPrototypeOf(reopened.workspace.properties)).toBe(Object.prototype)
    expect(Object.hasOwn(reopened.workspace.properties!, '__proto__')).toBe(true)
  })

  it('keeps workspace properties separate from element properties', () => {
    const { workspace, errors } = parseDSL(`workspace {
      properties { "owner" "workspace team" }
      model {
        s = softwareSystem "S" {
          properties { "owner" "element team" }
        }
      }
    }`)
    expect(errors).toEqual([])
    expect(workspace.properties).toEqual({ owner: 'workspace team' })
    expect(workspace.model.softwareSystems[0].owner).toBe('element team')
  })

  it('does not add properties blocks to old workspaces or empty blocks', () => {
    for (const prefix of ['', 'properties {}']) {
      const workspace = parseDSL(`workspace { ${prefix}\n${model}\n}`).workspace
      expect(workspace.properties).toBeUndefined()
      expect(serializeDSL(workspace)).not.toContain('properties {')
      expect(isWorkspaceShape(workspace)).toBe(true)
    }
  })

  it('reports a missing value without swallowing the next declaration', () => {
    const result = parseDSL(`workspace {
      properties {
        "missing"
        "team" "platform"
      }
      ${model}
    }`)
    expect(result.errors).toHaveLength(1)
    expect(result.workspace.properties).toEqual({ team: 'platform' })
    expect(result.workspace.model.softwareSystems).toHaveLength(1)
  })

  it('validates property values and provenance in recovery JSON', () => {
    const workspace = parseDSL(`workspace { ${model} }`).workspace
    const declarations = [{ key: 'team', value: 'platform', slot: 0, sourcePath: 'shared.dsl' }]
    expect(isWorkspaceShape({ ...workspace, properties: { team: 'platform' }, propertyDeclarations: declarations })).toBe(true)
    expect(isWorkspaceShape({ ...workspace, model: { ...workspace.model, properties: { team: 'platform' }, propertyDeclarations: declarations } })).toBe(true)
    const bad = {
      properties: [null, [], 'bad', { team: 42 }],
      propertyDeclarations: [null, 'bad', [{ key: 'team', value: 'x' }], [{ key: 'team', value: 'x', slot: -1 }], [{ key: 1, value: 'x', slot: 0 }]],
    }
    for (const [field, values] of Object.entries(bad)) {
      for (const value of values) {
        expect(isWorkspaceShape({ ...workspace, [field]: value })).toBe(false)
        expect(isWorkspaceShape({ ...workspace, model: { ...workspace.model, [field]: value } })).toBe(false)
      }
    }
  })
})

describe('workspace properties from included files', () => {
  it('keeps includes in order across workspace and properties scopes', async () => {
    const content = `workspace {
      properties {
        !include first.dsl
      }
      !include second.dsl
      ${model}
    }`
    const result = await loadWorkspaceDocument({
      content,
      readInclude: async (path) => path === 'first.dsl'
        ? '"team" "first"'
        : 'properties { "team" "second" }',
    })
    expect(result.errors).toEqual([])
    expect(result.workspace.properties?.team).toBe('second')
    const saved = serializeRoot(result.workspace)
    expect(saved.indexOf('!include first.dsl')).toBeLessThan(saved.indexOf('!include second.dsl'))
    const reopened = restitchWorkspaceDocument(saved, result.workspace)
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.properties?.team).toBe('second')
  })

  it.each([true, false])('preserves overrides when the root block follows the include: %s', async (rootLast) => {
    const rootBlock = 'properties {\n "team" "root"\n "root-only" "kept"\n "constructor" "root key"\n}'
    const include = '!include shared.dsl'
    const content = `workspace {\n${rootLast ? include + '\n' + rootBlock : rootBlock + '\n' + include}\n${model}\n}`
    const readInclude = async () => 'properties {\n "team" "included"\n "shared-only" "kept"\n "__proto__" "included key"\n}'
    const { workspace, errors } = await loadWorkspaceDocument({ content, readInclude })
    expect(errors).toEqual([])
    expect(workspace.properties?.team).toBe(rootLast ? 'root' : 'included')
    expect(workspace.propertyDeclarations?.find((d) => d.key === 'shared-only')?.sourcePath).toBe('shared.dsl')
    expect(workspace.includedFiles?.[0].writable).toBe(false)
    expect(planIncludedWrites(workspace)).toEqual([])
    const saved = serializeRoot(workspace)
    expect(saved).toContain('!include shared.dsl')
    expect(saved).toContain('"root-only" "kept"')
    expect(saved).toContain('"constructor" "root key"')
    expect(saved).not.toContain('"shared-only"')
    expect(saved).not.toContain('"__proto__"')
    const reopened = restitchWorkspaceDocument(saved, workspace)
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.properties).toEqual(workspace.properties)
    expect(serializeRoot(reopened.workspace)).toBe(saved)
  })

  it('preserves an include inside the workspace properties block in its scope', async () => {
    const content = `workspace {
      properties {
        !include props.dsl
        "team" "root override"
      }
      ${model}
    }`
    const result = await loadWorkspaceDocument({ content, readInclude: async () => '"team" "included"\n"shared" "yes"' })
    expect(result.errors).toEqual([])
    expect(result.workspace.properties).toEqual({ team: 'root override', shared: 'yes' })
    const saved = serializeRoot(result.workspace)
    expect(saved).toMatch(/properties \{\s*!include props.dsl/)
    expect(saved).not.toContain('"shared"')
    const reopened = restitchWorkspaceDocument(saved, result.workspace)
    expect(reopened.errors).toEqual([])
    expect(reopened.workspace.properties).toEqual(result.workspace.properties)
    expect(isWorkspaceShape(JSON.parse(JSON.stringify(result.workspace)))).toBe(true)
  })

  it('retains a properties block containing only an unresolved include', () => {
    const result = parseDSL(`workspace {\nproperties {\n!include missing.dsl\n}\n${model}\n}`)
    expect(result.errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(serializeDSL(result.workspace)).toMatch(/properties \{\s*!include missing.dsl\s*\}/)
  })
})

describe('workspace and model properties (PR #220 review)', () => {
  it('accepts unquoted keys and values, as Structurizr does', () => {
    const { workspace, errors } = parseDSL(`workspace {
      properties {
        team platform
        "port" 8080
        url "https://example.com"
      }
      ${model}
    }`)
    expect(errors).toEqual([])
    expect(workspace.properties).toEqual({ team: 'platform', port: '8080', url: 'https://example.com' })
  })

  it('keeps a root line that an include later overrides', async () => {
    const content = 'workspace {\nproperties {\n "team" "root"\n}\n!include shared.dsl\n' + model + '\n}'
    const { workspace, errors } = await loadWorkspaceDocument({ content, readInclude: async () => 'properties {\n "team" "inc"\n}' })
    expect(errors).toEqual([])
    expect(workspace.properties?.team).toBe('inc')
    const saved = serializeRoot(workspace)
    expect(saved).toMatch(/properties \{\s*"team" "root"\s*\}\s*!include shared\.dsl/)
    expect(saved).not.toContain('"inc"')
    // Without the include the root's own value is still there.
    expect(parseDSL(saved.replace('!include shared.dsl', '')).workspace.properties).toEqual({ team: 'root' })
  })

  it('keeps a root block written before an include in front of it', async () => {
    const content = 'workspace {\nproperties {\n "own" "root"\n}\n!include shared.dsl\n' + model + '\n}'
    const { workspace } = await loadWorkspaceDocument({ content, readInclude: async () => '!const X "1"' })
    const saved = serializeRoot(workspace)
    expect(saved.indexOf('"own" "root"')).toBeLessThan(saved.indexOf('!include shared.dsl'))
  })

  it('writes an edit to the line that supplies the value', async () => {
    const content = 'workspace {\n!include shared.dsl\nproperties {\n "team" "root"\n}\n' + model + '\n}'
    const { workspace } = await loadWorkspaceDocument({ content, readInclude: async () => 'properties {\n "team" "inc"\n}' })
    workspace.properties!.team = 'edited'
    workspace.properties!.added = 'new'
    const saved = serializeRoot(workspace)
    expect(saved).toContain('"team" "edited"')
    expect(saved.indexOf('"added" "new"')).toBeGreaterThan(saved.indexOf('!include shared.dsl'))
    delete workspace.properties!.team
    expect(serializeRoot(workspace)).not.toContain('"team"')
  })

  it('does not add blank lines between consecutive workspace directives', () => {
    const src = 'workspace {\n    !const A "1"\n    !const B "2"\n\n    model {\n    }\n\n    views {\n    }\n}\n'
    const saved = serializeDSL(parseDSL(src).workspace)
    expect(saved).toContain('!const A "1"\n    !const B "2"\n\n    model {')
  })

  it('reports workspace and model properties the serializer drops or changes', () => {
    const { workspace, errors } = parseDSL(`workspace {
      properties {
        "k" ""
        "x" "y"
      }
      model {
        properties {
          "m" ""
        }
      }
      views {}
    }`)
    expect(errors).toEqual([])
    workspace.properties!.share = 'C:\\share\\'
    const fields = findSerializationLoss(workspace).map((l) => `${l.code} ${l.field}`)
    expect(fields).toEqual(expect.arrayContaining([
      'dropped-property property "k"',
      'dropped-backslash property "share"',
      'dropped-property property "m"',
    ]))
  })

  it('names a properties block as the reason an include inside it is read-only', async () => {
    const result = await loadWorkspaceDocument({
      content: 'workspace {\nproperties {\n!include p.dsl\n}\n' + model + '\n}',
      readInclude: async () => '"team" "x"',
    })
    expect(result.workspace.includedFiles?.[0].reason).toBe('included inside a properties block')
  })

  it('preserves model-level properties, including an include inside the block', () => {
    const src = `workspace {
      model {
        properties {
          "team" "platform"
          owner arch
        }
        s = softwareSystem "S"
      }
      views {}
    }`
    const { workspace, errors } = parseDSL(src)
    expect(errors).toEqual([])
    expect(workspace.model.properties).toEqual({ team: 'platform', owner: 'arch' })
    expect(workspace.properties).toBeUndefined()
    const saved = serializeDSL(workspace)
    const reopened = parseDSL(saved)
    expect(reopened.workspace.model.properties).toEqual(workspace.model.properties)
    expect(serializeDSL(reopened.workspace)).toBe(saved)

    const withInclude = parseDSL('workspace {\nmodel {\nproperties {\n!include m.dsl\n"team" "root"\n}\n}\nviews {}\n}')
    expect(serializeDSL(withInclude.workspace)).toMatch(/model \{\s*properties \{\s*!include m\.dsl\s*"team" "root"\s*\}/)
  })

  it('writes model properties from an included model fragment back to that fragment', async () => {
    const content = 'workspace {\nmodel {\n!include part.dsl\nproperties {\n "own" "root"\n}\n}\nviews {}\n}'
    const result = await loadWorkspaceDocument({
      content,
      readInclude: async () => 'properties {\n "part" "yes"\n}\na = softwareSystem "A"\n',
    })
    expect(result.errors).toEqual([])
    expect(result.workspace.model.properties).toEqual({ own: 'root', part: 'yes' })
    const root = serializeRoot(result.workspace)
    expect(root).toContain('"own" "root"')
    expect(root).not.toContain('"part"')
    const [write] = planIncludedWrites(result.workspace)
    expect(write?.path).toBe('part.dsl')
    expect(write?.content).toContain('"part" "yes"')
  })

  it('keeps the group separator it needs alongside user model properties', () => {
    const src = `workspace {
      model {
        properties {
          "structurizr.groupSeparator" "/"
          "team" "platform"
        }
        group "A" {
          group "B" {
            s = softwareSystem "S"
          }
        }
      }
      views {}
    }`
    const saved = serializeDSL(parseDSL(src).workspace)
    expect(saved.match(/structurizr\.groupSeparator/g)).toHaveLength(1)
    expect(saved).toContain('"team" "platform"')
    expect(parseDSL(saved).errors).toEqual([])
  })
})
