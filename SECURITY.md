# Security Policy

Thanks for helping keep c4hero and its users safe.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security problems.

Instead, report privately using GitHub's
[Private Vulnerability Reporting](https://github.com/c4hero/c4hero/security/advisories/new).
If that is not available to you, email the maintainers at
**security@c4hero.com** with:

- A description of the issue and the impact you expect
- Steps to reproduce (a minimal workspace file or test case if relevant)
- Any suggested remediation, if you have one

You should receive an acknowledgement within **3 business days**. We aim to
ship a fix or mitigation within **30 days** for high-severity issues and to
credit reporters who want public acknowledgement in the release notes.

## Scope

c4hero is a local-first browser SPA. The most relevant areas for security
reports are:

- The Structurizr DSL parser and serializer (`src/lib/dsl/**`) — parser
  crashes or malformed-input handling issues
- The file and folder I/O layer (`src/lib/fileIO.ts`, `src/lib/folderIO.ts`)
- Local persistence boundaries for `localStorage` and `IndexedDB` data
- Content Security Policy, HTTP security headers, and any XSS sinks in the
  React tree

Out of scope:

- Findings that require physical access to a user's machine, or that rely on
  the user disabling browser security features
- Reports based solely on missing best-practice headers on third-party hosts
  you control yourself (self-hosted deployments)
- Denial of service by feeding a huge DSL file into the parser — the tool is
  interactive and bounded by browser memory by design

## Supported Versions

This project does not yet publish a formal release cadence. Security fixes
land on `main` first and are tagged in subsequent releases. Self-hosted users
are encouraged to track `main` or the latest tag.
