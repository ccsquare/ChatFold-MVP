import { defineConfig, devices } from '@playwright/test';

/**
 * ChatFold E2E Test Configuration
 *
 * Prerequisites:
 * 1. Backend running: cd backend && uv run uvicorn app.main:app --reload --port 8000
 * 2. Frontend running: cd web && npm run dev
 * 3. Redis & MySQL running: ./scripts/local-dev/start.sh
 *
 * Run tests:
 *   npx playwright test                    # All browsers
 *   npx playwright test --project=chromium # Chromium only
 *   npx playwright test --ui               # Interactive UI mode
 */
export default defineConfig({
  testDir: './tests',

  /* Test timeout - increase for SSE streaming tests */
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  /* Shared settings for all the projects below. */
  use: {
    /* Base URL - frontend dev server */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Enable other browsers as needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run local dev servers before starting the tests */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
