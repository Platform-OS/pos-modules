import { test as setup, expect } from '@playwright/test';

/**
 * Seed file for data-export-api tests
 * Validates test environment is ready
 *
 * Prerequisites:
 * 1. Run: bash tests/data/seed/seed.sh <env>
 * 2. Get API key from instance and export: export DATA_EXPORT_API_KEY="..."
 * 3. Set: export MPKIT_URL="https://your-instance..."
 */
setup('env is configured', async ({ request }) => {
  // Verify required environment variables
  const baseURL = process.env.MPKIT_URL;
  const apiKey = process.env.DATA_EXPORT_API_KEY;

  expect(baseURL, 'MPKIT_URL environment variable must be set').toBeTruthy();
  expect(apiKey, 'DATA_EXPORT_API_KEY environment variable must be set').toBeTruthy();
});
