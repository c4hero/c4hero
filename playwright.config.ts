import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // *.preview.spec.ts needs the production build served by
  // playwright.preview.config.ts (single worker, shared OPFS folder). Keep it
  // out of the dev-server suite `npm run test:e2e` runs.
  testIgnore: '**/*.preview.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : 'html',
  use: {
    baseURL: 'http://localhost:3004',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3004',
    reuseExistingServer: !process.env.CI,
  },
})
