import { defineConfig } from '@playwright/test';
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
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api-tests',
      testMatch: /tests\/.*\.spec\.ts/,
    },
  ],
});
