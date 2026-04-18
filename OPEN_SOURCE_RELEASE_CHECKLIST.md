# Open Source Release Checklist

Use this checklist before making the repository public or cutting a first
public release.

## Security and Secrets

- Run a history-level secret scan before publishing.
- Verify `git remote -v` contains token-free URLs.
- Confirm `.env.local`, `.vercel/`, local browser profiles, exported diagrams,
  `dist/`, `playwright-report/`, and `test-results/` stay untracked.
- Review any screenshots, sample diagrams, and exported files for accidental
  customer or internal system names.
- Review any AI provider configuration and confirm no real API keys are present
  in committed files, docs, screenshots, or shell history.

## Repository Hygiene

- Start from a clean working tree.
- Confirm only intentional public files are committed.
- Keep internal notes and release prep artifacts out of public-facing docs.
- Leave historical/internal project notes that are intentionally kept in the
  repo alone unless you are explicitly curating them for publication.
- Verify `README.md`, `CONTRIBUTING.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, and
  `.env.example` match the current app behavior.

## Build, Test, and Deploy Readiness

- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run test:e2e` if you are changing behavior that affects the browser
  UI, file flows, or deployment confidence.
- Confirm the Vercel production build still outputs `dist/` and SPA routing
  works via `vercel.json`.

## GitHub Repository Settings

- Enable Issues and Discussions if the docs link to them.
- Enable private vulnerability reporting or another clearly documented security
  reporting path.
- Protect the default branch and require CI for merges.
- Add repository topics, description, and homepage URL.

## Contributor Experience

- Confirm `npm run dev` starts the app locally on `http://localhost:3004`.
- Verify contributor docs match the current stack: React 19, TypeScript,
  Vite, Tailwind CSS v4, Vitest, and Playwright.
- Keep `.env.example` safe and minimal. Optional overrides should stay
  commented out.
- Make sure public docs do not imply GitHub OAuth, backend APIs, or hosted
  services that this repo no longer uses.

## Release Prep

- Tag the first public release only after the repo is in a clean, passing
  state.
- Open a few `good first issue` tickets so new contributors have obvious entry
  points.
- Decide who triages bug reports, security disclosures, and contribution
  questions after launch.
