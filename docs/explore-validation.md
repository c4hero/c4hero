# Explore implementation and validation

Implementation date: 2026-09-19. Branch: `feat/semantic-explore`.
Worktree: `/home/openclaw/Projects/c4hero-semantic-explore`.
Requirements: `/home/openclaw/Projects/c4zoom/docs/c4hero-semantic-zoom-requirements.md`.

## Implementation

`src/lib/explore/layout.ts` adapts the typed workspace, performs deterministic
bottom-up Dagre layout, and lifts deep relationships to sibling endpoints.
Geometry keys exclude non-geometric properties. Explore never writes view
coordinates. On structural updates it preserves the position of a surviving
selected element and reconciles IDs, selection and portals.

`motion.ts` contains the pointer-anchored logarithmic camera, elapsed-time reveal,
projected-size/occupancy thresholds and continuous endpoint projection. Tuning
is centralized there. `controller.ts` owns gestures, idle completion, exact
selection locking, intentional focus, animation cancellation and persistence.
Animation frames do not publish through Zustand. Idle render work stops.

`renderer.ts` draws Canvas2D surfaces, measured complete system labels, directed
bundles split by interaction style, boundary portals and underpasses. It culls
offscreen nodes/routes and caches text metrics. Real self-relationships are
retained; collapsed ancestors do not invent self-loops. Parent header geometry
is reserved throughout reveal so labels do not overlap emerging children.

`ExploreCanvas.tsx` connects the existing store and inspector and supplies
accessible DOM navigation and relationship lists. Both renderers register with
`activeCamera.ts`; the shared HUD, keyboard and command palette target the
mounted renderer. Diagram-only operations are unavailable in Explore. The
inspector delegates map deselection to Explore so dragging or using chrome
cannot silently release a selection lock.

## Automated verification

- Focused Vitest: nine cases cover deterministic/non-overlapping containment,
  authored model isolation, non-geometric cache keys, empty/cyclic graphs,
  deployment exclusion, direction/style bundles, reveal completion/freeze,
  time-step equivalence, zoom anchoring, endpoint continuity, separate camera
  persistence and mode/store invariants.
- Playwright Explore: mode/camera/document restoration; selected mouse/keyboard
  navigation; search through a lock; a genuinely partial reveal frozen during
  navigation and completed after Escape without camera movement; Northstar
  parser fixture, pin/list inspection and deleted-target reconciliation; touch
  pinch/cancellation, reduced motion, resize and presentation.
- Full `npm run check`: see final delivery results below.
- Existing Diagram regression selection: editing, edges, navigation/undo,
  deployment/dynamic views and exports, file saving/reload/watch, keyboard,
  DSL pane, inspector, search, toolbar and highlighter.

Reproduce browser tests against a separate local server:

```sh
npm run dev -- --port 3104 --host 127.0.0.1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104 npx playwright test e2e/explore --workers=1 --reporter=list
```

The benchmark is opt-in to keep concurrent CI suites from creating noisy
performance failures:

```sh
EXPLORE_BENCHMARK=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104 npx playwright test e2e/explore -g benchmark --workers=1 --reporter=list
```

Do not run the performance trace alongside compilation or other browser suites.
`EXPLORE_TRACE=1` additionally attaches a Chromium performance trace.

## Performance evidence

Fixture: **50 systems, 500 static elements, 1,000 relationships**; deterministic
mix of internal, external, synchronous and asynchronous relationships.
Trace: 240 animation-frame pan inputs with zoom-in then zoom-out, followed by
settling. This records main-thread frame work separately from frame intervals
and observes browser long tasks, including work outside the renderer.

Environment: Linux x86_64 KVM VM, four exposed CPU cores on AMD Ryzen 9 PRO
8945HS, 15 GiB RAM; headless Chromium 151.0.7922.34, Playwright desktop profile,
1280×720, device scale 1. The Windows user-agent in the JSON comes from that
Playwright profile; the host is Linux. Vite development server, installed local
dependencies; no throttling. This is VM/headless evidence, not a claim about all
physical desktops, touch devices or browsers.

Latest normal complete-suite run: **295.8 ms initial layout, 4.0 ms p95 frame work,
5.8 ms maximum frame work, 16.7 ms median frame interval, zero tasks >50 ms**.
See [machine-readable benchmark](screenshots/explore/benchmark.json).
An independent traced run recorded 544.9 ms initial layout, 4.2 ms p95 and no
long tasks. Initial runs varied: p95 9–11.2 ms and occasional 50–107 ms browser
long tasks, including during concurrent repository checks. We have not proven
the source of every outlier. The latest isolated traces meet the proposed target;
this does not establish a zero-long-task guarantee under host contention.

## Visual review

