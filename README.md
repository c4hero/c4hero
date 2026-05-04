# c4hero

[![CI](https://github.com/c4hero/c4hero/actions/workflows/ci.yml/badge.svg)](https://github.com/c4hero/c4hero/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](#prerequisites)

c4hero is a local-first visual architecture modelling tool for teams that use the C4 model and want to keep their architecture definitions in files, not a hosted black box.

It is designed around Structurizr-compatible workflows. You edit architecture visually, and c4hero reads and writes Structurizr DSL so your workspace can live in your repo, stay reviewable in pull requests, and avoid vendor lock-in.

## Current status

This repository currently contains a browser-based React app with:

- visual editing for C4-style people, software systems, containers, and components
- multiple view types, including landscape, system context, container, and component views
- Structurizr DSL parsing and serialization, with a substantial round-trip test suite
- local file and folder workflows, plus local crash-recovery storage in the browser
- search, command palette, keyboard shortcuts, layout controls, tags, styles, groups, and presentation-oriented canvas controls
- import/export paths for Structurizr DSL plus PNG and SVG export
- unit and Playwright coverage for core editing flows

## Browser support

c4hero runs in any modern browser, but **folder collections** rely on the
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).
That API is currently only available in **Chromium-based browsers** (Chrome,
Edge, Brave, Arc, Opera).

In Firefox and Safari you can still open and edit a single `.dsl` file at a
time, export PNG / SVG / DSL, and use every other feature. When folder
workflows aren't supported, c4hero automatically falls back to the single-file
flow.

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

## Available commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run preview
npm test
npm run test:unit
npm run test:watch
npm run test:e2e
npm run audit
npm run check
```

## Deployment

c4hero is a static SPA. The hosted instance at [c4hero.com](https://c4hero.com) is deployed to Vercel from the `main` branch using the configuration in `vercel.json` (SPA rewrites, immutable asset caching, strict CSP, HSTS, and other security headers). Self-hosting is straightforward — `npm run build` produces a static bundle in `dist/` that any static host (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages, plain nginx) can serve.

For Vercel deployments:

- Pushes to `main` trigger production deploys; pull requests get preview URLs.
- No environment variables are required for a default build. Optional `VITE_*` vars are documented in `.env.example`.
- Rollback via the Vercel dashboard (Deployments → ⋯ → "Promote to production") or `vercel rollback` from the CLI.
- Browser support and preview-URL caveats track [Vercel's framework-detection defaults](https://vercel.com/docs/frameworks).

If you self-host, replicate the security headers from `vercel.json` on your origin (the CSP in particular).

## Privacy

c4hero is local-first. Workspaces stay on your device; nothing is uploaded to a c4hero server. There are no third-party tracking scripts in the open source build. Full details in [PRIVACY.md](PRIVACY.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of notable changes.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, and testing guidance, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security issue, see [SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
