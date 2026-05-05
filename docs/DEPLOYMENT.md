# Deployment

c4hero is a static SPA. The hosted instance at [c4hero.com](https://c4hero.com) is deployed to Vercel from the `main` branch using the configuration in [`vercel.json`](../vercel.json) — SPA rewrites, immutable asset caching, strict CSP, HSTS, and other security headers.

Self-hosting is straightforward. `npm run build` produces a static bundle in `dist/` that any static host can serve (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages, plain nginx, etc.).

## Vercel (the hosted instance)

- Pushes to `main` trigger production deploys; pull requests get preview URLs.
- No environment variables are required for a default build. Optional `VITE_*` vars are documented in [`.env.example`](../.env.example).
- Rollback via the Vercel dashboard (Deployments → ⋯ → "Promote to production") or `vercel rollback` from the CLI.
- Browser support and preview-URL caveats track [Vercel's framework-detection defaults](https://vercel.com/docs/frameworks).

## Self-hosting

1. Build the bundle:
   ```bash
   npm install
   npm run build
   ```
2. Serve `dist/` from any static host. SPA-style rewriting (every unmatched route → `index.html`) is required so that deep links like `/collection/foo` work after a hard refresh.
3. **Replicate the security headers from `vercel.json` on your origin** — the CSP in particular. Without it, the inline meta CSP in `index.html` is your only defense, and it's deliberately broader to cover dev workflows.

### Minimum recommended headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

(See `vercel.json` for the canonical, up-to-date values.)

## Environment variables

c4hero is fully functional with no environment variables set. Every `VITE_*` flag is opt-in and listed in [`.env.example`](../.env.example) with a description of what it enables.

The open source build never talks to a c4hero server — there isn't one. Telemetry and remote logging are off by default; you wire your own transport via `VITE_LOG_ENDPOINT` if you want one.
