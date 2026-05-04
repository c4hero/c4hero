import type { Workspace } from '@/types/model'
import { parseDSL, type ParseError } from '@/lib/dsl'
import { applySidecar, parseSidecar } from '@/lib/sidecar'

export interface WorkspaceDocumentInput {
  content: string
  fallbackName?: string
  sidecarJson?: string
}

export interface WorkspaceDocumentResult {
  workspace: Workspace
  errors: ParseError[]
}

export function parseWorkspaceDocument({
  content,
  fallbackName,
  sidecarJson,
}: WorkspaceDocumentInput): WorkspaceDocumentResult {
  const { workspace, errors } = parseDSL(content)
  if (!workspace.name && fallbackName) workspace.name = fallbackName

  const sidecar = sidecarJson ? parseSidecar(sidecarJson) : null
  if (sidecar) applySidecar(workspace, sidecar)

  return { workspace, errors }
}
