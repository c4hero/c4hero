import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version
const vscodeBuild = process.env.VITE_HOST === 'vscode'

export default defineConfig({
  base: vscodeBuild ? './' : undefined,
  plugins: [
    react(),
    tailwindcss(),
    // Strip dev-only CSP relaxations from index.html in production builds.
    // Vite's HMR client uses eval() and a websocket connection, so the dev
    // server needs `unsafe-eval` in script-src and `ws:`/`wss:` in connect-src.
    // Production has neither, so the meta CSP can be tighter — matching the
    // strict Vercel response-header CSP for self-hosters who don't replicate
    // those headers on their origin.
    {
      name: 'tighten-csp-in-prod',
      transformIndexHtml: {
        order: 'pre' as const,
        handler(html: string, ctx: { server?: unknown }) {
          if (vscodeBuild) return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*\/>/, '')
          if (ctx.server) return html // dev — leave CSP loose for HMR
          return html
            .replace(" 'unsafe-eval'", '')
            .replace(' ws: wss:', '')
        },
      },
    },
    ...(!vscodeBuild ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['c4-logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'c4hero',
        short_name: 'c4hero',
        description: 'Design, document, and share software architecture with C4 model diagrams. Local-first, open source.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        globIgnores: ['**/c4-logo.svg', '**/favicon.svg'],
      },
      devOptions: { enabled: false },
    })] : []),
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_VERSION__: JSON.stringify(appVersion),
    __VSCODE_HOST__: JSON.stringify(vscodeBuild),
  },
  resolve: {
    alias: {
      ...(vscodeBuild ? { '@/lib/observability/sentry': path.resolve(__dirname, './src/lib/observability/sentry.noop.ts') } : {}),
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: vscodeBuild ? 'extension/media' : 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'react-vendor'
          if (/[\\/]react(?:-dom)?[\\/]/.test(id)) return 'react-vendor'
          if (id.includes('@xyflow')) return 'xyflow'
          if (id.includes('@dagrejs/dagre')) return 'dagre'
        },
      },
    },
  },
  server: {
    port: 3004,
    strictPort: true,
    // Extra hostnames the dev server will serve when proxied (e.g. a tunnel
    // or reverse-proxy domain). Comma-separated; unset for localhost dev.
    allowedHosts:
      process.env.VITE_ALLOWED_HOSTS?.split(',')
        .map((h) => h.trim())
        .filter(Boolean) ?? [],
    // HMR over wss:443 is only correct when served via Cloudflare Tunnel.
    // For plain localhost dev (and E2E), leave HMR as the default so the
    // browser connects to ws://localhost:3004 without errors.
    hmr: process.env.VITE_HMR_TUNNEL
      ? { clientPort: 443, protocol: 'wss' }
      : undefined,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/main.tsx',
        'src/types/**',
        'src/components/welcome/mocks/**',
      ],
      // Baseline thresholds set at current measured values rounded down.
      // CI will fail on regression, but won't block until coverage actually
      // drops. As coverage rises (UI components are the laggard), tighten
      // these gates. The src/lib and src/store layers are already well above
      // 90% — the floor here is dragged down by component-level UI tests.
      // Re-baselined for @vitest/coverage-v8 v4 (same actual coverage; v4
      // counts arrow functions, type-emitted branches, and synthetic
      // accessors that v3 missed, so the headline numbers are stricter).
      thresholds: {
        statements: 48,
        branches: 44,
        functions: 39,
        lines: 52,
      },
    },
  },
})
