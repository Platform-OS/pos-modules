import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.MPKIT_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /seed\.setup\.ts$/,
    },
    {
      name: 'api-tests',
      dependencies: ['setup'],
      testMatch: /(auth|errors|exports|validation)\/.*\.spec\.ts$/,
    },
  ],
});
