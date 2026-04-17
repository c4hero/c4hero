import { defineConfig, devices } from '@playwright/test'

/** Standalone config for the on-demand screenshot capture utility.
 *  Runs the files under e2e/screenshots/ which the default config ignores. */
export default defineConfig({
  testDir: './e2e/screenshots',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3004',
    viewport: { width: 1600, height: 1000 },
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3004',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
