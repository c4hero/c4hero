# Extension release checks

Automated checks run the minimum supported VS Code (1.95.3). The native suite
opens a real canvas, checks rendered React Flow nodes, exercises dirty/save and
undo/redo across real DSL/sidecar/include documents, and rejects stale edits and
out-of-folder URIs. The app unit tests cover snapshot preservation, bridge
ordering, both filesystem adapters, and SecretStorage/localStorage separation.

Before a marketplace release, install the CI-produced VSIX and run this matrix:

| Environment | Status in TEA-327 implementation review |
| --- | --- |
| Linux, local files | Automated native integration suite |
| DSL outside any workspace | Automated native integration suite |
| Windows | Manual check pending |
| macOS | Manual check pending |
| Remote-SSH | URI boundaries tested; live session pending |

In each manual environment:

1. Open two DSL files using the Explorer action. Check light, dark, and high contrast themes.
2. Rename an element; save; check DSL diff. Drag a node; save; check only the sidecar changed.
3. Undo/redo DSL and layout edits using canvas controls and keyboard shortcuts.
4. Edit DSL, an included fragment, and sidecar in a text editor; confirm canvas refresh.
5. Save using the canvas, Ctrl/Cmd+S, Save All, and Auto Save. Close/reopen with dirty layout.
6. Open a folder-based model with local includes and docs/ADRs; create a document.
7. Configure an optional AI key, reload, and check it is retained without a key in webview localStorage.

Packaging creates an installable artifact; it does not publish to the marketplace.
