# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Element lifecycle status is now an open vocabulary. `Live`, `Planned`,
  `Deprecated` and `Removed` still ship as the built-ins and nothing changes for
  workspaces that only use them, but a status c4hero does not know is no longer
  inert: a `"c4hero.status"` property with any value now becomes a first-class
  status on load — it gets a status dot, a filter in the highlighter bar, and an
  entry in the inspector. Extra values can also be declared up front under
  **Custom statuses** in canvas settings, so they can be chosen before any
  element has one. Custom statuses take a colour derived from their own name;
  the built-ins keep their themeable `--color-status-*` custom properties.

### Fixed

- Exported PNG and SVG images now include relationship arrowheads (#207).
- Relationship arrowheads and start dots take the relationship's own color
  instead of always using the theme edge color.
- Orphaned view layout retained after deleting a view in the DSL code pane can
  now be reviewed and permanently removed with **Clean Up Orphaned View
  Layout** in the command palette. Cleanup lists the affected view keys, is
  undoable, and leaves current-view layout untouched. (TEA-343)
- Preserve saved layout for temporarily missing views and elements through model
  edits and repeated saves/reopens (#201). Existing sidecars need no migration.
  Explicit view/element deletion and layout reset still remove the affected
  layout, including when the last saved position is cleared. Duplicated
  generated views now have their own persistent key. Bringing hidden elements
  back through view membership, dynamic steps, context relationships, or deployment
  edits restores their layout; exact retained IDs take precedence over name
  matching, and ID changes cannot overwrite retained entries. Failed or cancelled
  DSL saves leave the layout file untouched.
  This is a preservation fix: keyless views can still exchange layout when
  reordered, and generated views remain hidden while explicit views exist.
  Their saved positions are retained for recovery; use explicit, unique view
  keys when stable layout ownership is needed.

## [0.7.0] - 2026-09-18

### Added

- **Turn a review finding into a decision record.** A deep-review finding that
  carries no model edit — a boundary question, a missing contract, a
  scalability concern — used to offer only *Mark done*, which cleared the row
  without recording anything. It now leads with **Draft an ADR about this**:
  the ADR drafter opens with the finding's title as the topic and the finding's
  own detail, suggestion, affected elements and severity handed to the model as
  the problem to decide on — explicitly as a question to weigh, not a verdict
  to write up. The draft goes through the existing *Save to decisions* flow
  into the workspace's `!adrs` folder. Editing the topic yourself drops the
  finding's context, and a draft now survives switching tabs. (TEA-43)
- **The code pane says when saving will change one of your values.** Structurizr
  DSL cannot represent a backslash before `n` or at the end of a value, a comma
  inside a tag, or a carriage return, so c4hero drops them rather than writing
  something the parser would misread — `Shared Folder X:\` became
  `Shared Folder X:` and the tag `v1,beta` became `v1beta`, silently. Those
  changes are now listed before they happen, including the ones that lose data
  outright: two tags that collapse into the same name, two property keys that
  encode to the same key, and a style selector that stops matching the tag it
  was written for. It also covers the one case that was never lossy-only: a
  deployment or infrastructure node's *owner* and *status* have no DSL keyword
  and no properties block to fall back on, so they were dropped on every save,
  not just an awkward one. Nothing is blocked and the drop policy is unchanged
  — the alternative is corrupting the value — you just find out first.
  (TEA-169)
- **The code pane warns when a model other Structurizr tools would reject.**
  c4hero happily holds states the real Structurizr parser refuses to load — an
  element whose name encodes to nothing, a `url` field that isn't a URL, two
  containers of one system (or two deployment nodes of one environment) sharing
  a name, two views sharing a key, a relationship between an element and its
  own parent, or one that duplicates a relationship Structurizr already derives
  from its children. Each one is fine on the canvas and then fails at the point
  the file reaches a colleague. A new validation pass checks all of them
  against the rules of the real parser and reports a count in the code pane's
  footer, with the details on hover. They are warnings only: nothing is
  blocked, nothing is rewritten. (TEA-331)
- **The AI assistant reads your documentation.** When a workspace has
  `!docs` / `!adrs` folders, the deep review, the Q&A chat, the interview
  and the ADR drafter all see them — ranked by closeness to the current
  view and clipped to a budget, so a large bundle never crowds out the
  model. Review findings that rest on, or contradict, a document carry it
  as a citation chip (a model that no longer honours an accepted decision
  is now a high-severity finding), the interviewer stops asking what is
  already written down and probes where the diagram and the docs disagree,
  and a drafted ADR references the decisions it builds on. Citations only
  ever name documents the assistant was actually shown. Still BYOK, still
  local: nothing new is fetched. (TEA-337)
- **Documentation and decision records, read and written from the DSL's
  `!docs` and `!adrs` folders.** c4hero used to carry those Structurizr
  directives through untouched; now it reads the folders they name. The
  inspector gains a *Docs* tab showing the documents and architecture
  decision records attached to the selected element, elements with docs get
  a small book badge on the canvas, and *Documentation…* in the menu (or the
  palette) opens the workspace-level set. Existing folders read as-is —
  plain Structurizr markdown, adr-tools style ADRs with `## Status`,
  supersedes and superseded-by links — and files with Open Knowledge Format
  frontmatter carry their type, tags and status too. Superseded decisions
  show struck through; links between records navigate. *New doc* and *New
  decision* write an OKF-shaped markdown file (numbered adr-tools style for
  decisions), keep the folder's `index.md` in step, and add the `!docs` /
  `!adrs` line to the DSL when the scope had none, as an undoable edit. The
  AI assistant's *Draft ADR* gets *Save to decisions* so a drafted record
  lands in the workspace instead of a download. Needs a folder-backed
  workspace; single-file mode says so. Rendering is a small built-in
  markdown subset, and it never executes anything from a file. (TEA-336)
- **Export the model as an OKF knowledge bundle.** The interactive HTML export
  is the architecture for humans; this is the architecture for agents and
  docs tools. *Export → OKF knowledge bundle* writes the workspace as an
  [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
  bundle: a folder of markdown files with YAML frontmatter, one per person,
  system, container, component, deployment node and view, cross-linked by
  path. Each concept carries its description, tags, technology, owner,
  status, URL and properties, a table of every relationship touching it, its
  children, where it is deployed, and the views it appears in. Save it
  straight into a folder (Chromium) or download it as a `.zip` (everywhere),
  then point a knowledge base, a search index or an AI assistant at it.
  Exporting again into the same folder also removes the concepts that have
  since left the model, so an index built from the bundle never serves
  architecture that no longer exists. The output is deterministic — no
  timestamps — so a re-export diffs cleanly in review. The DSL stays the
  source of truth; the bundle is a one-way projection. (TEA-335)
- **Import C4-PlantUML and Mermaid C4 files.** The largest population of
  existing C4 diagrams lives in `.puml` files and Mermaid `C4Context` /
  `C4Container` / `C4Component` blocks. Paste or drop one into the new
  *Import PlantUML / Mermaid* dialog (welcome screen, app menu, or command
  palette) and get a live, editable canvas plus clean Structurizr DSL. The
  dialog auto-detects the format, previews what it found (people, systems,
  containers, components, relationships) and lists every skipped line with
  its line number, so nothing is dropped silently. People, systems,
  containers and components map with their `_Ext`, `Db` and `Queue`
  variants (external location, Cylinder and Pipe shapes); `System_Boundary`
  / `Container_Boundary` become nesting; `Boundary` / `Enterprise_Boundary`
  become groups; `Rel` in every direction variant and `BiRel` (split in two)
  become relationships; `$named` arguments work. Every import is pushed
  through the Structurizr DSL round trip before it loads, so what you get can
  always be saved. Nothing is fetched: `!include` lines are reported, not
  followed. Out of scope for now: sprites and styling macros, deployment
  nodes, dynamic steps, exporting back. (TEA-255)
- **Multi-file workspaces: `!include` is resolved when you open a folder.**
  A root `workspace.dsl` that pulls in `teams/payments.dsl` and
  `teams/identity.dsl` now renders the whole stitched model, so an
  organisation can keep one landscape over models that each team owns in its
  own file. Every element, relationship, group and view remembers which file
  declared it — the inspector shows *Defined in teams/payments.dsl* — and
  parse errors in an included file name that file and line. Saving never
  flattens: the root file keeps its own content plus the `!include` lines,
  and a plain model fragment included from inside `model { }` is written back
  to its own file with just the content it declared. Anything c4hero can't
  route back yet (a file included inside an element or the views block, a
  file with its own `!` directives, or one wrapped in `model { }`) is shown
  read-only and its edits are refused rather than dropped. Cycles, missing
  files and oversized include graphs fail with a clear message instead of a
  hang or a half-loaded model. Includes are relative to the including file;
  URLs, absolute paths and paths that escape the folder are left as-is.
  (TEA-325, phase B)

### Fixed

- **View keys from an imported file no longer break the export.** Structurizr
  allows only letters, digits, `_` and `-` in a view key, and a file carrying
  one with a space in it — as IcePanel's exporter writes — produced DSL no
  other Structurizr tool would load. Keys are now normalised as the file is
  read, so what c4hero stores and what it writes back stay identical and the
  export loads anywhere; the code pane says which key was rewritten and to
  what, rather than doing it silently. A key written to be read — `"Billing
  Context"` — was also the view's label, so the original text is kept as the
  view's title and nothing is renamed on screen. Keys c4hero generates itself
  were already safe and now stay that way by construction. (TEA-166)
- **Save wrote a copy instead of the file you had open.** In a folder
  collection, the top-bar Save button and Ctrl/Cmd+S went through the
  "save as" flow rather than the file the workspace was opened from — on
  Android, where the browser can only download, that produced
  `Workspace (1).dsl` next to the original. Save, Ctrl+S and autosave now
  share one rule: a workspace linked to a file (single file, or folder plus
  filename) is written in place; only an unlinked one asks where to go.
  (TEA-339)
- **A property with an empty value no longer makes the saved file invalid.**
  Structurizr rejects `"key" ""` ("A property value must be specified"), so
  an element or relationship carrying an empty property produced DSL the
  real parser refused. Such entries are now left out on save, the same way
  a trailing backslash is, and an element whose only properties were empty
  no longer gets an empty block. Found by the new generated conformance
  corpus. (TEA-63)
- **Files saved by an older c4hero no longer load with drifted strings.**
  Before v0.3 c4hero wrote JSON-style escapes (`\\` for a backslash, `\t`
  for a tab); since the lexer started mirroring Structurizr, where only `\"`
  and `\n` are escapes, those files read back with doubled backslashes and a
  literal `\t`, and the next autosave could write the misread values back.
  Old files are now recognised by the keyword lines only that serializer
  produced (`status`, `owner`, `location`, `lineStyle`, `interactionStyle`),
  decoded with the old rule, and migrated to Structurizr's format on the
  next save, with a note in the code pane. A file that has `\\` or `\t` in
  a string but no such marker is read by Structurizr's rule and flagged with
  a warning instead of being changed silently. (TEA-167)
- **Saving no longer deletes `!include`, `!const`, `!var`, `!docs` or `!adrs`
  lines.** The parser used to consume every `!` preprocessor directive and
  drop it, so opening a real Structurizr workspace whose model is split across
  files and saving it silently removed the include lines — the same
  data-loss family as the escape-sequence drift. Directives are now kept
  verbatim, in their original block and order, and written back on save.
  Included content is not loaded yet; the code pane says so with a
  "preserved, not resolved" note rather than pretending the model is
  complete. (TEA-325, phase A)
- **The import dialog is readable again on the welcome screen.** Opening
  *Import PlantUML / Mermaid* from the welcome screen drew the dialog with no
  background of its own, so the page behind it — the heading, the recent
  collection rows — showed straight through the panel and its own text. The
  same dialog opened from the app menu was fine, because that variant takes
  its surface from the slide-down panel style. The centred variant now
  carries the same panel background, border and shadow as every other centred
  dialog. (TEA-332)

## [0.6.0] - 2026-09-10

### Added

- **Watch mode: the canvas follows the file on disk.** Disk sync used to be
  one-way — c4hero wrote, nothing read back — so editing the `.dsl` in another
  editor or switching git branches left a stale diagram that the next autosave
  would silently overwrite. Now the open workspace (and its sidecar) is watched
  and reloaded within a couple of seconds of changing, keeping your active
  view, viewport and selection. Check out the PR branch and the diagram is just
  there. Unsaved local edits are never discarded: a conflict bar offers
  *Reload (discard my changes)* or *Keep mine*. Text that doesn't parse, or
  parses to an empty model, is reported and left unapplied; a deleted file
  leaves your work on the canvas with a hint to save. Only visible tabs poll,
  c4hero's own saves never count as changes, and the collection list refreshes
  when the tab regains focus. Toggle it with the *Watch Mode* command;
  default on wherever a file or folder is linked. (TEA-323)
- **The AI model picker now lists what your key can actually use.** With a
  key present, c4hero asks the provider for its current models (Anthropic
  `/v1/models`, OpenAI `/v1/models`, Gemini `/v1beta/models`), keeps the
  chat-capable ones, and shows them — so new releases such as the Claude 5
  family appear without a code change. The list is cached for a day per key
  so settings open instantly and work offline; a *Refresh* control forces a
  re-fetch. No key, a failed fetch, or a cold cache falls back to the curated
  suggestions, never an empty picker, and you can still type any model id.
  Curated default and cheap-draft ids that a provider has retired resolve to
  their same-family successor, so per-task routing keeps working. The fetch
  never blocks chat. (TEA-249)

## [0.5.0] - 2026-09-05

### Added

- **Edit the DSL next to the canvas, live in both directions.** A dockable
  code pane on the right holds the workspace as Structurizr DSL: edit the model
  on the canvas and the text follows, type in the text and the canvas follows.
  A clean parse applies as a single undo entry and carries element positions,
  pins and locks across, so nothing you laid out is lost round-tripping through
  text. Parse errors surface as gutter diagnostics and simply don't apply —
  a half-typed document can never empty your model. Open it with `mod+e`, the
  tool rail, or the command palette. (TEA-252)
- **See what breaks before you delete it.** The inspector and the command
  palette can now answer "what happens if I remove this?" for any element or
  selection: the children that go with it, every relationship that loses an
  endpoint, the elements that depended on it (and what depended on those, a few
  hops out), anything left with nothing attached, and the views that disappear
  because their scope element did. It's a plain graph walk over the model using
  the same cascade rules as the real delete — nothing is estimated, and no AI is
  involved. Select the blast radius on the canvas from there, or go ahead and
  delete through the usual confirmation. (TEA-72)
- **Export the whole workspace as one interactive HTML file.** Every view, laid
  out and rendered as inline SVG, wrapped in a small read-only viewer: view
  tabs, pan and zoom, drill-through, search and an element details panel. The
  file has no dependencies and makes no network requests — its own
  `Content-Security-Policy` forbids them — so it works from disk, in a wiki, as
  a chat attachment or from a years-old build artifact, with or without c4hero.
  Exports are deterministic, so they diff cleanly in review. Find it in the
  Export dialog or the command palette ("Export as interactive HTML"). (TEA-88)
- **Readable, editable element IDs.** Elements used to carry random eight-letter
  ids, which then became the identifiers in exported DSL. New elements now
  derive a `camelCase` id from their name and keep re-deriving it as you rename,
  so the DSL keeps tracking what things are called. Edit the id yourself in the
  inspector and it pins — renames stop touching it — with a sync button to go
  back to deriving. Identifiers that came from imported DSL are pinned from the
  start, because whoever wrote `paymentService = container ...` chose that name.
  Changing an id cascades through every relationship, view, group and deployment
  instance that references it, as a single undo step. Existing workspaces need
  no migration. (TEA-242)

### Fixed

- **The what's-new pill now reaches returning users.** The 0.4.0 announcement
  went out to nobody: no existing user had a dismissed-id stored yet, so every
  one of them looked like a brand-new visitor and was silently seeded instead of
  shown the release. Prior use is now detected from any other `c4hero*` browser
  storage key, and genuinely new visitors are still seeded in silence.
  (TEA-248)

## [0.4.0] - 2026-08-30

### Added

- **Dynamic and deployment views — c4hero now covers the complete C4 view
  set.** Workspaces using `dynamic` views (ordered interaction steps,
  including response messages and repeated steps) and `deployment` views
  (`deploymentEnvironment`, nested `deploymentNode`s, `containerInstance` /
  `softwareSystemInstance`, `infrastructureNode`) parse, render, and
  re-serialize losslessly, verified against the real Structurizr parser in
  CI. Dynamic views number every interaction step on its edge; deployment
  views draw the environment as nested deployment-node boundaries around the
  instances and infrastructure running inside them. Rendering, layout, drag,
  and export are fully wired, and topology can be authored visually (see
  below).
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

- **Author deployment topology visually.** The add panel on a deployment view
  edits the environment's topology: add deployment nodes (top-level or
  nested), infrastructure nodes, and container / software-system instances;
  rename nodes inline; delete anything with its subtree cascading through
  relationships and view membership. Scoped views pick up only instances of
  their system, positions survive topology edits, everything is undoable, and
  the result serializes to DSL the real Structurizr parser accepts.
- **Scoped deployment views say what they hide.** A deployment view scoped to
  a software system only draws subtrees deploying that system — which used to
  make topology edits look like silent no-ops. The topology editor now shows a
  "scoped to …" chip, badges elements the scope filters out, annotates
  out-of-scope options in the instance picker, warns before an add that won't
  appear, and offers a one-click jump to (or creation of) the unscoped view of
  the same environment.
- **What's new in c4hero, in c4hero.** A subtle release-notes pill appears for
  returning users when a build ships announced features; clicking it opens the
  highlights with a link to the full changelog, and dismissing it keeps it
  gone until the next announcement. Off by default for self-hosted and fork
  builds — enable with `VITE_WHATS_NEW=1`.
- **Edit dynamic view steps visually.** The add panel on a dynamic view is now
  a step editor: add interactions between in-scope elements (picking the
  reverse of an existing relationship authors a response step; a brand-new
  pair creates the model relationship too), reorder with the sequence
  renumbering automatically, override per-step descriptions inline, and
  delete steps — membership follows the steps, edits are undoable, and the
  result serializes losslessly.

### Fixed

- **Parallel interaction sequences now number exactly like Structurizr.**
  Brace groups in a dynamic view used to be flattened into one running
  sequence (1, 2, 3, 4); the real parser clones the counter at `{` and
  reverts it at `}`, so branches share a base number and the step after the
  groups reuses it too. c4hero now matches that numbering — verified against
  the Structurizr CLI — and re-serializes the brace groups so the orders
  survive a round-trip instead of silently renumbering.
- **Clicking a numbered step in a dynamic view now highlights it.** Step
  edges carry step-scoped ids, and selection synced by edge id, so the
  emphasis never applied; it now matches on the backing relationship, which
  also highlights every step of that relationship at once.
- The Add Element panel on dynamic and deployment views now explains that
  steps and topology are authored in the DSL, instead of opening as an empty
  dead end.
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

[0.7.0]: https://github.com/c4hero/c4hero/releases/tag/v0.7.0
[0.6.0]: https://github.com/c4hero/c4hero/releases/tag/v0.6.0
[0.5.0]: https://github.com/c4hero/c4hero/releases/tag/v0.5.0
[0.4.0]: https://github.com/c4hero/c4hero/releases/tag/v0.4.0
[0.3.0]: https://github.com/c4hero/c4hero/releases/tag/v0.3.0
[0.2.2]: https://github.com/c4hero/c4hero/releases/tag/v0.2.2
[0.2.1]: https://github.com/c4hero/c4hero/releases/tag/v0.2.1
[0.2.0]: https://github.com/c4hero/c4hero/releases/tag/v0.2.0
