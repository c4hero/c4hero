# c4hero

[![CI](https://github.com/c4hero/c4hero/actions/workflows/ci.yml/badge.svg)](https://github.com/c4hero/c4hero/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/c4hero/c4hero?label=release)](https://github.com/c4hero/c4hero/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](#local-development)

> Local-first C4 architecture diagrams in your browser. Edit visually, save as plain `.dsl` files. Structurizr DSL compatible, no signup, no server.

**Try it: [c4hero.com](https://c4hero.com)**

![c4hero canvas showing the Big Bank sample's container view — top pill with workspace + view picker, left tool rail, the rendered C4 diagram, and the right-side element inspector for "Personal Banking Customer"](docs/screenshots/canvas-hero.png)

---

## The 30-second pitch

You write Structurizr DSL like this:

```dsl
workspace "E-Commerce Platform" {
  model {
    customer = person "Customer" "Browses + buys"
    platform = softwareSystem "E-Commerce Platform" {
      apiGateway = container "API Gateway" "Routes + auth" "Node.js"
      userService = container "User Service" "Accounts + profiles" "Spring Boot"
      orderService = container "Order Service" "Cart + checkout" "Go"
      postgres = container "Postgres" "Users + orders" "Database"
    }
    customer -> apiGateway "Browses"
    apiGateway -> userService "Authenticates"
    apiGateway -> orderService "Routes"
    userService -> postgres "Reads + writes"
    orderService -> postgres "Reads + writes"
  }
  views { container platform "Containers" { include * } }
}
```

c4hero renders it as a diagram, lets you edit it visually, and writes the DSL back to disk when you save. Your architecture lives in your repo, reviews in pull requests, and never gets locked behind a vendor's login screen.

## Why c4hero

- **Local-first.** Files stay on your device. There is no c4hero server. No accounts, no syncing, no telemetry by default.
- **Plain text.** `.dsl` files diff cleanly in git, review in PRs, and survive any tool you use after this one.
- **Structurizr-compatible.** Read and write the same DSL the official Structurizr tools use — c4hero is one option in an interoperable ecosystem, not a fork.
- **Fast.** Code-split bundle, idle-scheduled autosave, dagre auto-layout, no network round-trips during editing.
- **Accessible.** Focus-trap dialogs, ARIA-labeled canvas, keyboard shortcuts for every common action, `prefers-reduced-motion` support.

A more detailed feature catalogue lives in [`docs/FEATURES.md`](docs/FEATURES.md).

## Browser support

c4hero runs in any modern browser. **Folder collections** rely on the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which is currently only available in Chromium browsers (Chrome, Edge, Brave, Arc, Opera).

In Firefox and Safari you can still open and edit a single `.dsl` file at a time, export PNG / SVG / DSL, and use every other feature. When folder workflows aren't supported, c4hero automatically falls back to the single-file flow.

## Local development

### Prerequisites

- Node.js 22+
- npm 10+

### Run locally

```bash
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:3004` with `strictPort: true`.

### Available commands

```bash
npm run dev          # dev server with HMR
npm run build        # production bundle in dist/
npm run preview      # serve the production bundle
npm run typecheck    # tsc -b
npm run lint         # eslint
npm test             # unit (vitest) + e2e (playwright)
npm run test:unit    # vitest only
npm run test:watch   # vitest in watch mode
npm run test:e2e     # playwright only
npm run audit        # npm audit (production)
npm run check        # typecheck + lint + audit
```

## Deployment

Deployment guidance — Vercel pipeline, env-var expectations, security headers for self-hosting — is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Privacy

c4hero is local-first. Workspaces stay on your device; nothing is uploaded to a c4hero server. There are no third-party tracking scripts in the open source build. Full details in [`PRIVACY.md`](PRIVACY.md).

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for a list of notable changes. The current release is tagged in [GitHub Releases](https://github.com/c4hero/c4hero/releases).

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, workflow, and testing guidance, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security issue, see [`SECURITY.md`](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
