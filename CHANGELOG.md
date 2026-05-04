# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- AI features (description suggestions, prompt-to-workspace bootstrap) and the bring-your-own-key infrastructure that supported them. The `VITE_ANTHROPIC_API_URL` and `VITE_OPENAI_API_URL` build-time variables are gone with them. The open source build no longer talks to any LLM provider.

### Added
- Core Web Vitals reporting (LCP/INP/CLS/FCP/TTFB) through the existing structured logger so any configured remote transport gets perf telemetry.
- `safeStorage` helper (`readJSON`, `writeJSON`, `readString`, `writeString`, `removeKey`) centralizing localStorage I/O with consistent error handling. All call sites in `viewportStorage`, `settings`, `fileIO`, and `CanvasHints` now go through it.
- Workspace-scoped element index cache (WeakMap-backed) — element id lookups are O(1) instead of O(n) tree-walks; `findElement`, `elementExists`, and `buildElementMap` share the same per-snapshot index.
- README "Deployment" section documenting the Vercel pipeline, env-var expectations, rollback steps, and self-hosting guidance.
- Vitest coverage now runs in CI; coverage report uploaded as a workflow artifact. Playwright HTML report uploaded on e2e failure.
- Gitleaks secret-scanning job in CI catches accidental secret commits before they hit `main`.
- `DialogShell` gained a `position` prop ("center" | "shade") so top-pill-anchored slide-down panels can share the same focus-trap, focus-restoration, ARIA, and Escape-handling primitives as centered modals.
- Open source release checklist covering repository hygiene, security/privacy, and launch smoke tests.
- Dependency review in CI for pull requests, plus local `typecheck`, `audit`, and `check` npm scripts.
- Runtime validation for optional remote log endpoints; only HTTPS remotes and same-origin paths are accepted.
- Highlighter panel: a side panel for highlighting nodes by tag, status, technology, or team — with stackable AND-across-facets matching, per-facet `Any of` / `All of` mode, and per-value match counts. Opens from the left tool rail.
- Owner picker on elements: autocomplete from existing teams in the workspace, mirroring the technology field's UX.
- Keyboard shortcuts: `H` toggles the Highlighter, `M` toggles multi-select mode, `⌘⇧L` runs auto-arrange. Each shortcut is also surfaced in the command palette (`⌘K`).
- Match-mode controls in the Highlighter: per-facet toggle between `Any of` and `All of`.

### Changed
- Consolidated to a single `ErrorBoundary` (the richer `src/components/shared/ErrorBoundary.tsx`); the older root-level boundary was removed and the root mount in `main.tsx` now uses the shared component with `onReset={() => window.location.reload()}`.
- `SearchDialog`, `ExportDialog`, and `CommandPalette` migrated onto `DialogShell` (centered for Search; new `position="shade"` for Export and CommandPalette). Drops ~70 lines of duplicated modal scaffolding.
- Workspace store helpers (`applyElementPatch`, `elementExists`, `forEachView`, `uniqueElementName`, `addToCurrentView`, `cloneWorkspace`, `VIEW_ARRAY_KEYS`, `ElementPatch`) extracted into the existing `workspace-helpers.ts` module.
- Element CRUD: `cascadeDeleteElements` and `duplicateElementsInTree` extracted as pure tree-manipulation helpers; the store actions reduce to thin shells handling state-shape concerns (active view fallback, focus, undo, announce).
- View management: `buildInitialViewContent` extracted from `addView` — the auto-population logic for systemLandscape / systemContext / container / component views now lives as a pure, testable helper.
- Cumulative effect: `workspace.ts` shrank from **1543 → 1209 lines (-21.6%)** across the refactor pass. `workspace-helpers.ts` grew from 35 → 485 lines as the new home for pure data-shape helpers.
- Welcome screen decomposed: `WelcomeScreen.tsx` shrank from **1371 → 669 lines (-51%)**. `StartupView`, `CollectionView`, `RowMenu`, and the small presentational atoms (`C4Mark`, `LifecycleButton`, `WelcomeFooter`, artwork, feature strip) now each live in their own file. `WelcomeScreen.tsx` is now a focused state-machine routing between the two screens.
- Canvas decomposed: `Canvas.tsx` shrank from **1276 → 835 lines (-35%)**. Pure node/edge builders (`buildNodes`, `buildEdges`, `buildGroupNodes`, `buildBoundaryNode`, `buildDrillableSet`) and their private helpers (style cascade, handle routing, slot assignment) extracted into `canvasBuilders.ts`. `Canvas.tsx` is now just the stateful React Flow component plus its constants.
- Marked the app package as private to prevent accidental npm publication.
- Removed internal agent planning artifacts from tracked public docs and made the remaining standalone docs fully local with no third-party font requests.
- Extracted filename and external-URL sanitization into shared tested helpers used by downloads, file saves, sidecars, and inspector links.
- Canvas grid spacing and snap-to-grid both move to `32px` so dragged nodes land on visible dots.
- Color theme settings: per-tag styles defined in the workspace override theme colors. The Canvas Settings dialog now calls this out next to the theme picker.
- Auto-arrange (`resetAndRelayout`) is exposed in the command palette with its keystroke.
- Inspector outside-click ignores anything tagged `data-canvas-chrome`, so clicks inside floating side panels no longer dismiss it.
- Renamed `spotlight` → `highlight`/`highlighter` throughout the codebase to match user-facing language. Internal-only refactor; behavior unchanged.

### Fixed
- Removed a stale hidden "Describe your system with AI" label from the welcome screen after AI feature removal.
- Lazy-loaded the create-view dialog consistently so production builds no longer warn about mixed static/dynamic imports.
- Tag chips in the Highlighter now use the same background, foreground, and stroke as the actual node tag style — the chip previews exactly what the node will look like once highlighted.
- Edges no longer light up when only tag/status/team filters are active. They highlight only when a Tech filter matches their `technology` field, or when both endpoints are highlighted.
- Selection is now reconciled between React Flow's internal node state and the workspace store so that an external clear (e.g. clicking a panel chip) doesn't leave the next node click as a no-op.
- Owner field's autocomplete dropdown no longer races with the Inspector's outside-click handler — clicking a suggestion no longer dismisses the panel.
- "Unhandled error null" / `ResizeObserver loop completed with undelivered notifications` no longer flood the console or remote log buffer; both are now treated as benign.
- Replaced deprecated `apple-mobile-web-app-capable` meta tag with the W3C-standard `mobile-web-app-capable` (the legacy one is kept for Safari).

### Security
- Tightened hosted CSP by removing stale AI provider connection allowances and explicitly disallowing frames and form submissions.
- Sanitized native file-save suggestions and sidecar filenames consistently before writing or downloading files.

[Unreleased]: https://github.com/c4hero/c4hero/compare/main...HEAD
