# c4hero — Product Requirements Document

**Version:** 2.0
**Date:** 2026-03-16
**Status:** Final Draft

---

## 1. Executive Summary

**c4hero** is an open-source, web-based software architecture modelling and visualization platform built on the C4 model framework. It provides an interactive, visual-first experience for creating and exploring C4 architecture models — while using **Structurizr DSL as the native file format**. Your architecture lives in a `.dsl` file in your git repo; c4hero is the visual editor for it.

c4hero treats architecture as a **living, model-driven artifact** — not a collection of static diagrams. Users build a single source of truth model, and diagrams are interactive views projected from that model. Changes propagate automatically across all views and are saved directly to the DSL file.

**Core thesis:** Architecture documentation fails because it's either too hard to create (Structurizr DSL) or too disconnected from a real model (draw.io, Miro). c4hero bridges this gap with a visual-first experience that reads and writes the standard Structurizr DSL format — no data lock-in, no proprietary formats.

---

## 2. Problem Statement

### Pain points in existing tools

| Problem | Who feels it | Current workarounds |
|---|---|---|
| **Structurizr DSL is powerful but text-only** — steep learning curve, no visual editing, poor discoverability | Architects new to C4, teams wanting visual collaboration | Switch to draw.io/Miro (lose model), or suffer through DSL-only workflow |
| **General diagramming tools (Miro, draw.io, Visio) are diagram-based, not model-based** — each diagram is independent, changes don't propagate, no validation | Teams maintaining architecture docs long-term | Manual cross-updating of diagrams, documentation rot |
| **IcePanel is closed-source, SaaS-only, expensive at scale** — $40-80/editor/month, no self-hosted option, proprietary data format | Cost-conscious teams, enterprises with data residency needs, open-source advocates | Accept vendor lock-in or use inferior tools |
| **No tool offers visual editing that saves to Structurizr DSL** | Teams invested in architecture-as-code wanting a better UX | Maintain parallel DSL files and visual diagrams |
| **Collaboration on architecture changes lacks structure** — no review workflows, no branching, no conflict resolution | Engineering teams treating architecture as code | Informal Slack discussions, stale Confluence pages |

### Target users

- **Primary:** Software architects, platform engineers, tech leads who own system design
- **Secondary:** Engineering teams who consume and contribute to architecture documentation
- **Tertiary:** Product managers, business stakeholders who need to understand system structure (as viewers)

---

## 3. Product Vision

> **c4hero makes software architecture visible, collaborative, and alive — for every team, at every scale.**

### Design principles

1. **Model-first, diagram-second.** The model is the source of truth. Diagrams are views.
2. **DSL is the file format.** Workspaces are saved as Structurizr DSL files — diffable, reviewable, git-friendly. No proprietary formats.
3. **Visual by default.** Rich visual canvas as the primary interface for creating and editing architecture.
4. **Zoomable architecture.** Navigate between C4 levels by clicking into elements — architecture as an interactive map.
5. **Strict C4.** Opinionated adherence to the C4 model. No freeform diagramming — constraints enable clarity.
6. **Open-source.** MIT-licensed core, free forever. Community-driven.

---

## 4. Project Context

- **Team:** Solo developer with AI-assisted development
- **License:** MIT (open-source)
- **Business model:** Open-core. Core app is free and open-source. Paid hosted tier planned for the future (not advertised at launch).
- **Marketing site:** Separate private repository at c4hero.io
- **Branding:** `c4hero` (lowercase canonical form), primary domain c4hero.io

---

## 5. Scope and Phases

### Phase 1 — MVP

Core modelling, visual canvas, full Structurizr DSL parser + serializer, import/export, tags/perspectives, basic presentation mode, AI-assisted features, single-user client-only web app.

### Phase 2 — Collaboration + Flows

Real-time multi-user editing, comments, sharing, team workspaces, flows (visual storytelling), project directory support (multi-file `!include`).

### Phase 3 — Workflows

Drafts (branching), review/merge, version history, change tracking, documentation/ADRs.

### Phase 4 — Ecosystem

API, integrations (CI/CD, docs platforms, IDEs), Tauri desktop app, Structurizr API integration, self-hosting guide.

---

## 6. Technical Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| **Frontend** | React + TypeScript | Largest ecosystem, best canvas library support |
| **Canvas engine** | React Flow (xyflow) | Purpose-built for node-based UIs, handles pan/zoom/edges/minimap, MIT licensed |
| **Delivery** | Static web SPA (MVP), Tauri desktop wrapper (Phase 4) | Zero-install for widest reach; abstract file I/O layer enables Tauri later |
| **Backend** | None (client-only MVP) | No server needed. Auto-save to local `.dsl` file via File System Access API |
| **Persistence format** | Structurizr DSL (`.dsl` files) | What engineers want in git. Human-readable, diffable, reviewable in PRs |
| **Internal model** | Structurizr workspace JSON schema in-memory | JSON in localStorage for crash recovery; DSL is the canonical save format |
| **DSL parser** | Full Structurizr DSL parser + serializer (TypeScript, Chevrotain/Peggy) | DSL is the save format, so both directions are required from day 1 |
| **Unsupported DSL features** | Opaque pass-through | Features not visually supported (`!script`, `archetypes`) are preserved as-is on round-trip — never discard user data |
| **Icons** | Structurizr themes | Community-maintained theme URLs (AWS, Azure, GCP, k8s, etc.). No custom catalogue needed |
| **Scope** | Strict C4 model only | No freeform/custom diagrams. Opinionated constraints keep the product focused |
| **Workspace model** | One workspace at a time + Open Recent | Single active `.dsl` file. Recent files list for quick switching |