Compared with the locally served C4Zoom **Current** view. The resulting nested
map, stable positions, quiet bundles and small circle portals use C4Hero's own
palette/chrome rather than copying C4Zoom's navigation shell.

- [Reference Current](screenshots/explore/reference-current.png)
- [Diagram before entering](screenshots/explore/diagram-before.png)
- [Explore overview](screenshots/explore/explore-overview.png)
- [Partial reveal with selection lock](screenshots/explore/explore-partial.png)
- [Expanded system](screenshots/explore/explore-expanded.png)
- [Selected external connections](screenshots/explore/explore-connections.png)

## Scope and limitations

The specified first-release exclusions remain: map editing and map image
export, deployment hierarchy, dynamic playback, alternate reference styles and
3D. No backend, DSL syntax, authored view, or duplicate workspace model was
introduced. Pan is direct manipulation without momentum; camera zoom/focus and
reveal use elapsed-time smoothing unless reduced motion is requested.

Browser automation covers Chromium and emulated touch. Real-device Safari,
Firefox, assistive-technology testing and physical trackpad testing were not
performed. Visual evidence is review material, not pixel-diff parity testing.
The dev hostname is Cloudflare Access gated; local-origin browser verification
must be distinguished from an authenticated end-to-end hostname visit.

## Final delivery results

- `npm run check`: passed; 168 test files, 3,219 tests passed, 100 skipped;
  lint, TypeScript and production build passed.
- After the final store/command/inspector refinements, targeted lint/typecheck,
  460 affected unit tests and the production build passed.
- Existing Diagram regressions: 57/58 passed on the first run. The failure
  exposed the new mode switch covering the established empty-canvas target;
  moving it under the central top bar fixed it. Both DSL-pane tests then passed,
  including the originally failing round-trip. All 58 scenarios are covered by
  passing results across those runs.
- Final served-origin run: **7/7 passed**, including four Explore interaction
  scenarios, the benchmark and both DSL-pane regressions (32.9 seconds).
- Final arrowhead-base trimming: targeted lint, production build and the
  Northstar relationship/portal browser scenario passed; its screenshots were refreshed.
- `git diff --check`: clean. Source, documentation and evidence are uncommitted.

The existing `c4hero-dev.service` now runs this worktree on port 3004. The
reversible override is
`~/.config/systemd/user/c4hero-dev.service.d/semantic-explore.conf`; the original
base unit remains intact. Dependencies are isolated in this worktree and the
existing development environment was copied without changes. To restore the
base checkout, remove only that override, daemon-reload and restart the user
service. No DNS, tunnel or Access policy was changed.

Verified: effective systemd working directory, active service, origin HTTP 200,
served App source importing Explore, and the public hostname's HTTP 302 redirect
to `kevnord.cloudflareaccess.com`. Browser tests used that service's localhost
origin. Authenticated end-to-end Access browsing was not performed.

The existing personal-KB c4hero hosting procedure was corrected to document
effective working directories and worktree overrides; validation reports zero
errors (seven pre-existing warnings). KB changes are also uncommitted.

## Diagram style and layout follow-up

Explore now shares the Diagram element-style cascade and auto-layout engine,
including rank/node separation, group handling, authored level directions and
boundary padding. Canvas cards use theme colors, type icons/badges, external
borders and the Diagram dot grid. Live theme updates preserve camera and geometry.

Validation: full `npm run check` passed (168 files, 3,220 tests passed, 100
skipped); five browser interaction/theme scenarios passed. Screenshot review
corrected overview label size and suppressed metadata that could overlap badges.
The first benchmark had one 52ms long task. After batching grid dots and caching
icon paths, the repeated 500-element/1,000-relationship benchmark passed:
270.7ms initial layout, 4.6ms p95 drawing, 5.7ms maximum drawing, no long tasks,
and 16.7ms median frame interval. Updated screenshots and benchmark are stored
alongside this report. The service is active; the public hostname returns the
expected Cloudflare Access 302 redirect.

## Compact Diagram-like overview correction

The previous version still inflated parent cards to hold every descendant at
one world scale. Each nested level now uses a uniformly scaled Diagram layout
inside a standard-sized parent card. Descendant counts no longer inflate root
geometry. Geometry remains fixed during semantic reveal, and focus supports the
larger zoom range needed to reach components. Camera storage uses v2 so stale
coordinates from the oversized layout do not restore an unusable overview.
Connections are curved and overview bundles carry relationship labels. The
closed navigator no longer reserves a full-width sidebar during Fit.

The six-browser-scenario run passed, including deep focus, real wheel partial
reveal locking, theme updates, and the benchmark (264.3ms layout, 5.1ms p95 draw,
13.9ms max draw, no long tasks). An earlier run had an intermittent 67ms long task;
the final complete run passed without it. Reviewed Big Bank and Northstar
screenshots are stored in `screenshots/explore/`.
