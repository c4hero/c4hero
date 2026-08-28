# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Export the whole workspace as one interactive HTML file.** Every view, laid
  out and rendered as inline SVG, wrapped in a small read-only viewer: view
  tabs, pan and zoom, drill-through, search and an element details panel. The
  file has no dependencies and makes no network requests — its own
  `Content-Security-Policy` forbids them — so it works from disk, in a wiki, as
  a chat attachment or from a years-old build artifact, with or without c4hero.
  Exports are deterministic, so they diff cleanly in review. Find it in the
  Export dialog or the command palette ("Export as interactive HTML"). (TEA-88)
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
- **Dynamic and deployment views now round-trip through the DSL.** Workspaces
  using `dynamic` views (ordered interaction steps, including response
  messages and repeated steps) and `deployment` views (`deploymentEnvironment`,
  nested `deploymentNode`s, `containerInstance` / `softwareSystemInstance`,
  `infrastructureNode`) parse and re-serialize losslessly, verified against the
  real Structurizr parser in CI. Canvas rendering for both view types is in
  progress; until it lands these views are preserved, not yet drawn.

### Fixed

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

[0.3.0]: https://github.com/c4hero/c4hero/releases/tag/v0.3.0
[0.2.2]: https://github.com/c4hero/c4hero/releases/tag/v0.2.2
[0.2.1]: https://github.com/c4hero/c4hero/releases/tag/v0.2.1
[0.2.0]: https://github.com/c4hero/c4hero/releases/tag/v0.2.0
