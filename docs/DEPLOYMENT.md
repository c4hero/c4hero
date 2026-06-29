# Deployment

c4hero is a static SPA. The hosted app at [app.c4hero.com](https://app.c4hero.com) is deployed to Vercel from the `main` branch using the configuration in [`vercel.json`](../vercel.json) — SPA rewrites, immutable asset caching, strict CSP, HSTS, and other security headers.

Self-hosting is straightforward. `npm run build` produces a static bundle in `dist/` that any static host can serve (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages, plain nginx, etc.).

## Vercel (the hosted app)

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

### Recommended headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://cloudflareinsights.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; font-src 'self'; media-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=()
```

`vercel.json` is the canonical copy for the hosted app. Keep this sample aligned with it when the production policy changes.

## Environment variables

c4hero is fully functional with no environment variables set. Every `VITE_*` flag is opt-in and listed in [`.env.example`](../.env.example) with a description of what it enables.

The open source build never talks to a c4hero server — there isn't one. Hosted observability is off by default and only activates when the related `VITE_*` variables are present. `VITE_CLOUDFLARE_ANALYTICS_TOKEN` enables Cloudflare Web Analytics for aggregate page counts on non-editor routes; the in-app beacon is disabled on `/collection/*` and sets `spa: false` so collection/workspace/view route slugs are not sent through Web Analytics. `VITE_SENTRY_DSN` enables scrubbed client-side error reports, and `VITE_LOG_ENDPOINT` wires your own warn/error log endpoint. If you set any of these for a hosted deployment, keep the CSP `script-src`/`connect-src` values aligned and document the destinations for users.

If your deployment is proxied through Cloudflare or uses Cloudflare dashboard auto-injection, disable Web Analytics or add a Cloudflare rule excluding `/collection/*`. Dashboard/edge injection happens outside the app bundle, so the app's beacon guard cannot enforce the no-editor-routes policy in that case.
