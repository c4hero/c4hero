import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseDSL, serializeDSL } from './index'

describe('E2E Flow Workspace Roundtrip', () => {
  it('parses and serializes idempotently without errors', () => {
    const defaultPath = path.resolve(__dirname, '../../../../../dy-flow/flow/diagrams/workspace.dsl')
    const sourcePath = process.env.FLOW_WORKSPACE_DSL ?? defaultPath

    if (!fs.existsSync(sourcePath)) {
      console.warn(`Skipping E2E test: workspace file not found at ${sourcePath}`)
      return
    }

    const dslContent = fs.readFileSync(sourcePath, 'utf8')

    // 1. First parse
    const { workspace: parse1, errors: errors1 } = parseDSL(dslContent)
    expect(errors1).toHaveLength(0)

    // 2. First serialize
    const serialize1 = serializeDSL(parse1)

    // 3. Second parse
    const { workspace: parse2, errors: errors2 } = parseDSL(serialize1)
    expect(errors2).toHaveLength(0)

    // 4. Second serialize
    const serialize2 = serializeDSL(parse2)

    // Assert custom counts are preserved (if any were present)
    expect(parse2.model.customElements?.length ?? 0).toBe(parse1.model.customElements?.length ?? 0)
    expect(parse2.views.customViews?.length ?? 0).toBe(parse1.views.customViews?.length ?? 0)

    // Option-B normalization for models deep-equal
    expect(parse2.model).toEqual(parse1.model)

    // Serialize is idempotent
    expect(serialize2).toBe(serialize1)
  })
})
