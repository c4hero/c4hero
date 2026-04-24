# Story: serialize groups inside their parent scope's DSL block

**Date:** 2026-04-24
**Related:** `2026-04-24-drag-over-group-highlight-design.md` (prerequisite creates the UI-layer invariant this story makes safe)
**Status:** Tracked, not scheduled

## Problem

`src/lib/dsl/serializer.ts:183-196` emits every group at the top level of the `model { ... }` block, regardless of what its members are:

```ts
// Groups
if (model.groups.length > 0) {
    this.emitBlank()
    for (const group of model.groups) {
        this.emit(`group "${this.escapeString(group.name)}" {`)
        this.depth++
        for (const elementId of group.elementIds) {
            this.emit(this.idToVar.get(elementId) ?? elementId)
        }
        this.depth--
        this.emit('}')
    }
}
```

Structurizr DSL groups are nested inside the scope that owns their members:

- Groups of `person` + `softwareSystem` belong at `model { ... }` root.
- Groups of `container`s belong inside their owning `softwareSystem "X" { ... }` block.
- Groups of `component`s belong inside their owning `container "Y" { ... }` block.

Today's serializer produces syntactically invalid Structurizr DSL for any group whose members are containers or components. Until the drag-join feature ships, this is latent — nothing at the UI layer forces a group to hold (say) only containers of a single system. Once scope homogeneity is enforced at drag time, legal groups will routinely contain elements that Structurizr expects to be nested, and the broken export becomes user-visible.

## Scope

### Serializer (`src/lib/dsl/serializer.ts`)

- Partition groups by `parentScopeOf(firstMember)`:
  - `{ kind: 'root' }` → emit at `model { ... }` root.
  - `{ kind: 'system', id }` → emit inside that `softwareSystem` block, interleaved with the system's containers.
  - `{ kind: 'container', id }` → emit inside that `container` block, interleaved with the container's components.
- When emitting a system or container block, list all its direct-child groups first, then emit any remaining non-grouped children, to match Structurizr example ordering conventions.
- Guard: if a group spans multiple scopes (pre-feature legacy data), fall back to emitting at the root with a trailing `// c4hero: mixed-scope group` comment. Do not silently lose members.

### Parser (`src/lib/dsl/parser.ts`)

- Verify nested `group { ... }` blocks inside `softwareSystem` and `container` are already parsed correctly. If not, extend the parser to hoist them into `model.groups` with the right `elementIds`.
- Preserve nesting context so a subsequent serialize round-trips to the same location.

### Round-trip tests (`src/lib/dsl/roundtrip.test.ts`, `scope-roundtrip.test.ts`)

- Add fixtures for:
  - Group of containers inside a software system.
  - Group of components inside a container.
  - Root-level person + softwareSystem group.
  - Legacy mixed-scope group (ensure graceful fallback if we keep that behavior).

## Non-goals

- No UI work. The UI-layer fix is tracked in the drag-join design.
- No schema migration. c4hero's internal `Group` model stays flat (`{ id, name, elementIds }`); parent scope is derived at serialize time.

## Risks

- **Parser may not currently handle nested groups at all.** If `parser.ts` rejects nested `group` blocks, the parser fix is the bigger chunk of this story.
- **Breaking existing round-trip fixtures.** Any fixture that currently relies on all-groups-at-root ordering will need updating. Count them before estimating.

## Definition of done

- `serializer.ts` emits groups inside the correct DSL block per parent scope.
- `parser.ts` accepts nested groups and hoists them into `model.groups` losslessly.
- New round-trip tests cover each nesting level and pass.
- Existing round-trip tests still pass (or are updated deliberately with a note).
- A container-group and a component-group in a real workspace export to DSL that Structurizr Lite parses without error. Manual verification step.
