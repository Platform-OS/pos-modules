import { defineConfig, devices } from '@playwright/test';
import process from 'process';

/**
 * E2E suite for pos-module-support (tech-spec 10 §3).
 * MPKIT_URL points at the instance under test (CI pool instance, or support-dev locally).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.MPKIT_URL,
    screenshot: { mode: 'only-on-failure', fullPage: true },
    viewport: null,
    testIdAttribute: 'data-tc',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'test',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
