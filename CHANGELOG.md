# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
