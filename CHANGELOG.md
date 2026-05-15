# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-15

Public launch readiness release.

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

## [0.1.0] - 2026-05-04

Initial public release. c4hero is a local-first browser-based visual editor for C4 architecture diagrams that reads and writes Structurizr DSL. Workspaces stay on your device; nothing is uploaded to a c4hero server.

### Highlights

- **Visual C4 modelling** — design people, software systems, containers, and components across system landscape, system context, container, and component views, with drill-through navigation between view levels.
- **Structurizr DSL round-trip** — parse and serialize the same DSL used by the official Structurizr tools.
- **File workflows** — folder-based collections in Chromium browsers via the File System Access API; single-file open/save fallback in every other browser. Sidecar JSON keeps node positions and viewport state alongside the `.dsl`.
- **Editing UX** — Inspector, Add Element panel, multi-select, search, command palette (`⌘K`), and a Highlighter panel that filters by tag, status, technology, or team.
- **Layout** — auto-arrange with dagre, snap-to-grid, smart edge routing.
- **Export** — deterministic PNG, SVG, and DSL export.
- **Accessibility** — focus-trap dialogs, ARIA-labelled canvas, keyboard shortcuts for every common action, `prefers-reduced-motion` support.
- **Privacy** — no telemetry and no third-party tracking scripts in the open source build.

[0.1.0]: https://github.com/c4hero/c4hero/releases/tag/v0.1.0
[0.2.0]: https://github.com/c4hero/c4hero/releases/tag/v0.2.0
