# Explore workspace architecture

Use **Diagram / Explore** above the canvas to switch modes. Diagram remains the
initial default. Explore shows **Workspace architecture**: every static person,
software system, container and component in the loaded workspace, including
things excluded from the selected authored view. Groups do not add another C4
level. Deployment instances and dynamic playback remain in Diagram.

Scroll or pinch to zoom, drag empty space (or Space-drag) to pan, or use the existing zoom controls and Fit.
Releasing a moving drag produces a short inertial glide, like C4Zoom. New input
interrupts it immediately; reduced-motion preferences disable it.
Zoom reveals children inside their parents without changing their positions.
Expandable cards have a subtle inset frame. It fades as their children appear;
leaf cards retain a single outline.
Relationship labels scale with their nesting level, fade in at readable sizes,
and are omitted where they would overlap cards or other labels.
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

Explore uses the same tool rail, inspector, command palette and editing shortcuts
as Diagram. Drag nodes to arrange them (hold Space to pan); Shift-click or enable
multi-select to select several nodes, or drag a selection rectangle on empty space.
The selection toolbar supports alignment, distribution, straightening, grouping,
locking and deletion. Drag a side handle to create a relationship; selected
relationship endpoints can be dragged to reconnect them. Relationship properties
and line styles use the shared inspector.

Select a system before adding containers, or a container before adding components.
Backspace hides elements from Explore; the Add panel can restore them. Shift+Delete
uses the same model-deletion confirmation as Diagram. Creation, deletion, grouping,
layout edits and locks use the shared undo/redo history. Explore positions, hidden
elements, layout direction and locks persist in the workspace sidecar separately
from authored Diagram coordinates. Children remain inside their parent boundaries.

Canvas settings apply immediately, including snapping, minimap and theme. Fit and
zoom controls target Explore. PNG, vector SVG and clipboard image exports capture
Explore's current viewport. DSL, HTML workspace and knowledge-bundle exports remain
available through the shared export menu.

Explore shares Diagram’s theme and tag-style cascade, card colors, typography,
type badges, external borders, and canvas grid. Theme changes apply immediately.
Each C4 level starts from the closest matching Diagram view, preserving its
relative node placement while fitting it inside the semantic hierarchy. Nodes
missing from that view use Diagram auto-layout. When no authored placement is
available, nested graphs choose the orientation that makes children largest.
Explicit Explore layout directions still take precedence. Leaf-node text scales with zoom; expanded
parent headers stay compact to leave room for their children.
Each child graph is scaled into its parent card after layout. Systems stay normal
card-sized regardless of descendant count; zoom reveals successively smaller
coordinate scales without moving nodes. Saved Diagram coordinates remain untouched.
