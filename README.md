# c4hero

c4hero is a local-first visual architecture modelling tool for teams that use the C4 model and want to keep their architecture definitions in files, not a hosted black box.

It is designed around Structurizr-compatible workflows. You edit architecture visually, and c4hero reads and writes Structurizr DSL so your workspace can live in your repo, stay reviewable in pull requests, and avoid vendor lock-in.

## Current status

This repository currently contains a browser-based React app with:

- visual editing for C4-style people, software systems, containers, and components
- multiple view types, including landscape, system context, container, and component views
- Structurizr DSL parsing and serialization, with a substantial round-trip test suite
- local file and folder workflows, plus local crash-recovery storage in the browser
- search, command palette, keyboard shortcuts, layout controls, tags, styles, groups, and presentation-oriented canvas controls
- import/export paths for Structurizr DSL and JSON
- optional AI helpers for generating element descriptions and bootstrapping a workspace from a text prompt
- unit and Playwright coverage for core editing flows

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
npm run lint
npm run preview
npm test
npm run test:watch
npm run test:e2e
```

## AI keys

AI features are optional.

- c4hero does not require an AI key for normal use
- if you want AI features, you bring your own OpenAI or Anthropic API key
- keys are stored in `sessionStorage`, so they stay local to the current browser session
- keys are sent directly to the configured AI provider endpoint, not to c4hero servers
- because keys live in the browser, any browser extension or XSS bug in the app could read them; only use AI features in trusted sessions
- optional endpoint overrides are documented in [`.env.example`](.env.example)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, and testing guidance, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Released under the [MIT License](LICENSE).
