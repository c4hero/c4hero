# Explore workspace architecture

Use **Diagram / Explore** above the canvas to switch modes. Diagram remains the
initial default. Explore shows **Workspace architecture**: every static person,
software system, container and component in the loaded workspace, including
things excluded from the selected authored view. Groups do not add another C4
level. Deployment instances and dynamic playback remain in Diagram.

Scroll or pinch to zoom, drag to pan, or use the existing zoom controls and Fit.
Zoom reveals children inside their parents without changing their positions.
Double-click an element or use **Browse architecture** to explore inside it.
Search (`Ctrl/Cmd+F`) can reach components even when their ancestors are closed.
The map uses your existing inspector, including included-file editing rules.

When you stop navigating, partial detail opens or closes to its nearest state.
This changes detail only: it never snaps or nudges the camera. Selecting an
element freezes detail across the map while you pan or zoom to inspect its
connections. Click empty map space, close the inspector, choose **Clear
selection**, or press Escape to resume. Selecting another element preserves the
freeze; an explicit search/focus command reveals its destination before locking
again.

Cross-system connections appear as quiet directed bundles. Small circles at
system boundaries preview connections on hover. Click a circle to pin/unpin its
fan-out. **Browse architecture → Cross-system connections** provides the same
inspection on a keyboard or touch device, with a list of the actual relationship
IDs, endpoints, descriptions, technologies and interaction styles. Selecting an
internal element reveals only its own (or its descendants') external fan-out.
Edges use the active Diagram theme; cross-system bundles are fainter. Dashed
lines mean asynchronous interaction, never merely a boundary crossing.

Keyboard controls work when you are not typing in a form or the DSL editor:

| Key | Action |
| --- | --- |
| Arrow keys | Pan |
| `+` / `-` | Zoom around viewport center |
| `0` | Fit around floating controls and the open inspector |
| Enter with the map focused | Explore the selected element |
| Escape | Clear selection and pinned connections; exit presentation first |
| `Ctrl/Cmd+F` | Search |
| `P` | Present the current renderer |

Tab reaches mode buttons, search, Browse architecture, connection lists and the
inspector. Reduced-motion preferences remove camera/reveal interpolation.

Explore navigation does not change your DSL, authored view coordinates, or undo
history. Its camera is stored separately for each collection/workspace in this
browser. Returning to Diagram restores its camera; choosing an authored view
also returns to Diagram. A selection absent from that view is cleared.

Map dragging, resizing, connection creation, inline editing and map image export
are not available in Explore. Use Diagram for those actions. DSL, HTML workspace
and knowledge-bundle exports remain available.

Explore shares Diagram’s theme and tag-style cascade, card colors, typography,
type badges, external borders, and canvas grid. Theme changes apply immediately.
Each hierarchy level uses Diagram’s auto-layout engine and group spacing, with
300px rank separation and 250px sibling separation in each level’s local coordinates.
Nested graphs are uniformly fitted beneath the parent header. The first matching landscape, container, or component
view supplies that level’s layout direction; otherwise it uses top-to-bottom.
Each child graph is scaled into its parent card after layout. Systems stay normal
card-sized regardless of descendant count; zoom reveals successively smaller
coordinate scales without moving nodes. Saved Diagram coordinates remain untouched.
