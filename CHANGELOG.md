# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-09-05

### Added

- **Edit the DSL next to the canvas, live in both directions.** A dockable
  code pane on the right holds the workspace as Structurizr DSL: edit the model
  on the canvas and the text follows, type in the text and the canvas follows.
  A clean parse applies as a single undo entry and carries element positions,
  pins and locks across, so nothing you laid out is lost round-tripping through
  text. Parse errors surface as gutter diagnostics and simply don't apply —
  a half-typed document can never empty your model. Open it with `mod+e`, the
  tool rail, or the command palette. (TEA-252)
- **See what breaks before you delete it.** The inspector and the command
  palette can now answer "what happens if I remove this?" for any element or
  selection: the children that go with it, every relationship that loses an
  endpoint, the elements that depended on it (and what depended on those, a few
  hops out), anything left with nothing attached, and the views that disappear
  because their scope element did. It's a plain graph walk over the model using
  the same cascade rules as the real delete — nothing is estimated, and no AI is
  involved. Select the blast radius on the canvas from there, or go ahead and
  delete through the usual confirmation. (TEA-72)
- **Export the whole workspace as one interactive HTML file.** Every view, laid
  out and rendered as inline SVG, wrapped in a small read-only viewer: view
  tabs, pan and zoom, drill-through, search and an element details panel. The
  file has no dependencies and makes no network requests — its own
  `Content-Security-Policy` forbids them — so it works from disk, in a wiki, as
  a chat attachment or from a years-old build artifact, with or without c4hero.
  Exports are deterministic, so they diff cleanly in review. Find it in the
  Export dialog or the command palette ("Export as interactive HTML"). (TEA-88)
- **Readable, editable element IDs.** Elements used to carry random eight-letter
  ids, which then became the identifiers in exported DSL. New elements now
  derive a `camelCase` id from their name and keep re-deriving it as you rename,
  so the DSL keeps tracking what things are called. Edit the id yourself in the
  inspector and it pins — renames stop touching it — with a sync button to go
  back to deriving. Identifiers that came from imported DSL are pinned from the
  start, because whoever wrote `paymentService = container ...` chose that name.
  Changing an id cascades through every relationship, view, group and deployment
  instance that references it, as a single undo step. Existing workspaces need
  no migration. (TEA-242)

### Fixed

- **The what's-new pill now reaches returning users.** The 0.4.0 announcement
  went out to nobody: no existing user had a dismissed-id stored yet, so every
  one of them looked like a brand-new visitor and was silently seeded instead of
  shown the release. Prior use is now detected from any other `c4hero*` browser
  storage key, and genuinely new visitors are still seeded in silence.
  (TEA-248)

## [0.4.0] - 2026-08-30

### Added

- **Dynamic and deployment views — c4hero now covers the complete C4 view
  set.** Workspaces using `dynamic` views (ordered interaction steps,
  including response messages and repeated steps) and `deployment` views
  (`deploymentEnvironment`, nested `deploymentNode`s, `containerInstance` /
  `softwareSystemInstance`, `infrastructureNode`) parse, render, and
  re-serialize losslessly, verified against the real Structurizr parser in
  CI. Dynamic views number every interaction step on its edge; deployment
  views draw the environment as nested deployment-node boundaries around the
  instances and infrastructure running inside them. Rendering, layout, drag,
  and export are fully wired, and topology can be authored visually (see
  below).
- **Lock a whole view's layout.** One switch in the Auto-arrange menu freezes
  the active view: Auto-arrange and layout-direction changes become no-ops and
  nothing can be dragged — not even by accident. Element locks keep working
  independently underneath, so unlocking the view brings back exactly the
  mixed state you had. The lock shows as a badge on the Auto-arrange button,
  is undoable, and survives reload via the sidecar.
- **Lock a node in place.** Auto-arrange used to be all or nothing: hand-place
  two elements and re-running it threw that work away. Locked nodes now hold
  their exact position through Auto-arrange and layout-direction changes while
  everything else reflows around them, and they can't be dragged by accident.
  Lock from the element panel or the multi-select bar; locked nodes carry a
  small lock marker, and **Unlock all** sits in the Auto-arrange menu. Lock
  state is saved alongside positions and survives a reload. Requested in
  [#108](https://github.com/c4hero/c4hero/issues/108).

- **Author deployment topology visually.** The add panel on a deployment view
  edits the environment's topology: add deployment nodes (top-level or
  nested), infrastructure nodes, and container / software-system instances;
  rename nodes inline; delete anything with its subtree cascading through
  relationships and view membership. Scoped views pick up only instances of
  their system, positions survive topology edits, everything is undoable, and
  the result serializes to DSL the real Structurizr parser accepts.