---

## 7. Feature Requirements

### 7.1 Architecture Model (Core Data Model)

The model layer is **fully compatible with the Structurizr workspace JSON schema** (v1.29.0+). All model entities map to the Structurizr schema.

#### 7.1.1 Model Elements

| c4hero Element | C4 Level | Structurizr Entity | Description |
|---|---|---|---|
| **Person** | 1 | `person` | Human users, actors, roles, personas |
| **System** | 1 | `softwareSystem` | Top-level software systems that deliver value |
| **Container** | 2 | `container` | Deployable/runnable units: APIs, web apps, databases, queues |
| **Component** | 3 | `component` | Logical code-level groupings within a container |
| **Group** | — | `group` | Visual organizational boundaries (non-hierarchical) |

> **Note:** Deployment Nodes and Infrastructure Nodes are deferred to Phase 2+. The DSL parser will parse them and the serializer will preserve them, but they won't have visual editing support in the MVP.

**Element properties (all types):**

- `id` — unique identifier (auto-generated, stable)
- `name` — display name (required)
- `description` — short description (120 char display limit) + extended markdown description
- `technology` — technology/stack label (Containers, Components)
- `tags` — user-defined tags for styling, filtering, perspectives
- `status` — lifecycle state: `Live`, `Planned`, `Deprecated`, `Removed`
- `url` — link to external resources (repo, docs, runbook)
- `properties` — arbitrary key-value metadata
- `icon` — technology icon from Structurizr themes
- `owner` — team or individual ownership assignment
- `location` — Internal / External / Unspecified (Persons, Systems)

#### 7.1.2 Relationships (Connections)

Relationships are first-class model entities, not diagram annotations.

**Properties:**

- `id` — unique identifier
- `sourceId` / `destinationId` — connected elements
- `description` — what the relationship represents (e.g., "Sends orders to")
- `technology` — protocol/mechanism (e.g., "REST/HTTPS", "gRPC", "async/Kafka")
- `interactionStyle` — `Synchronous` or `Asynchronous`
- `tags` — for styling and filtering
- `direction` — visual direction: `Outgoing`, `Bidirectional`, `None`
- `lineStyle` — `Curved`, `Straight`, `Orthogonal`
- `properties` — arbitrary key-value metadata

**Implied relationships:** When a relationship is defined between lower-level elements (e.g., Component A → Container B), the system must automatically infer and display the relationship at higher levels (System A → System B) per Structurizr semantics.

**Connections list view:** A filterable, sortable table of all relationships in the model — searchable by source, destination, technology, status, tags.

#### 7.1.3 Hierarchy and Nesting

- Systems contain Containers
- Containers contain Components
- Groups can contain any element type except other Groups
- Elements belong to exactly one parent in the C4 hierarchy but can belong to multiple Groups

---

### 7.2 Visual Canvas

The primary interface is an **infinite, zoomable, pannable canvas** for viewing and editing architecture diagrams.

#### 7.2.1 Canvas Fundamentals

