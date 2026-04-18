import { defineConfig, devices } from '@playwright/test'

/** Standalone config for the walkthrough video capture. Records the run as
 *  WebM, then the spec post-processes the file into ./screenshots/walkthrough/. */
export default defineConfig({
  testDir: './e2e/walkthrough',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3004',
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    video: {
      mode: 'on',
      size: { width: 1280, height: 800 },
    },
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