- **Scoped deployment views say what they hide.** A deployment view scoped to
  a software system only draws subtrees deploying that system — which used to
  make topology edits look like silent no-ops. The topology editor now shows a
  "scoped to …" chip, badges elements the scope filters out, annotates
  out-of-scope options in the instance picker, warns before an add that won't
  appear, and offers a one-click jump to (or creation of) the unscoped view of
  the same environment.
- **What's new in c4hero, in c4hero.** A subtle release-notes pill appears for
  returning users when a build ships announced features; clicking it opens the
  highlights with a link to the full changelog, and dismissing it keeps it
  gone until the next announcement. Off by default for self-hosted and fork
  builds — enable with `VITE_WHATS_NEW=1`.
- **Edit dynamic view steps visually.** The add panel on a dynamic view is now
  a step editor: add interactions between in-scope elements (picking the
  reverse of an existing relationship authors a response step; a brand-new
  pair creates the model relationship too), reorder with the sequence
  renumbering automatically, override per-step descriptions inline, and
  delete steps — membership follows the steps, edits are undoable, and the
  result serializes losslessly.

### Fixed

- **Parallel interaction sequences now number exactly like Structurizr.**
  Brace groups in a dynamic view used to be flattened into one running
  sequence (1, 2, 3, 4); the real parser clones the counter at `{` and
  reverts it at `}`, so branches share a base number and the step after the
  groups reuses it too. c4hero now matches that numbering — verified against
  the Structurizr CLI — and re-serializes the brace groups so the orders
  survive a round-trip instead of silently renumbering.
- **Clicking a numbered step in a dynamic view now highlights it.** Step
  edges carry step-scoped ids, and selection synced by edge id, so the
  emphasis never applied; it now matches on the backing relationship, which
  also highlights every step of that relationship at once.
- The Add Element panel on dynamic and deployment views now explains that
  steps and topology are authored in the DSL, instead of opening as an empty
  dead end.
