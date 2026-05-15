# Open Source Release Checklist

Use this checklist before a public launch, release tag, or major deployment.

## Repository Hygiene

- Confirm `main` is clean and up to date with `origin/main`.
- Run `npm ci` from a fresh checkout.
- Run `npx playwright install chromium` before local E2E checks.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run audit`.
- Run `npm run test:e2e` for user-facing or file I/O changes.
- Run `gitleaks detect --source . --redact --verbose --no-banner` before making the repository public.
- Confirm GitHub Discussions and Private Vulnerability Reporting are enabled, or remove links to those features from issue templates and security docs.
- Confirm the source-only package stance (`private: true`) still matches the launch plan, or update `package.json` and release docs before publishing to npm.
- Review `README.md`, `PRIVACY.md`, `SECURITY.md`, and `CHANGELOG.md` for drift.
- Check that generated folders such as `dist/`, `test-results/`, and `playwright-report/` are not tracked.

## Security And Privacy

- Search for secrets, local-only hostnames, and stale endpoint references before publishing.
- Confirm hosted deployments use the CSP and security headers in `vercel.json` or an equivalent policy.
- Confirm optional log forwarding is documented and disabled unless a deployment intentionally configures `VITE_LOG_ENDPOINT`.
- Review dependency updates and Dependabot PRs before tagging.
- Review deprecation warnings from `npm ci` and decide whether they need action before launch.

## Product Readiness

- Smoke test creating, opening, saving, and exporting a `.dsl` workspace.
- Smoke test folder collections in a Chromium browser.
- Smoke test the single-file fallback in a non-Chromium browser when practical.
- Verify PWA icons, favicon, and app metadata render correctly in a production build.
- Tag the launch commit and confirm `CHANGELOG.md`, `package.json`, and GitHub Releases all point to the same version.
