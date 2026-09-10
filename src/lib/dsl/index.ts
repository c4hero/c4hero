// Public API for the Structurizr DSL engine.
//
// Usage:
//   import { parseDSL, serializeDSL } from '@/lib/dsl'
//
//   const { workspace, errors } = parseDSL(dslText)
//   const dslOutput = serializeDSL(workspace)

import type { Workspace } from '@/types/model'
import { parse } from './parser'
import type { ParseError, ParseResult } from './parser'
import { serialize, type SerializeOptions } from './serializer'
import { generateDefaultViews } from './auto-views'

export type { ParseError }
export type { SerializeOptions }
export { GroupSerializationError } from './serializer'

export interface ParseDSLResult extends ParseResult {
    workspace: Workspace
    errors: ParseError[]
    /** Non-fatal: content preserved but not understood (unresolved `!include`). */
    warnings: ParseError[]
}

/**
 * Parse a Structurizr DSL string into a Workspace model.
 *
 * Returns the parsed workspace and any errors encountered.
 * Parsing is lenient — it returns as much of the model as it can
 * even when errors are present.
 */
export function parseDSL(input: string): ParseDSLResult {
    const result = parse(input)
    // If the DSL declared no views, synthesise sensible defaults so the canvas
    // has something to render. Generated views are flagged `autoView: true` and
    // are not serialized back, preserving DSL roundtrip identity.
    generateDefaultViews(result.workspace)
    return result
}

/**
 * Serialize a Workspace model back to Structurizr DSL text.
 *
 * Produces clean, idiomatic DSL with 4-space indentation,
 * blank lines between sections, and proper formatting.
 */
export function serializeDSL(workspace: Workspace, opts?: SerializeOptions): string {
    return serialize(workspace, opts)
}
