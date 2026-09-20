import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/file-io',
  testMatch: 'layout-persistence.preview.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
    baseURL: 'http://127.0.0.1:3015',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 3015 --strictPort',
    url: 'http://127.0.0.1:3015',
    reuseExistingServer: !process.env.CI,
  },
})
