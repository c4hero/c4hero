# Contributing to c4hero

Thanks for your interest in contributing. c4hero is a visual architecture
modeling tool focused on C4-style diagrams, local-first workflows, and
Structurizr-compatible DSL editing.

## Getting Started

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Git

### Local Setup

```bash
git clone https://github.com/c4hero/c4hero.git
cd c4hero
npm install
npm run dev
```

The Vite dev server is configured for `http://localhost:3004` with
`strictPort: true`.

## Environment Variables

This project does not require any secrets for normal local development.

Optional variables are documented in `.env.example`:

- `VITE_HMR_TUNNEL`, for secure HMR when developing through a tunnel or reverse
  proxy that terminates TLS
- `VITE_LOG_ENDPOINT`, to send warn/error logs to an HTTPS endpoint; remember to
  add that origin to the deployment CSP `connect-src`

Keep local overrides out of git.

## Tech Stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS v4
- Zustand
- React Router 7
- Vitest
- Playwright

## Project Structure

```text
src/
├── components/
│   ├── canvas/
│   ├── command-palette/
│   ├── dialogs/
│   ├── layout/
│   ├── search/
│   ├── settings/
│   ├── shared/
│   ├── views/
│   └── welcome/
├── hooks/
├── lib/
│   └── dsl/
├── store/
└── types/

e2e/                     # Playwright end-to-end coverage
docs/                    # Historical design notes and architecture references
public/                  # Static assets
```

## Development Workflow

### Core Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run audit
npm run check
```

### What Each Command Does

- `npm run dev` starts the local app
- `npm run lint` runs ESLint across the repo
- `npm run typecheck` runs the TypeScript project build without emitting files
- `npm test` runs Vitest in non-watch mode
- `npm run build` runs the TypeScript build and Vite production build
- `npm run test:e2e` runs Playwright tests from `e2e/`
- `npm run audit` runs `npm audit --audit-level=moderate`
- `npm run check` runs the local release gate: lint, typecheck, unit tests, and build

If you are changing canvas interactions, file import/export flows, DSL parsing,
or onboarding behavior, please run the relevant tests and do a quick manual
browser check.

## Code Style Expectations

- Prefer small, focused changes.
- Keep TypeScript types explicit and avoid `any` unless there is a strong
  reason.
- Match the existing component and state-management patterns before introducing
  new abstractions.
- Avoid unrelated refactors in feature or bug-fix pull requests.
- Keep public-facing copy and docs aligned with the actual app behavior.

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Make your change in the smallest reasonable scope.
3. Run the relevant checks locally.
4. Write a clear commit message.
5. Open a pull request with context, screenshots, or repro steps when helpful.

Good commit examples:

```text
feat: add keyboard shortcut hints to search
fix: preserve selection while editing relationships
docs: clarify local development setup
chore: update test dependencies
```

## Reporting Bugs and Proposing Changes

When opening an issue or pull request, include:

- steps to reproduce
- expected behavior
- actual behavior
- browser and OS details when relevant
- screenshots or recordings for UI issues when helpful

## Community Expectations

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).

## Maintainer Notes

If you are preparing a public launch or tightening repository policy, review
[OPEN_SOURCE_RELEASE_CHECKLIST.md](OPEN_SOURCE_RELEASE_CHECKLIST.md).
