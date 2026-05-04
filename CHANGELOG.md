# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- AI features (description suggestions, prompt-to-workspace bootstrap) and the bring-your-own-key infrastructure that supported them. The `VITE_ANTHROPIC_API_URL` and `VITE_OPENAI_API_URL` build-time variables are gone with them. The open source build no longer talks to any LLM provider.

### Added
- Highlighter panel: a side panel for highlighting nodes by tag, status, technology, or team — with stackable AND-across-facets matching, per-facet `Any of` / `All of` mode, and per-value match counts. Opens from the left tool rail.
- Owner picker on elements: autocomplete from existing teams in the workspace, mirroring the technology field's UX.
- Keyboard shortcuts: `H` toggles the Highlighter, `M` toggles multi-select mode, `⌘⇧L` runs auto-arrange. Each shortcut is also surfaced in the command palette (`⌘K`).
- Match-mode controls in the Highlighter: per-facet toggle between `Any of` and `All of`.

### Changed
- Canvas grid spacing and snap-to-grid both move to `32px` so dragged nodes land on visible dots.
- Color theme settings: per-tag styles defined in the workspace override theme colors. The Canvas Settings dialog now calls this out next to the theme picker.
- Auto-arrange (`resetAndRelayout`) is exposed in the command palette with its keystroke.
- Inspector outside-click ignores anything tagged `data-canvas-chrome`, so clicks inside floating side panels no longer dismiss it.
- Renamed `spotlight` → `highlight`/`highlighter` throughout the codebase to match user-facing language. Internal-only refactor; behavior unchanged.

### Fixed
- Tag chips in the Highlighter now use the same background, foreground, and stroke as the actual node tag style — the chip previews exactly what the node will look like once highlighted.
- Edges no longer light up when only tag/status/team filters are active. They highlight only when a Tech filter matches their `technology` field, or when both endpoints are highlighted.
- Selection is now reconciled between React Flow's internal node state and the workspace store so that an external clear (e.g. clicking a panel chip) doesn't leave the next node click as a no-op.
- Owner field's autocomplete dropdown no longer races with the Inspector's outside-click handler — clicking a suggestion no longer dismisses the panel.
- "Unhandled error null" / `ResizeObserver loop completed with undelivered notifications` no longer flood the console or remote log buffer; both are now treated as benign.
- Replaced deprecated `apple-mobile-web-app-capable` meta tag with the W3C-standard `mobile-web-app-capable` (the legacy one is kept for Safari).

[Unreleased]: https://github.com/c4hero/c4hero/compare/main...HEAD
