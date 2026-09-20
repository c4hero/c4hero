# Layout persistence

The `.c4hero.json` sidecar is a saved record of layout, not just a projection
of the diagrams currently visible in the editor. A model edit, unresolved
include, or change to generated views can temporarily hide saved content.
Absence alone must not delete that content on the next save.

## Rules

- `applySidecar` retains the loaded layout in `Workspace.savedLayout` and
  applies entries to current views using their keys (or the parser's explicit
  key-normalization alias).
- `extractSidecar` merges current layout into that record at element granularity.
  Live elements and view locks are authoritative; absent elements and views
  retain their saved entries. Extraction does not mutate either input.
- Code-pane reparsing uses the same extract/apply boundary. Undo snapshots and
  crash recovery carry the retained record with the workspace. Exact retained
  element IDs take precedence over the in-session name fallback.
- Reintroducing a hidden element through the UI restores its retained position
  and locks, including dynamic steps, context relationship creation/reconnection,
  and deployment topology refresh. Explicit removal clears that record so it
  is not resurrected.
- Retained element IDs remain reserved. Manual renames that collide are rejected;
  generated IDs choose an unused suffix. Scope renames also check live and
  retained view keys before changing anything.
- Explicit UI deletion removes the affected saved entries. ID renaming updates
  retained entries as well as live view references. Resetting layout clears live
  unlocked positions, while locks and unrelated retained entries survive.
- Save paths write an empty layout when necessary. Skipping a write after a
  reset would leave old positions on disk and restore them at the next open.
  A workspace with no layout may therefore have an empty sidecar. A failed or
  cancelled DSL save must stop before writing its sidecar or included files.
  Each destination stands alone: a failed root write suppresses that
  destination's sidecar and fragments, not the other destination's writes.
- Authoring a view in a workspace that has none makes the generated views
  explicit first (`materializeAutoViews`). `generateDefaultViews` only runs on
  a workspace with no views at all, so writing a single authored view into a
  view-less DSL would delete every generated diagram at the next parse.
  Structurizr's implicit-views convention is all-or-nothing.

The sidecar stays at version 1. Existing files need no migration, and this
change does not rewrite DSL view keys.

## Boundary of this fix

Preservation is separate from identity. Keyless views still derive their keys
from scope and declaration order. Reordering them can apply a saved entry to
the wrong diagram. Generated diagrams are still hidden when a DSL authored
elsewhere declares explicit views. Their retained layout remains in the
sidecar, including element entries that the current diagram cannot display.

Use explicit, unique DSL view keys for stable ownership today. Reliable identity
for keyless views needs a separate design; prefix/overlap matching cannot prove
which view owns an entry. Do not add such guesses to persistence.

Entries removed through DSL edits are retained indefinitely: the application
cannot distinguish intentional removal from temporary absence. Cleanup needs
an explicit user action or a separately designed retention policy.

## Regression coverage

`src/lib/layout-preservation.test.ts` exercises the store, DSL parser/serializer,
and sidecar together through repeated save/reopen cycles. It covers all three
reported failure modes, missing elements, recovery, intentional deletion/reset,
ID renaming, duplication, locks, undo/redo, and workspace isolation.
Restoration regressions also cover dynamic/context/deployment UI paths and
same-name elements with distinct retained IDs through undo/redo and save/reopen.
`src/lib/workspaceSave.test.ts` checks the actual JSON passed to file/folder
writers, including clearing the last layout without reopening first.

For browser validation against the production build, run `npm run build`, then
`npx playwright test --config playwright.preview.config.ts`. The four preview
checks cover dynamic/context/deployment restoration, same-name collisions,
reset, undo/redo, and saves/reopens. They use native Chromium file handles in
its origin-private filesystem, with only the directory chooser substituted.
Reopening clears application state and crash recovery before reading the saved
DSL and sidecar again. Native OS picker dialogs are not exercised.
