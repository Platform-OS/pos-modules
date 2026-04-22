import { defineConfig, devices } from '@playwright/test';
import process from 'process';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.MPKIT_URL,
    screenshot: { mode: 'only-on-failure', fullPage: true },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
