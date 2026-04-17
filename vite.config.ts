import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
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
      exclude: ['src/**/*.test.ts', 'src/main.tsx'],
      thresholds: {
        statements: 50,
        branches: 50,
      },
    },
  },
})
