# Features

A more detailed reference for what c4hero ships. The README is the elevator pitch; this is the full menu.

## C4 modelling

- Visual editing for **people, software systems, containers, and components** — the full C4 element vocabulary.
- Four view types: **system landscape, system context, container, and component**.
- Drill-through navigation between views (zoom into a system → its containers; zoom into a container → its components). View history with back navigation.
- **Boundaries are first-class.** Container and component views auto-render the parent system / container as a labelled boundary around its members.
- **Groups** for ad-hoc clustering across element types.

## Structurizr DSL

- Parses and serializes the [Structurizr DSL](https://docs.structurizr.com/dsl/language) — the same format used by Structurizr Lite, Studio, and the Java/JSON exporters.
- Round-trips: `parse(serialize(workspace)) === workspace` for everything c4hero models. Substantial round-trip test coverage protects this contract.
- Supports element styles, relationship styles, tags (with cascade), `properties { … }` blocks, owners, technology, status, custom URLs, and `!docs` / `!adrs` references.
- Sidecar JSON file (`<workspace>.c4hero.json`) holds non-DSL metadata — node positions, view auto-layout direction, viewport state — so layout survives DSL edits.

## File workflows

- **Folder collections** (Chromium browsers): open a folder of `.dsl` files, pick a workspace, and edit. Saves write back to disk via the File System Access API.
- **Single-file mode** (all browsers): open a `.dsl` file directly. Saves either go back to the source handle (where supported) or trigger a download.
- **Recent collections / files** are remembered in `localStorage` and re-openable from the welcome screen.
- **Crash recovery**: the active workspace is mirrored to `localStorage`. If the tab crashes or you close it mid-edit, the next launch offers to restore.

## Editing UX

- **Inspector** (right panel) for element and relationship properties: name, description, technology, owner (with autocomplete from existing teams), URL, status, tags.
- **Add Element panel** (left): quick-create new elements or pull existing-but-out-of-view elements onto the canvas. Auto-wires relationships from the model on add.
- **Multi-select** mode (M) for batch operations: group, delete, duplicate.
- **Highlighter panel** (H): tag, status, technology, and team filters that stack across facets to highlight matching subgraphs without hiding the rest of the diagram. Each facet has Any-of / All-of mode.
- **Search** (⌘F): jump to any element across views.
- **Command palette** (⌘K): every action is reachable from here, with shortcuts shown alongside.

## Layout

- **Auto-arrange** with dagre, with selectable direction (TB / BT / LR / RL).
- **Snap to 32px grid** so manually-placed nodes land on visible dots.
- **Smart edge routing**: handle slot picker spreads multiple edges across a node's side (a/b/c slots) so they don't overlap.
- **Zoom-to-fit** that respects the floating chrome, so the diagram is centred in the visible canvas, not under the panels.

## Export

- **PNG** and **SVG** export of the current view, with optional padding control.
- **DSL** export (Save As) writes a clean `.dsl` plus its sidecar JSON.
- Exports are deterministic — same workspace, same bytes — so they diff cleanly in pull requests.

## AI assistant (BYOK)

Optional and opt-in. The assistant is inert until you add your own provider key
in AI settings; the key is stored only in this browser and requests go directly
to the provider you choose — c4hero never sees your key or your model data.
Open it from the tool rail, the menu, or the command palette (`AI: …`), or toggle
it with the `I` shortcut.

- **Bring your own key** — **Anthropic**, **OpenAI**, or **Google Gemini**, with a
  recommended balanced-tier model per provider (and any model you prefer). The
  provider layer is pluggable for adding more.
- **Model health** — an instant, deterministic readout of how complete the model
  is (missing descriptions, technologies, untyped relationships), with
  click-to-fix gaps and a 100% celebration. No AI call required.
- **Improve my model** — one guided flow that combines three things in a single
  stepper: the instant missing-info fixes, an AI **deep review** (orphans, untyped
  links, naming/boundary issues), and an **interview** that asks about anything the
  model can't reveal on its own. The scope lives inside the Improve button (a split
  caret) and grounds the review and questions on the active view or the whole
  model; review of a view leaves another system's elements shown as external
  context alone. Each review fix offers a couple of distinct approaches to pick
  from — or an **Other** box to describe your own, applied through the same edit
  engine. Every change applies the moment you approve it (model health climbs
  live), and a revert ledger undoes any single change — or all of them.
- **Describe a change** — build a new model or edit the current one from a plain-
  English prompt; replacing an existing model always asks first.
- **Inspector assist** — per-field auto-suggestions for empty descriptions and
  technologies, plus tag suggestions constrained to your existing vocabulary.
- **Voice dictation** — speak into assistant inputs where the browser supports the
  Web Speech API.

Every AI-proposed change is shown as a reviewable plan and applied through the
same edit pipeline as manual edits, so it's a single undo entry.

## Accessibility

- ARIA labels on every canvas node and panel.
- Focus-trap on every dialog with focus restoration on close.
- Keyboard shortcuts for every common action; full list in the command palette.
- `prefers-reduced-motion` is honoured for canvas animations and the loading skeleton.
- Forced-colors mode is supported.

## Privacy

- No telemetry by default. Hosted deployments can opt in to Cloudflare Web Analytics and Sentry error reporting without sending workspace contents.
- Files stay on your device; nothing is uploaded to a c4hero server. There is no c4hero server.
- See [`PRIVACY.md`](../PRIVACY.md) for the full statement.

## Browser support

Folder collections require the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) — currently only available in Chromium browsers (Chrome, Edge, Brave, Arc, Opera). On Firefox and Safari, c4hero automatically falls back to single-file mode; everything else (rendering, editing, export) works identically.
