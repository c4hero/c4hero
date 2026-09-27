import { describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import { loadWorkspaceDocument, restitchWorkspaceDocument } from '@/lib/workspaceDocument'
import { planIncludedWrites, serializeRoot } from '@/lib/includeWriteback'
import { isWorkspaceShape } from '@/lib/fileIO'

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
    expect(isWorkspaceShape({ ...workspace, properties: { team: 'platform' }, propertySourcePaths: { team: 'shared.dsl' } })).toBe(true)
    for (const field of ['properties', 'propertySourcePaths']) {
      for (const value of [null, [], 'bad', { team: 42 }]) {
        expect(isWorkspaceShape({ ...workspace, [field]: value })).toBe(false)
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
    expect(workspace.propertySourcePaths?.['shared-only']).toBe('shared.dsl')
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
