# Privacy

c4hero is a **local-first** application. This document describes exactly what
data the app handles, where it lives, and what is sent over the network.

## Workspaces and diagrams

- All workspace data — your model elements, relationships, views, tags, styles,
  groups, and node positions — is stored on your device.
- When you save to a `.dsl` file (or to a folder of `.dsl` files), the data is
  written to your filesystem via the browser's native file APIs.
- For crash recovery, c4hero also keeps a copy of your active workspace in
  your browser's `localStorage`. This data never leaves your device.
- Nothing is uploaded to a c4hero server. There is no c4hero server in the
  data path. The browser app is a static bundle.

## File system access

- Single-file editing (`.dsl`) works in every modern browser.
- Folder-based collections rely on the
  [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API),
  which is currently only available in Chromium-based browsers (Chrome, Edge,
  Brave, Arc, Opera). Granted folder/file handles are stored in
  `IndexedDB` so c4hero can re-open them on reload; revoking permission in your
  browser revokes c4hero's access immediately.

## AI features

AI features (description suggestions, prompt-to-workspace bootstrap) are
**opt-in** and require you to provide your own API key.

- Keys are entered in the AI settings dialog and stored in `sessionStorage`,
  scoped to the current browser session.
- Keys are sent **directly** to the configured AI provider endpoint
  (Anthropic or OpenAI by default). They are never proxied through a c4hero
  server.
- Because keys live in the browser, any browser extension or XSS bug in the
  app could read them. Treat browser sessions accordingly: only enable AI
  features in trusted sessions, and clear the key before sharing your screen.
- The default endpoints can be overridden via the `VITE_ANTHROPIC_API_URL` and
  `VITE_OPENAI_API_URL` build-time variables (see `.env.example`).

## Logging and telemetry

- The app emits structured logs in the browser console for diagnostics.
- The optional `VITE_LOG_ENDPOINT` build-time variable can be set by an
  operator to forward `warn`/`error` log entries to an HTTPS endpoint via
  `navigator.sendBeacon`. This is **disabled by default** in this open source
  build. If you set it for a hosted deployment, also add the endpoint origin
  to your CSP `connect-src` policy and document the destination for your
  users.
- No analytics or third-party tracking scripts are included in the open
  source build.

## Cookies

c4hero does not set cookies.

## What's stored, where

| Data | Location | Cleared by |
| --- | --- | --- |
| Active workspace (crash recovery) | `localStorage` | Clearing site data; loading a different workspace |
| Recent file/folder handles | `IndexedDB` | Clearing site data; revoking handle in the browser |
| AI API key | `sessionStorage` | Closing the tab; clearing site data |
| Settings (theme, panel state) | `localStorage` | Clearing site data |
| Workspace files (`.dsl`, `.c4hero.json` sidecar) | Filesystem (your machine) | Deleting the files |

## Reporting

If you find a privacy or security issue, please report it as described in
[SECURITY.md](SECURITY.md).
