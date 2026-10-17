import { z } from 'zod'
import {
  MAX_PLAN_OPS, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_TECHNOLOGY_LENGTH,
  MAX_OWNER_LENGTH, MAX_TITLE_LENGTH, MAX_ID_FIELD_LENGTH, MAX_TAGS_COUNT, MAX_TAG_LENGTH,
} from '@/lib/ai/schema'

export const CONTRACT_VERSION = 1
const id = z.string().trim().min(1).max(MAX_ID_FIELD_LENGTH)
const name = z.string().trim().min(1).max(MAX_NAME_LENGTH)
const description = z.string().max(MAX_DESCRIPTION_LENGTH).optional()
const technology = z.string().max(MAX_TECHNOLOGY_LENGTH).optional()
const creation = { ref: id, name, description }

// Stricter at the tool boundary than the AI provider's tolerant sanitizer:
// malformed fields and unknown operations must never silently disappear.
export const planSchema = z.strictObject({
  operations: z.array(z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('addPerson'), ...creation }),
    z.strictObject({ op: z.literal('addSoftwareSystem'), ...creation, external: z.boolean().optional() }),
    z.strictObject({ op: z.literal('addContainer'), ...creation, parent: id, technology }),
    z.strictObject({ op: z.literal('addComponent'), ...creation, parent: id, technology }),
    z.strictObject({ op: z.literal('addRelationship'), source: id, destination: id, description, technology }),
    z.strictObject({
      op: z.literal('updateElement'), id, name: name.optional(), description, technology,
      location: z.enum(['Internal', 'External']).optional(),
      tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS_COUNT).optional(),
      status: z.enum(['Live', 'Planned', 'Deprecated', 'Removed']).optional(),
      owner: z.string().max(MAX_OWNER_LENGTH).optional(),
    }),
    z.strictObject({ op: z.literal('updateRelationship'), id, description, technology }),
    z.strictObject({ op: z.literal('deleteElement'), id }),
    z.strictObject({
      op: z.literal('addView'),
      viewType: z.enum(['systemLandscape', 'systemContext', 'container', 'component']),
      scope: id.optional(), title: z.string().max(MAX_TITLE_LENGTH).optional(),
    }),
  ])).min(1).max(MAX_PLAN_OPS),
})
