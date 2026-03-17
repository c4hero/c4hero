// Public API for the Structurizr DSL engine.
//
// Usage:
//   import { parseDSL, serializeDSL } from '@/lib/dsl'
//
//   const { workspace, errors } = parseDSL(dslText)
//   const dslOutput = serializeDSL(workspace)

import type { Workspace } from '@/types/model'
import { parse } from './parser'
import type { ParseError } from './parser'
import { serialize } from './serializer'

export type { ParseError }

export interface ParseDSLResult {
    workspace: Workspace
    errors: ParseError[]
}

/**
 * Parse a Structurizr DSL string into a Workspace model.
 *
 * Returns the parsed workspace and any errors encountered.
 * Parsing is lenient — it returns as much of the model as it can
 * even when errors are present.
 */
export function parseDSL(input: string): ParseDSLResult {
    return parse(input)
}

/**
 * Serialize a Workspace model back to Structurizr DSL text.
 *
 * Produces clean, idiomatic DSL with 4-space indentation,
 * blank lines between sections, and proper formatting.
 */
export function serializeDSL(workspace: Workspace): string {
    return serialize(workspace)
}
