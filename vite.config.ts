import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'c4-logo.svg', 'apple-touch-icon.png'],
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
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
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
    allowedHosts: ['dev-app.c4hero.com', 'appv2.c4hero.com'],
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
      // Reporting only — thresholds will be reintroduced once coverage
      // climbs above the current ~38% baseline. Tracking the trend is the
      // immediate goal; enforcing a number prematurely produces churn.
    },
  },
})
