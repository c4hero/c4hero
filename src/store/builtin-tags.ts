/** Tags that always exist and whose styles cannot be removed.
 *  'Relationship' is the built-in tag for all relationships and is
 *  included here so removeTagGlobal can't strip it from the model. */
export const BUILTIN_TAGS = new Set([
  'Element',
  'Person',
  'Software System',
  'Container',
  'Component',
  'Relationship',
  'Database',
])
