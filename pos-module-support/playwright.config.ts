import { defineConfig, devices } from '@playwright/test';
import process from 'process';

/**
 * E2E suite for pos-module-support (tech-spec 10 §3), run against a staging
 * instance with the example app: MPKIT_URL + E2E_ENV (see tests/e2e/helpers.ts).
 * Scenarios share the instance's settings and email stub, so they run one at a time.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.MPKIT_URL || 'https://support-development.staging.oregon.platform-os.com',
    screenshot: { mode: 'only-on-failure', fullPage: true },
    viewport: { width: 1400, height: 900 },
    testIdAttribute: 'data-tc',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'test',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
});
