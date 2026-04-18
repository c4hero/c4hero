# OSS Release — Remaining Tasks

Companion to `OPEN_SOURCE_RELEASE_CHECKLIST.md`. This file is the actionable
tasklist of work still to do before flipping the repo public.

Check items off as you complete them.

## Placeholders to replace

- [ ] **Real security contact email.** Update or remove `security@c4hero.com`
      in `SECURITY.md`. If GitHub's private vulnerability reporting is
      sufficient, delete the email line entirely.
- [ ] **Repo URLs.** Replace `github.com/c4hero/c4hero` references in
      `SECURITY.md` and `.github/ISSUE_TEMPLATE/config.yml` once the final
      org/repo path is known.
- [ ] **LICENSE copyright line.** Update `Copyright (c) 2025 c4hero` in
      `LICENSE` to the real legal entity / individual if different.

## Governance decision (do this first)

- [ ] **Decide PR policy.** Accept external contributions at launch, or
      start read-only? Pick one:
  - Accepting: add `CODEOWNERS` and enable "require review from code owners"
    in branch protection.
  - Read-only for now: add a short "Contribution status" section to
    `CONTRIBUTING.md` that says external PRs are not being accepted yet.
- [ ] **Triage owner.** Decide who owns bug-report triage, security
      disclosures, and contributor questions post-launch. Document in
      `CONTRIBUTING.md` or an internal runbook.

## GitHub settings (post-push, UI-only)

- [ ] Enable **Issues** and **Discussions** (Discussions is referenced in
      `.github/ISSUE_TEMPLATE/config.yml`).
- [ ] Enable **Private vulnerability reporting** under Settings → Code
      security.
- [ ] Enable **Secret scanning** and **Push protection** (Settings → Code
      security → Secret scanning).
- [ ] **Branch protection on `main`:** require PR, require CI to pass
      (lint + typecheck + test + e2e + build + security jobs), require
      linear history or squash-only, disallow force-push.
- [ ] Set **repository description**, **topics** (e.g. `c4-model`,
      `structurizr`, `architecture-diagrams`, `react`, `local-first`), and
      **homepage URL**.
- [ ] Turn off wiki unless you plan to use it.

## Content review (needs a human)

- [ ] Walk through every screenshot, sample DSL, and exported diagram for
      real customer names, internal system names, or NDA-covered terms.
      Sample files live in `src/lib/templates/` (Big Bank is public
      Structurizr sample; the others are generic).
- [ ] Review `README.md` once more against the final app surface — remove
      any stale links to hosted services the OSS repo doesn't ship.
- [ ] Review `PRD.md` and `repo-audit-fixes.md` in the repo root. Decide
      whether to keep, move to `docs/`, or gitignore these internal notes.
- [ ] Confirm `scorecard-fixes.md` should stay in the repo (it's useful
      context but reads as internal grading). Move to `docs/` or delete.

## README polish

- [ ] Add a screenshot or GIF near the top so the repo's social preview
      renders well.
- [ ] Add CI and license badges to the top of `README.md`. Example:
      ```
      ![CI](https://github.com/<owner>/c4hero/actions/workflows/ci.yml/badge.svg)
      [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
      ```
- [ ] Confirm the "Current status" bullet list still matches shipped
      features (AI helpers, folder-backed collections, round-trip DSL).

## CI / Release workflow

- [ ] Run the full checklist before tagging: `npm run lint && npx tsc -b &&
      npm test && npm run build && npx playwright test`.
- [ ] Add a `release` workflow (or document the manual process) for cutting
      tags. Simplest path: GitHub's "Create a new release" UI with an
      auto-generated changelog until activity justifies a tool like
      `release-please`.
- [ ] Decide on versioning. `package.json` currently shows `"0.0.0"`. Pick
      `0.1.0` for the first public release, or follow semver from `1.0.0`
      if you want to signal stability.
- [ ] Seed a handful of `good first issue` tickets so newcomers have
      obvious entry points.

## Optional / nice-to-have

- [ ] `.github/FUNDING.yml` if you want a sponsor button.
- [ ] `CHANGELOG.md` seeded with the first release entry.
- [ ] `docs/ARCHITECTURE.md` explaining the DSL pipeline (lexer → parser →
      workspace model → serializer), the Zustand store shape, and the
      canvas rendering path. The maintainability audit flagged this as the
      single biggest onboarding win.
- [ ] Dependabot already runs weekly — consider also adding a scheduled
      CodeQL workflow for static analysis.