- **Crowded nodes no longer stack their connections.** Each side of a node now
  offers seven connection points instead of three, so a system with several
  integrations fans them out along its edge rather than routing the fourth
  relationship onto the same pixels as the first. Diagrams with one, two or
  three connections on a side are unchanged. Reported in
  [#108](https://github.com/c4hero/c4hero/issues/108).
- Corrected the documented AI feature set. The 0.3.0 notes and the README both
  described a **From your code** repo scan that proposes elements from a local
  repository. That feature was never shipped — no implementation exists — so the
  claim has been removed from both. It remains a candidate for a future release
  rather than something you can use today.

## [0.3.0] - 2026-07-07

Adds an optional, bring-your-own-key AI assistant. It stays inert until you enter
your own provider key; the key never leaves your browser and requests go directly
to the provider you choose — c4hero never sees your key or your model data.

### Highlights

- **AI assistant (BYOK)** — opt-in, runs entirely against your own key for
  **Anthropic**, **OpenAI**, or **Google Gemini**. Keys are stored only in this
  browser and sent only to the chosen provider. See [PRIVACY.md](PRIVACY.md).

### Added

- **Model health** — an instant, deterministic readout of how complete your model
  is (descriptions, technologies, untyped relationships), with click-to-fix gaps
  and a 100% celebration.
- **Improve my model** — one guided flow that fixes the instant missing-info gaps,
  runs an AI **deep review** (orphans, untyped links, naming/boundary issues), and
  folds in an **interview** that asks about anything it can't infer. The scope lives
  in the Improve button (a split caret), grounding the review/questions on the
  active view or the whole model. Each review fix offers a couple of distinct
  options to pick from — or write your own — and every change applies as you
  approve it (model health climbs live), with a revert ledger to undo any single
  change or all of them.
- **Describe a change** — build or edit the model from a plain-English prompt.
- **Inspector AI** — per-field auto-suggestions for empty descriptions and
  technologies, plus vocabulary-constrained tag suggestions.
- Provider/model settings with sensible balanced-tier defaults and a recommended
  model per provider; optional voice dictation for assistant inputs where the
  browser supports the Web Speech API.

### Changed

- The element inspector and the assistant share one screen slot and never overlap
  — selecting a node closes the assistant, and opening the assistant closes the
  inspector.
- The minimap is now off by default.
- Fit-to-screen now frames group and scope boundaries, not just content.

### Security

- AI is inert until a key is entered; keys live only in `localStorage` and are
  sent only to the chosen provider's API. The hosted CSP restricts `connect-src`
  to those three provider domains, and `Permissions-Policy` allows the microphone
  for the app's own origin only (for dictation).

## [0.2.2] - 2026-07-05

### Fixed

- Overlapping/nested groups: selecting a group fully contained within another group now selects the smaller inner group instead of always selecting the outer one. ([#84](https://github.com/c4hero/c4hero/issues/84))
- Design-system consistency: unified close/delete button sizing across element, relationship, and group inspector panels; aligned technology and tag chip styling in relationship tooltips; replaced a handful of hardcoded colors and blur values that had drifted from their design tokens.

## [0.2.1] - 2026-06-13

### Fixed

- PNG export now uses html-to-image's `toBlob` directly instead of a data-URL fetch, so it's no longer blocked by CSP.
- SVG export inlines computed styles property-by-property so downloaded SVGs render correctly outside the app.

## [0.2.0] - 2026-05-19

Initial public release. c4hero is a local-first browser-based visual editor for C4 architecture diagrams that reads and writes Structurizr DSL. Workspaces stay on your device; nothing is uploaded to a c4hero server.

### Highlights

- **Visual C4 modelling** — design people, software systems, containers, and components across system landscape, system context, container, and component views, with drill-through navigation between view levels.
- **Structurizr DSL round-trip** — parse and serialize the same DSL used by the official Structurizr tools.
- **File workflows** — folder-based collections in Chromium browsers via the File System Access API; single-file open/save fallback in every other browser. Sidecar JSON keeps node positions and viewport state alongside the `.dsl`.
- **Editing UX** — Inspector, Add Element panel, multi-select, search, command palette (`Cmd/Ctrl+K`), and a Highlighter panel that filters by tag, status, technology, or team.
- **Layout** — auto-arrange with dagre, snap-to-grid, smart edge routing, and manual alignment/distribution tools.
- **Export** — deterministic PNG, SVG, and DSL export.
- **Accessibility** — focus-trap dialogs, ARIA-labelled canvas, keyboard shortcuts for common actions, and `prefers-reduced-motion` support.
- **Privacy** — hosted observability is disabled by default in the open source build; the hosted app can enable aggregate Cloudflare Web Analytics and scrubbed Sentry error reports without sending workspace contents.

### Added

- Multi-system container view support, including include-expression parsing for `element.type==...` and `element.parent==...` filters.
- First-class scoped boundaries in deeper C4 views, with per-system boundaries in container views and per-container boundaries in component views.
- Highlighter improvements, including a persistent bottom bar, tag-management dialog polish, and one-click filter restore after view switches.
- Touch/mobile parity for removing elements from views and opening bottom-rail flyouts.

### Changed

- Backspace semantics now separate removing an element from the current view from destructive model deletion, with clearer hints and impact-aware confirmation.
- Multi-select and group workflows now preserve layout more reliably across alignment, dragging, undo, redo, and repeated mutations.
- Test infrastructure now runs against Vitest 4 and updated coverage baselines.

### Fixed

- System context `include *` now follows container relationships correctly.
- Create View is guarded when no valid scope exists.
- Canvas interactions no longer trigger browser-back navigation on Backspace in non-text contexts.
- Boundary-node E2E selectors now match the per-scope ID format.

[0.4.0]: https://github.com/c4hero/c4hero/releases/tag/v0.4.0
[0.3.0]: https://github.com/c4hero/c4hero/releases/tag/v0.3.0
[0.2.2]: https://github.com/c4hero/c4hero/releases/tag/v0.2.2
[0.2.1]: https://github.com/c4hero/c4hero/releases/tag/v0.2.1
[0.2.0]: https://github.com/c4hero/c4hero/releases/tag/v0.2.0
