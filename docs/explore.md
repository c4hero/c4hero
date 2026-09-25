# Zoom in existing views

Enable **Zoom** in the left canvas toolbar to use smooth camera motion and reveal
children inside the selected static C4 view. The view dropdown continues to show
your selected view; there is no separate Zoom view. Switching between landscape,
context, container and component views keeps Zoom enabled. Dynamic and deployment
views use their existing renderer and disable this toggle. Enabling Zoom evaluates
the current zoom level immediately, revealing children without another gesture
and preserving the viewport.

Zoom starts from the selected view’s elements and relative placement. Excluded
roots stay excluded; systems and containers reveal their descendants. Container
and component views start at their own level.

Scroll or pinch to zoom, drag empty space (or Space-drag) to pan, or use the existing zoom controls and Fit.
Pinching can start over cards, including nested nodes. Adding a second finger cancels
a tentative node drag and hands the gesture to the same viewport; one-finger editing
resumes with the next touch.
Releasing a moving drag produces a short inertial glide, like C4Zoom. New input
interrupts it immediately; reduced-motion preferences disable it.
Zoom reveals children inside their parents without changing their positions.
Expandable cards have a subtle inset frame. It fades as their children appear;
leaf cards retain a single outline.
Relationship labels use the existing native edge renderer and scale with their nesting level.
Double-click an element to explore inside it.
Search (`Ctrl/Cmd+F`) can reach components even when their ancestors are closed.
The map uses your existing inspector, including included-file editing rules.

When you stop navigating, partial detail opens or closes to its nearest state.
This changes detail only: it never snaps or nudges the camera. Selecting an
element freezes detail across the map while you pan or zoom to inspect its
connections. Click empty map space, close the inspector, choose **Clear
selection**, or press Escape to resume. Selecting another element preserves the
freeze; an explicit search/focus command reveals its destination before locking
again.

At the overview level, Zoom draws the same individual relationships included in
the selected view, using the normal view's routing and styling. Hidden child
relationships do not create extra overview lines or aggregated counts. As children
are revealed, their actual relationships fade in with their endpoints. Dashed
lines indicate asynchronous interaction. Relationships use the existing inspector.

Keyboard controls work when you are not typing in a form or the DSL editor:

| Key | Action |
| --- | --- |
| Arrow keys | Pan |
| `+` / `-` | Zoom around viewport center |
| `0` | Fit around floating controls and the open inspector |
| Enter with the map focused | Zoom the selected element |
| Escape | Clear selection and pinned connections; exit presentation first |
| `Ctrl/Cmd+F` | Search |
| `P` | Present the current renderer |

Tab reaches the Zoom toggle, search, native diagram elements and the inspector. Reduced-motion preferences remove camera/reveal interpolation.

Zoom navigation does not change your DSL, authored coordinates, or undo history.
Camera position and zoom are shared with the normal diagram for each view.
Toggling Zoom preserves the same live React Flow viewport, node elements, edge elements
and measured geometry. There is one renderer: no hidden diagram, canvas overlay,
appearance snapshots or synchronized cameras. Selecting another view clears
selection and opens that view with Zoom still enabled.

Zoom uses the same tool rail, inspector, command palette and editing shortcuts
as Diagram. Drag nodes to arrange them (hold Space to pan); Shift-click or enable
multi-select to select several nodes, or drag a selection rectangle on empty space.
The selection toolbar supports alignment, distribution, straightening, grouping,
locking and deletion. Drag a side handle to create a relationship; selected
relationship endpoints can be dragged to reconnect them. Relationship properties
and line styles use the shared inspector.

Select a system before adding containers, or a container before adding components.
Backspace hides elements from Zoom; the Add panel can restore them. Shift+Delete
uses the same model-deletion confirmation as Diagram. Creation, deletion, grouping,
layout edits and locks use the shared undo/redo history. Root positions and locks
use the same authored view state in both behaviors. Nested positions and visibility
persist per view in the workspace sidecar. Children remain inside their parent boundaries.

Canvas settings apply immediately, including snapping, minimap and theme. Fit and
zoom controls target Zoom. PNG, vector SVG and clipboard image exports capture
Zoom's current viewport. DSL, HTML workspace and knowledge-bundle exports remain
available through the shared export menu.

Zoom shares Diagram’s theme and tag-style cascade, card colors, typography,
type badges, external borders, and canvas grid. Theme changes apply immediately.
Each C4 level starts from the selected view at the root and the closest matching Diagram view below it, preserving its
relative node placement while fitting it inside the semantic hierarchy. Nodes
missing from that view use Diagram auto-layout. When no authored placement is
available, nested graphs choose the orientation that makes children largest.
Explicit Zoom layout directions still take precedence. Descendants use the same native
card components at their nesting scale. Parent descriptions and badges fade as children
appear, while the icon and title remain visible above the child graph. Child graphs
use measured native card/header dimensions, including wrapped technology chips.
Nested text reserves its normal-detail space even when compact content is hidden,
so crossing detail thresholds does not resize or overlap children. Selected parents
remain behind their descendants.
Each child graph is scaled into its parent card after layout. Systems stay normal
card-sized regardless of descendant count; zoom reveals successively smaller
coordinate scales without moving nodes. Navigation alone leaves saved coordinates untouched.

Appearance parity is covered by `e2e/explore/appearance.spec.ts`: all twelve
themes, all four C4 element types, container tag icons and shape overrides,
and compact, normal and full detail. It checks native card and icon geometry,
typography, relationship routing, stroke styles and labels before and after toggling.
`explore.spec.ts` checks DOM identity, camera stability and nested focus;
`editing.spec.ts` checks shared root editing, locks, creation, nested bounds and undo.
The migrated suites also cover touch/presentation, selection freezing, glide interruption,
search through frozen detail, static-view switching, deletion, text scaling, mobile
compact/close-up geometry, stale sidecar positions, alignment, grouping, connection
handles, minimap settings and native PNG/SVG exports.

Renderer-specific checks were retired with the custom painter: painted-text telemetry,
canvas pixel opacity, hidden-layer comparisons, custom SVG primitive counts, custom
label collision suppression and the Browse architecture portal. Their replacements
check the single native DOM, shared typography/relationship styling, native exports
and the existing search/inspector. Root drag tests now expect shared authored coordinates;
nested drag tests still verify sidecar persistence and undo.
The opt-in 500-element benchmark (`EXPLORE_BENCHMARK=1`) measures real animation-frame
intervals and browser long tasks instead of the deleted painter's timing counters.
