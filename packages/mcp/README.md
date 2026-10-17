# c4hero MCP server

A local stdio MCP server for coding agents to read an architecture model and
submit reviewable edits. The calling agent supplies the plan. This process
makes no AI-provider calls, requires no API key, and starts no network listener.
Workspace data is returned to the MCP client; that client's own provider and
privacy settings govern what happens to it next.

## Build and connect

Requires Node.js 22 or newer. From the c4hero repository root:

```sh
npm ci
npm run build:mcp
node packages/mcp/dist/cli.js --workspace /absolute/path/to/architecture.dsl
```

Configure your MCP host to launch the built entry point (use absolute paths):

```json
{
  "mcpServers": {
    "c4hero": {
      "command": "node",
      "args": [
        "/absolute/path/to/c4hero/packages/mcp/dist/cli.js",
        "--workspace",
        "/absolute/path/to/project/architecture.dsl"
      ]
    }
  }
}
```

Each process is bound to one existing DSL file; tools cannot select arbitrary
workspace paths. The companion can also be packed and installed independently:

```sh
npm pack --workspace c4hero-mcp
npm install --global ./c4hero-mcp-0.7.0.tgz
c4hero-mcp --workspace /absolute/path/to/architecture.dsl
```

The package bundles c4hero's shared model code. It needs no source checkout or
browser at runtime. Packing does not publish it to npm. `--help` and `--version`
work without opening a workspace. Normal server stdout is reserved for MCP.

## Tools and review flow

| Tool | Purpose | Writes workspace files? |
| --- | --- | --- |
| `get_model` | Workspace model, views, metadata, warnings and content revision | No |
| `list_elements` | IDs, names and hierarchy, optionally filtered by type/direct parent | No |
| `propose_edit_plan` | Validate a caller-supplied plan and preview resulting DSL/sidecar | No |
| `apply_edit_plan` | Apply a previously reviewed proposal by ID | Yes |

1. Call `get_model` or `list_elements` to get current IDs and `revision`.
2. Call `propose_edit_plan` with that revision and the browser's `EditPlan` shape:

   ```json
   {
     "contractVersion": 1,
     "baseRevision": "<revision from the read tool>",
     "plan": {
       "operations": [
         { "op": "addContainer", "ref": "api", "parent": "shop", "name": "API", "technology": "TypeScript" },
         { "op": "updateElement", "id": "api", "owner": "Platform", "status": "Planned" }
       ]
     }
   }
   ```

3. Review the returned `plan`, summary, operation results and exact
   `preview.dsl` / `preview.sidecarJson`. Normalized text is shown in the returned
   plan. Changes include the normal DSL serializer's formatting and migration
   of legacy sidecar owner/status fields into DSL properties.
4. Only after approval, call `apply_edit_plan` with `proposalId` (and optionally
   `contractVersion: 1`). Apply accepts no replacement operations and writes the
   exact previewed bytes. Configure the MCP host to require approval for this
   destructive tool if a human review is required; a tool boundary by itself
   cannot enforce the host's approval policy.

All nine existing edit operations are available: add person, system, container,
component, relationship or view; update element or relationship; delete element.
The shared applier orders parents before children and resolves temporary refs.
Refs must be unique and must not shadow existing IDs. Deletes cascade through
children, relationships, scoped views and layout using the app's own helpers.
New IDs are pinned; renaming an element keeps its ID stable across the plan.
There is no active canvas or view-relative scope. Explicit `addView` operations
specify their own scope; normal model edits also update relevant diagram membership.

Malformed/unknown fields and unsupported enum values reject the plan. If any
operation is skipped, the whole proposal fails, with nothing written. The
result must pass model integrity and DSL parse/serialize validation. Plans are
limited to 300 operations. Proposals live only in process memory, expire after
15 minutes, and are single-use even if apply fails. At most ten are retained;
creating an eleventh evicts the oldest. Restarting loses pending proposals.

## Conflict handling and recovery

A proposal captures the exact DSL and sidecar bytes, including whether the
sidecar is absent. Apply rejects any changed input. A `*.dsl.mcp.lock` file
serializes MCP writers, and content is checked again immediately before each
replacement. Files are staged in the same filesystem and renamed individually.
Original permissions are preserved; a newly created sidecar is private (0600).

Every apply creates a private `.architecture.dsl.mcp-backup-*` directory beside
the workspace before replacing either file. The response reports its absolute
path. It contains `manifest.json` and numbered `.original` files; a null original
means that file did not exist. Backups are retained until you remove them.
To undo, first stop writers and inspect the manifest, then restore each original
to its recorded path (or remove the sidecar if its original was null). Restoring
an old backup replaces subsequent edits too, so review the current diff first.

On a write failure the server tries to restore already-written files, without
overwriting any subsequent external edit. If rollback fails, it retains the
lock and reports the backup directory for manual recovery. After a process
crash, inspect the backup manifest and current files before restoring originals
and removing the lock. Locks are never automatically treated as stale.

Two files cannot be atomically replaced together. The browser and other editors
do not honor the MCP lock, so a writer racing the final check/rename can still
conflict; avoid simultaneous saves. A process or power failure can leave a mixed
pair requiring recovery from the originals. This is optimistic conflict detection
plus recoverable writes, not a transaction shared with the browser.

## Compatibility and limits

- Package versions track the c4hero release whose model code is bundled. Tool
  contract version **1** is separate from MCP's protocol version. Read/propose/apply
  responses include it; propose/apply reject other requested versions. Pin a
  package release when reproducible schema behavior matters.
- The version-1 sidecar uses the same parser, extraction and serializer as the
  browser. Unknown versions or invalid sidecars cause an error, not metadata loss.
- Local `!include` files inside the configured workspace directory are readable.
  Multi-file workspaces and documents with parser warnings are read-only in v1;
  writes fail explicitly. Includes escaping the directory, including via symlinks,
  are rejected. No remote includes are fetched.
- Files are limited to 8 MiB each, with a 32 MiB total include budget. Target files
  must be regular files; sidecar symlinks are rejected. The configured root path
  is resolved once at startup.
- DSL is serialized using c4hero's existing serializer, not edited textually;
  comments and original formatting are not preserved. Inspect the full preview.
- Backups are local architecture data. Add `*.mcp.lock` and
  `.*.mcp-backup-*/` to the modeled project's ignore rules if appropriate.

## Development

```sh
npm run check:mcp  # companion typecheck, build, filesystem tests and stdio client test
npm run check      # web app checks plus companion checks
```

The tests exercise the bundled executable over stdio as well as metadata
round-trips, read-only proposals, invalid plans, conflicts, replay/expiry,
concurrent writers, symlink boundaries and injected write/rollback failures.