- **Infinite canvas** with smooth pan (click-drag or scroll) and zoom (scroll-wheel, pinch, +/- buttons)
- **Grid snapping** with configurable grid size (optional, toggleable)
- **Minimap** for orientation on large diagrams
- **Undo/redo** with full history stack (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
- **Canvas performance** — must handle 500+ elements smoothly (virtual rendering)
- **Dark theme** as default with the following palette:
  - Background: `#040d14` (near-black navy)
  - Surface: `#081320` → `#0f2030` → `#1e3a50` (progressively lighter)
  - Border: `#163044`
  - Primary accent: `#60a5fa` (blue-400)
  - Primary text: `#e2e8f0`
  - Muted text: `#8b949e`
- **Design aesthetic:** Modern, polished, IcePanel-caliber — floating panels with subtle glassmorphism, smooth transitions/animations, refined typography, generous spacing, and a premium feel. Reference IcePanel's visual quality as the benchmark for UI polish. Clean borders, lots of canvas space, subtle UI chrome.
- **Responsive design:** The app must be mobile-friendly with a fully responsive layout. Desktop is the primary target (canvas-heavy workflow), but the UI must adapt gracefully to tablet and mobile screens — collapsible panels, touch-friendly tap targets, responsive typography, and a usable read-only/navigation experience on small screens. No horizontal scrolling, no broken layouts at any viewport width.

#### 7.2.2 Element Rendering

Each element type has a **distinct visual shape** consistent with C4 model notation:

| Element | Shape | Visual Treatment |
|---|---|---|
| Person | Stick figure / rounded card with person icon | Distinguished from system elements |
| System | Large rounded rectangle | Prominent, contains name + description + tech |
| Container | Medium rounded rectangle | Shows technology badge, icon |
| Component | Small rounded rectangle / component notation | Shows technology badge, icon |
| Group | Dashed boundary region | Semi-transparent, labelled |

**Element cards display:**

- Name (prominent)
- Short description (below name, truncated)
- Technology badge (pill-shaped, below description)
- Status indicator (color-coded dot or border)
- Icon (technology icon, top-left or centered)
- Nested count indicator (e.g., "3 containers") with zoom affordance
- Selection state (highlighted border, resize handles)

#### 7.2.3 Relationship Rendering

- Lines between elements with arrowheads indicating direction
- Label positioned along the line (adjustable)
- Technology label shown as secondary text
- Line styles: solid (synchronous), dashed (asynchronous)
- Routing: curved, straight, orthogonal — configurable per relationship
- Connection points: multiple anchor points per element edge
- Hover state shows full relationship details in tooltip

#### 7.2.4 Interaction Model

**Creating elements:**
- Drag from toolbar palette onto canvas
- Double-click canvas → inline element creation dialog
- Keyboard shortcuts: `Shift+P` (Person), `Shift+S` (System), `Shift+C` (Container), `Shift+O` (Component), `Shift+G` (Group)
- Paste from clipboard (copy element → paste as new)

**Creating relationships:**
- Drag from element connection point to another element
- Select two elements → right-click → "Create relationship"
- Keyboard shortcut on selected element to start connection mode

**Editing:**
- Click element → right panel shows properties editor
- Double-click element name → inline rename
- Multi-select (Shift+click, Cmd/Ctrl+click, drag-select)
- Batch operations: move, delete, tag, change status
- Right-click context menu with common actions

**Navigation (zoomable hierarchy):**
- Click zoom icon / double-click on element to drill into its children (System → Container view, Container → Component view)
- Breadcrumb navigation in header showing current position in hierarchy
- Back button / breadcrumb click to navigate up
- Keyboard: `Enter` to drill in, `Backspace`/`Escape` to go up

#### 7.2.5 Auto-Layout

- **Automatic layout** using Dagre (hierarchical) and force-directed algorithms
- Layout direction options: Top-Bottom, Bottom-Top, Left-Right, Right-Left
- Configurable node spacing and rank spacing
- One-click "Tidy layout" that repositions without changing the user's conceptual arrangement
- Auto-layout on import / new view creation
- Manual positioning overrides persisted per view

---

### 7.3 Views (Diagram Types)

Views are projections of the model. Each view selects which elements and relationships to display.

#### 7.3.1 MVP View Types

| View Type | Scope | Structurizr Key | Description |
|---|---|---|---|
| **System Landscape** | Entire model | `systemLandscape` | All people and systems in the organization |
| **System Context** | One software system | `systemContext` | The system + its direct collaborators |
| **Container** | One software system | `container` | All containers within a system + external dependencies |
| **Component** | One container | `component` | All components within a container + external dependencies |

> **Deferred view types (Phase 2+):** Dynamic, Deployment, Filtered, Custom. The DSL parser will parse these and the serializer will preserve them, but they won't have visual editing/rendering support in the MVP.

#### 7.3.2 View Management

- **Diagram sidebar** listing all views, organized by type
- **Create new view** wizard with scope selection
- **Duplicate view** for creating variations
- **View properties:** title, description, paper size, default layout direction
- **Include/Exclude controls:** visual toggle for which elements and relationships appear
- **Animation steps:** define ordered reveal sequences for presentation mode

#### 7.3.3 Presentation Mode (Basic)

- Full-screen mode with minimal UI
- Step through animation sequences with arrow keys
- No presenter notes or laser pointer in MVP — deferred to Phase 2+

---

### 7.4 Tags and Perspectives

Tags enable overlaying different metadata perspectives onto existing diagrams without duplicating them.

#### 7.4.1 Tag System

- **Tag groups:** Named collections of tags (e.g., "Deployment", "Risk Level", "Cost Center")
- **Tag assignment:** Tags applied to elements and relationships
- **Tag bar:** Bottom-of-canvas bar showing available tag groups; toggle to overlay perspective
- **Visual effects:** Tags can modify element color, border, opacity, icon overlay
- **Filtering:** Filter visible elements by tag inclusion/exclusion
- **Tag-based styling:** Define element/relationship styles per tag (maps to Structurizr's tag-based styling)

---

### 7.5 Structurizr DSL Engine

The DSL engine is the backbone of c4hero. It handles reading, writing, and validating Structurizr DSL — the native file format.

#### 7.5.1 DSL Parser

- **Full Structurizr DSL parser** implemented in TypeScript (Chevrotain or Peggy)
- **Runs in the browser** — no server dependency
- **Supported constructs:**
  - All element types: `person`, `softwareSystem`, `container`, `component`, `deploymentNode`, `infrastructureNode`, `group`
  - Relationships: `->` operator with description, technology, tags
  - Views: all view types (`systemLandscape`, `systemContext`, `container`, `component`, `dynamic`, `deployment`, `filtered`, `custom`)
  - Styles: `element` and `relationship` style blocks
  - Variables: `!const`, `!var`, `${NAME}` references
  - Includes: `!include <file>` (single-file resolution in MVP)
  - Groups, enterprise boundaries
  - Documentation: `!docs`, `!adrs`
  - Properties, perspectives, URLs
- **Opaque pass-through** for features not visually supported: `!script`, `workspace extends`, `archetypes`, `!element`/`!relationship` references. These are preserved as raw text blocks and written back unchanged on save.
- **Validation:** Meaningful error messages with line numbers and column positions
- **Comments:** Preserve `//`, `#`, and `/* */` comments through round-trip

#### 7.5.2 DSL Serializer

- **Generates clean, idiomatic DSL** — not machine-generated noise
- **Formatting:** Proper indentation (4 spaces), logical grouping, blank lines between sections
- **Round-trip fidelity:** `parse(serialize(parse(dsl))) === parse(dsl)` (semantic equivalence)
- **Comment preservation:** Comments associated with elements are maintained through edit cycles
- **Opaque block preservation:** Pass-through blocks written back in their original position

#### 7.5.3 File I/O

- **Auto-save:** Every significant model change triggers a save to the `.dsl` file
- **File System Access API:** Used for reading/writing local files in the browser (Chrome/Edge native, polyfill for Firefox/Safari via download/upload)
- **Crash recovery:** In-memory model periodically backed up to localStorage as JSON
- **File I/O abstraction layer:** All file operations go through a thin interface (`loadWorkspace()`, `saveWorkspace()`) to enable Tauri native FS in Phase 4

#### 7.5.4 Import / Export

**Import:**
- **Structurizr DSL (`.dsl`)** — primary import format, parsed by the DSL engine
- **Structurizr Workspace JSON** — parsed and converted to internal model; useful for importing from Structurizr Cloud/on-prem

**Export:**
- **Structurizr DSL (`.dsl`)** — this is the save format, but also available as explicit "Export" for copy/share
- **Structurizr Workspace JSON** — full schema-compliant JSON export for interop with other Structurizr tools
- **PNG** — rasterized image of the current view (export to file + copy to clipboard)
- **SVG** — vector image of the current view (export to file + copy to clipboard)

> **Deferred export formats (Phase 2+):** PlantUML, Mermaid, PDF, Markdown, static HTML site.

---

### 7.6 AI-Assisted Features

AI features require the user to provide their own API key (OpenAI or Anthropic). No API keys are bundled or required — AI features are opt-in enhancements.

#### 7.6.1 AI-Generated Descriptions

- Given an element's name and technology, auto-generate a concise architecture description
- Available as a button in the element properties panel: "Generate description"
- User can edit/accept/reject the generated text

#### 7.6.2 Natural Language to Model

- Text input where users describe their architecture in plain English
- AI generates a Structurizr DSL model from the description
- Output is loaded into the canvas as a new workspace or merged into the current one
- Available from the welcome screen ("Describe your system") and as a menu action

#### 7.6.3 Code-to-Architecture (Phase 1, basic)

- User points to a codebase (via file upload or directory access)
- AI analyzes the code structure and generates a C4 model
- Extracts: services/applications (containers), major modules (components), database connections, API endpoints, inter-service communication
- Output as Structurizr DSL that the user can refine

---

### 7.7 Onboarding and First-Run Experience

#### 7.7.1 Welcome Screen

When a user opens c4hero for the first time (or with no active workspace):

```
c4hero

[Open a .dsl file]    [Start from template]    [Explore sample]

                    — or —

     [Describe your system with AI]

Templates:
├── Microservices (API gateway + services + databases)
├── Monolith (single system, multiple containers)
├── Event-driven (services + message broker + consumers)
└── Blank workspace

Recent files:
├── ~/projects/myapp/architecture.dsl
├── ~/projects/platform/workspace.dsl
└── ...
```

#### 7.7.2 Sample Workspace

- Pre-loaded **Big Bank plc** example (from Structurizr docs) — a complete, realistic C4 model
- Demonstrates all 3 C4 levels, relationships, tags, multiple views
- Users can explore, modify, and save-as to learn by doing

#### 7.7.3 Templates

- Pre-written `.dsl` files for common architecture patterns
- Each template is a valid, working Structurizr DSL file with elements, relationships, and views
- Templates are bundled with the app (not fetched from a server)

#### 7.7.4 Contextual Hints

- Subtle, inline hints that appear at the moment of need:
  - Empty canvas: "Press Shift+S to add a system, or drag from the toolbar"
  - Hovering an element edge: "Drag to create a connection"
  - First time drilling in: "Click the breadcrumb to navigate back up"
- Hints fade/dismiss after first use (tracked in localStorage)
- No guided tour overlay — hints are contextual, not sequential

---

### 7.8 Technology Catalogue (via Structurizr Themes)

- **Structurizr theme import:** Load theme JSON from URLs (community-maintained themes for AWS, Azure, GCP, Kubernetes, etc.)
- **Icons from themes** applied automatically to elements based on technology tags
- **Auto-suggest** when typing technology fields — suggests known technologies from loaded themes
- **Custom technology entries** with user-uploaded icons (stored in the DSL `properties` or as inline base64)

---

### 7.9 Search and Discovery

- **Global search** (`Cmd/Ctrl+K`) across all elements, relationships, and views
- **Filter by type**, status, technology, tags, owner
- **Search results** link directly to the element on the canvas
- **Element inventory** — tabular view of all elements with sortable columns
- **Orphan detection** — find elements not included in any view
- **Relationship matrix** — grid showing which elements connect to which

---

## 8. Deferred Features (Phase 2+)

The following features are **not in the MVP** but are planned for future phases. The DSL parser/serializer will preserve all related DSL constructs through round-trip to avoid data loss.

| Feature | Phase | Notes |
|---|---|---|
| **Flows (visual storytelling)** | Phase 2 | Step-by-step interaction narratives overlaid on diagrams |
| **Deployment diagrams** | Phase 2 | Deployment nodes, infrastructure nodes, container instances |
| **Dynamic views** | Phase 2 | Ordered interaction sequences |
| **Filtered views** | Phase 2 | Tag-based include/exclude on existing views |
| **Custom views** | Phase 2 | Ad-hoc diagrams outside strict C4 |
| **Multi-file workspaces** | Phase 2 | Project directory support, `!include` resolution across files, file tree in sidebar |
| **Domains** | Phase 2 | Top-level organizational units for large models |
| **Real-time collaboration** | Phase 2 | Multiplayer canvas via CRDTs (Yjs), presence, follow mode |
| **Comments and annotations** | Phase 2 | Threaded comments on elements/relationships/views |
| **Sharing** | Phase 2 | Share links (public, password-protected), embeddable views |
| **Drafts (branching)** | Phase 3 | Git-like branch/review/merge for architecture changes |
| **Version history** | Phase 3 | Snapshots, version timeline, revert, diff |
| **Documentation / ADRs** | Phase 3 | Markdown docs and Architecture Decision Records attached to elements |
| **Roles and permissions** | Phase 3 | Owner/Admin/Editor/Commenter/Viewer roles |
| **Tauri desktop app** | Phase 4 | Native desktop wrapper for seamless file access |
| **Structurizr API integration** | Phase 4 | Push/pull to Structurizr Cloud/on-prem |
| **Plugin system** | Phase 4 | Third-party extensions |
| **PlantUML/Mermaid export** | Phase 2 | Additional export formats |
| **PDF export** | Phase 2 | Print-ready export |
| **Presenter notes** | Phase 2 | Notes per animation step in presentation mode |

---

## 9. UI/UX Specifications

### 9.1 Layout Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  [c4hero]  [Breadcrumb: Workspace > System > Container]   [⚙] [👤] │
│            [Diagram: ▾ Container View]                              │
├────────┬─────────────────────────────────────────────────┬──────────┤
│        │                                                 │          │
│  Left  │                                                 │  Right   │
│ Panel  │              Visual Canvas                      │  Panel   │
│        │              (infinite,                         │ (Props   │
│ - Views│               zoomable)                         │  Editor) │
│ - Tree │                                                 │          │
│ - Search                                                 │          │
│        │                                                 │          │
│        │                                                 │          │
│        │                                                 │          │
├────────┴──────────────────────────────────┬──────────────┴──────────┤
│  [Tags bar]                               │  [Zoom: - 100% +] [⊞]  │
└───────────────────────────────────────────┴─────────────────────────┘
```

**Design language:** Modern, polished, IcePanel-caliber. Floating panels with subtle glassmorphism and refined borders (`#163044`). Dark navy background (`#040d14`). Smooth micro-animations on interactions (panel open/close, hover states, selection). Premium typography with proper hierarchy. Maximum canvas space. Panels collapsible.

### 9.1.1 Responsive Behavior

| Breakpoint | Layout Behavior |
|---|---|
| **Desktop (≥1024px)** | Full 3-column layout: left panel + canvas + right panel |
| **Tablet (768–1023px)** | Canvas full-width, panels as slide-over overlays triggered by toggle buttons |
| **Mobile (<768px)** | Canvas full-screen with minimal floating toolbar. Panels as full-screen modals. Touch-optimized tap targets (min 44px). Pinch-to-zoom on canvas. |

- All panels auto-collapse below 1024px
- Touch gestures: pinch-zoom, two-finger pan on canvas
- No horizontal overflow at any viewport width
- Font sizes and spacing scale down gracefully on smaller screens

### 9.2 Left Panel (Navigation)

- **Views tab:** List of all views, organized by type, with search
- **Model tree tab:** Hierarchical tree of all elements (expandable)
- **Search tab:** Global search with type/tag/status filters
- **Collapsible** (maximize canvas space)

### 9.3 Right Panel (Properties Editor)

- **Element properties** when an element is selected: name, description, technology, status, tags, owner, icon, links, connections, "appears in" (list of views), AI generate description button
- **Relationship properties** when a connection is selected
- **View properties** when nothing is selected: view title, description, layout settings
- **Collapsible** (maximize canvas space)

### 9.4 Top Bar

- **Left:** c4hero logo, workspace file name, breadcrumb hierarchy
- **Center:** Current diagram selector (dropdown)
- **Right:** Export menu, settings, AI settings (API key)

### 9.5 Bottom Bar

- **Tags bar:** Toggle tag groups to overlay perspectives
- **Zoom controls:** Zoom slider, fit-to-screen, percentage display
- **Minimap toggle**

### 9.6 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift+P` | Create Person |
| `Shift+S` | Create System |
| `Shift+C` | Create Container |
| `Shift+O` | Create Component |
| `Shift+G` | Create Group |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+K` | Global search |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+O` | Open file |
| `Delete` / `Backspace` | Delete selected |
| `Enter` | Drill into selected element |
| `Escape` | Navigate up / deselect |
| `Space` (hold) | Pan mode |
| `+` / `-` | Zoom in/out |
| `0` | Fit to screen |
| `F` | Enter presentation mode |
| `Arrow keys` | Step through animation (in presentation mode) |

---

## 10. Technical Architecture

### 10.1 High-Level Stack (MVP)

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React + TypeScript | Component model, ecosystem, React Flow compatibility |
| **Canvas Engine** | React Flow (xyflow) | Purpose-built for node-based UIs, pan/zoom/edges/minimap, MIT licensed |
| **State Management** | Zustand | Lightweight, performant for canvas state, minimal boilerplate |
| **DSL Parser** | Custom parser (Chevrotain or Peggy, TypeScript) | Full Structurizr DSL support, runs in browser |
| **File I/O** | File System Access API + abstraction layer | Local file saves; abstraction enables Tauri later |
| **Build** | Vite | Fast builds, good React/TypeScript support |
| **Styling** | Tailwind CSS | Utility-first, matches minimal design aesthetic |
| **AI Integration** | OpenAI/Anthropic client SDKs (browser) | User provides own API key, runs client-side |
| **Hosting** | Vercel / Netlify / GitHub Pages | Static SPA, free tier, instant deploys |

### 10.2 Data Flow

```
                    ┌─────────────┐
                    │  .dsl file  │ ← source of truth (on disk / File System Access API)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  DSL Parser │ → parse on open
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Internal   │ ← in-memory workspace model (Structurizr JSON schema)
                    │   Model     │ ← also backed up to localStorage for crash recovery
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
       │   Canvas     │ │ Tags │ │  Properties │
       │  (React Flow)│ │ Bar  │ │   Panel     │
       └──────┬──────┘ └──────┘ └──────┬──────┘
              │                        │
              └────────────┬───────────┘
                           │ ← user edits update in-memory model
                    ┌──────▼──────┐
                    │ DSL Serial- │ → auto-save on change
                    │   izer      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  .dsl file  │ ← updated file written back
                    └─────────────┘
```

### 10.3 Internal Data Model

The internal model follows the Structurizr workspace JSON schema, extended with c4hero-specific metadata stored in `properties` for Structurizr compatibility.

```
Workspace
├── Model
│   ├── People[]
│   ├── SoftwareSystems[]
│   │   └── Containers[]
│   │       └── Components[]
│   ├── DeploymentNodes[] (parsed but not visually editable in MVP)
│   │   ├── InfrastructureNodes[]
│   │   ├── ContainerInstances[]
│   │   └── SoftwareSystemInstances[]
│   └── Relationships[] (flattened, cross-referenced by sourceId/destinationId)
├── Views
│   ├── SystemLandscapeViews[]
│   ├── SystemContextViews[]
│   ├── ContainerViews[]
│   ├── ComponentViews[]
│   ├── DynamicViews[] (parsed, not editable in MVP)
│   ├── DeploymentViews[] (parsed, not editable in MVP)
│   ├── FilteredViews[] (parsed, not editable in MVP)
│   ├── CustomViews[] (parsed, not editable in MVP)
│   └── Configuration (styles, themes, branding, terminology)
├── Documentation (parsed, not editable in MVP)
│   ├── Sections[]
│   └── Decisions[] (ADRs)
├── OpaqueBlocks[] (raw DSL text for !script, archetypes, etc.)
└── Configuration
```

### 10.4 Canvas Architecture

- **Rendering:** React Flow handles the canvas fundamentals (pan, zoom, viewport, minimap). Custom node components render C4 elements with the correct visual treatment.
- **Custom nodes:** One React component per element type (PersonNode, SystemNode, ContainerNode, ComponentNode, GroupNode)
- **Custom edges:** Relationship rendering with labels, technology badges, line styles
- **Layout engine:** Dagre for hierarchical auto-layout, integrated via `@dagrejs/dagre`
- **Performance targets:** 60fps pan/zoom with 500+ elements, <100ms element creation, <16ms interaction response

---

## 11. Non-Functional Requirements

### 11.1 Performance

| Metric | Target |
|---|---|
| Initial load (workspace <100 elements) | <2s |
| Initial load (workspace 500+ elements) | <5s |
| Canvas pan/zoom FPS | 60fps |
| Element creation to render | <100ms |
| DSL parse (1000-line file) | <500ms |
| DSL serialize (1000-line output) | <200ms |
| Search results | <200ms |
| Auto-save (DSL write) | <500ms |

### 11.2 Scalability

- Support workspaces with up to 5,000 elements and 10,000 relationships
- DSL files up to 50,000 lines (large multi-system models)

### 11.3 Reliability

- Auto-save on every significant model change (debounced, ~1s after last edit)
- localStorage crash recovery backup updated every 30 seconds
- Graceful handling of File System Access API permission loss (prompt user to re-grant)
- Data export always available (no lock-in)

### 11.4 Responsive Design

- Fully responsive layout from 320px to 4K+ viewports
- Desktop-first design (primary workflow is canvas-heavy), with graceful adaptation to tablet and mobile
- Touch-friendly: minimum 44px tap targets, pinch-to-zoom and two-finger pan on canvas
- Panels collapse to overlays/modals on smaller screens — no cramped side-by-side layouts on narrow viewports
- No horizontal scrolling at any breakpoint
- Tested on: Chrome/Safari iOS, Chrome/Firefox Android, iPad landscape + portrait

### 11.5 Accessibility

- WCAG 2.1 AA compliance
- Keyboard-navigable canvas and all UI panels
- Screen reader support for model tree and element properties
- High contrast mode
- Configurable font sizes

---

## 12. Differentiation from Competitors

| Capability | c4hero | IcePanel | Structurizr | draw.io | Miro |
|---|---|---|---|---|---|
| Model-based (not diagram-based) | Yes | Yes | Yes | No | No |
| Saves to Structurizr DSL | Yes | No | Native | No | No |
| Structurizr DSL import | Yes | Yes | Native | No | No |
| Workspace JSON import/export | Yes | Partial | Native | No | No |
| Visual drag-and-drop canvas | Yes | Yes | No | Yes | Yes |
| Zoomable C4 hierarchy | Yes | Yes | No | No | No |
| Tags as perspectives | Yes | Yes | Filtered views | No | No |
| AI-assisted modelling | Yes | Partial | No | No | No |
| Open-source (MIT) | Yes | No | Partial | Yes | No |
| Free (unlimited, no account) | Yes | Limited | Limited | Yes | Limited |
| Runs locally (no server) | Yes | No | Lite only | Yes | No |
| Dark theme | Yes | Yes | No | Yes | No |

**Key differentiator: c4hero is the visual editor for Structurizr DSL.** Edit your architecture visually, save it as a `.dsl` file in your git repo. No proprietary formats, no vendor lock-in, no account required. Open-source and free.

---

## 13. Monetization Strategy

### 13.1 Current (MVP / Launch)

- **Fully free, open-source, MIT licensed**
- No accounts, no sign-up, no paywalls
- No mention of paid tiers in the app or marketing

### 13.2 Future (Post-Launch, When Ready)

- Paid hosted tier for collaboration features (real-time editing, sharing, team workspaces)
- Pricing strategy TBD — will be informed by adoption data and user feedback
- Core modelling/canvas/DSL features remain free forever

---

## 14. Success Metrics

### 14.1 Adoption

| Metric | 6-month target | 12-month target |
|---|---|---|
| GitHub stars | 2,000 | 10,000 |
| Monthly active users (via anonymous analytics) | 1,000 | 5,000 |
| DSL files opened per month | 500 | 2,500 |

### 14.2 Quality

| Metric | Target |
|---|---|
| Structurizr DSL round-trip fidelity | 100% (zero data loss on import → save) |
| Canvas crash rate | <0.1% of sessions |

---

## 15. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Full Structurizr DSL parser is complex | High | High | Use Chevrotain/Peggy for robust parsing; reference existing open-source parsers; opaque pass-through for exotic features |
| DSL serializer produces ugly/non-idiomatic output | High | Medium | Extensive test suite comparing serializer output against canonical DSL examples; preserve formatting hints from parser |
| Canvas performance at scale | High | Medium | React Flow handles virtualization; benchmark continuously; custom node rendering optimized for performance |
| File System Access API browser support | Medium | Medium | Chrome/Edge have full support; Firefox/Safari fallback to download/upload; clear messaging in UI about best browser |
| AI features depend on user-provided API keys | Low | Low | AI is opt-in, clearly marked. Core product works fully without AI. Clear setup instructions. |
| IcePanel has strong head start and brand | Medium | High | Compete on openness (OSS, MIT, DSL-native, no account), not on features. Target the Structurizr community first. |
| C4 model is niche — limited market size | Medium | Medium | Position as "visual editor for Structurizr DSL" to capture existing community; broader "architecture documentation" positioning later |

---

## 16. Open Questions (Remaining)

1. **Level 4 (Code) diagrams:** Follow IcePanel's lead in omitting them permanently, or offer basic support via AI code analysis in a future phase?
2. **Plugin system:** How extensible should the platform be? Should third parties be able to add custom element types, view types, or integrations? (Phase 4 consideration)
3. **Mobile support:** Read-only mobile viewer, or desktop-only?
4. **Analytics:** What anonymous usage analytics (if any) should be collected for an open-source project? How to respect user privacy while understanding adoption?

---

## 17. Appendix

### A. Structurizr DSL Example (Target Import/Export Fidelity)

```dsl
workspace "Big Bank plc" "A model of the Big Bank plc software system landscape." {

    model {
        customer = person "Personal Banking Customer" "A customer of the bank." "Customer"

        enterprise "Big Bank plc" {
            supportStaff = person "Customer Service Staff" "Answers customer queries." "Bank Staff"
            backoffice = person "Back Office Staff" "Administration and support." "Bank Staff"

            mainframe = softwareSystem "Mainframe Banking System" "Core banking system." "Existing System"
            email = softwareSystem "E-mail System" "Internal e-mail system." "Existing System"
            atm = softwareSystem "ATM" "Allows withdrawals." "Existing System"

            internetBanking = softwareSystem "Internet Banking System" "Allows customers to manage accounts online." {
                singlePageApp = container "Single-Page Application" "Provides banking functionality." "JavaScript, Angular"
                mobileApp = container "Mobile App" "Provides banking functionality." "Xamarin"
                webApp = container "Web Application" "Delivers the SPA." "Java, Spring MVC"
                apiApp = container "API Application" "Provides banking API." "Java, Spring MVC" {
                    signinController = component "Sign In Controller" "Allows users to sign in." "Spring MVC Controller"
                    resetPassController = component "Reset Password Controller" "Allows users to reset passwords." "Spring MVC Controller"
                    accountsSummary = component "Accounts Summary Controller" "Provides account summaries." "Spring MVC Controller"
                    securityComponent = component "Security Component" "Authentication and authorization." "Spring Bean"
                    emailComponent = component "E-mail Component" "Sends e-mails." "Spring Bean"
                    mainframeFacade = component "Mainframe Banking System Facade" "Facade to the mainframe." "Spring Bean"
                }
                database = container "Database" "Stores user data." "Oracle 12c" "Database"
            }
        }

        # Relationships
        customer -> internetBanking "Views account balances and makes payments"
        internetBanking -> mainframe "Gets account information from"
        internetBanking -> email "Sends e-mail using"
        email -> customer "Sends e-mails to"
        customer -> supportStaff "Asks questions to" "Telephone"
        supportStaff -> mainframe "Uses"
        customer -> atm "Withdraws cash"
        atm -> mainframe "Uses"
        backoffice -> mainframe "Uses"

        # Container-level relationships
        customer -> webApp "Visits" "HTTPS"
        customer -> singlePageApp "Views and interacts"
        customer -> mobileApp "Views and interacts"
        webApp -> singlePageApp "Delivers"
        singlePageApp -> apiApp "Makes API calls" "JSON/HTTPS"
        mobileApp -> apiApp "Makes API calls" "JSON/HTTPS"
        apiApp -> database "Reads from and writes to" "JDBC"
        apiApp -> mainframe "Makes API calls" "XML/HTTPS"
        apiApp -> email "Sends e-mail using" "SMTP"

        # Component-level relationships
        singlePageApp -> signinController "Makes API calls" "JSON/HTTPS"
        singlePageApp -> resetPassController "Makes API calls" "JSON/HTTPS"
        singlePageApp -> accountsSummary "Makes API calls" "JSON/HTTPS"
        signinController -> securityComponent "Uses"
        resetPassController -> securityComponent "Uses"
        resetPassController -> emailComponent "Uses"
        accountsSummary -> mainframeFacade "Uses"
        securityComponent -> database "Reads from and writes to" "JDBC"
        emailComponent -> email "Sends e-mail using" "SMTP"
        mainframeFacade -> mainframe "Makes API calls" "XML/HTTPS"
    }

    views {
        systemLandscape "SystemLandscape" "The system landscape for Big Bank plc." {
            include *
            autoLayout
        }

        systemContext internetBanking "SystemContext" "The system context for Internet Banking." {
            include *
            autoLayout
        }

        container internetBanking "Containers" "The containers within Internet Banking." {
            include *
            autoLayout
        }

        component apiApp "Components" "The components within the API Application." {
            include *
            autoLayout
        }

        styles {
            element "Person" {
                color #ffffff
                fontSize 22
                shape Person
            }
            element "Customer" {
                background #08427b
            }
            element "Bank Staff" {
                background #999999
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Existing System" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Database" {
                shape Cylinder
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
        }
    }
}
```

### B. Design Palette Reference

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#040d14` | App background, canvas background |
| `--surface-1` | `#081320` | Panel backgrounds |
| `--surface-2` | `#0f2030` | Card backgrounds, input fields |
| `--surface-3` | `#1e3a50` | Hover states, active items |
| `--border` | `#163044` | Panel borders, dividers |
| `--accent` | `#60a5fa` | Primary buttons, links, selection highlights |
| `--text-primary` | `#e2e8f0` | Headings, element names |
| `--text-muted` | `#8b949e` | Descriptions, secondary text, hints |

### C. Glossary

| Term | Definition |
|---|---|
| **C4 Model** | A hierarchical approach to software architecture diagramming with 4 levels: Context, Container, Component, Code |
| **Structurizr DSL** | A text-based domain-specific language for defining C4 models |
| **Workspace** | The top-level container for a complete architecture model + views + documentation |
| **Model** | The structured data representing all elements and relationships in the architecture |
| **View** | A projection/diagram rendered from the model, showing a subset of elements |
| **Tag** | A user-defined label applied to elements/relationships for styling, filtering, and perspectives |
| **Implied Relationship** | An automatically inferred higher-level relationship derived from lower-level connections |
| **Opaque Pass-through** | DSL constructs that c4hero preserves but doesn't visually support — parsed as raw text and written back unchanged |

---

*This PRD is a living document. Update as decisions are made and requirements evolve.*
