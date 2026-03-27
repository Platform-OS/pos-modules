import { test } from '@playwright/test';

test('seed', async ({ page }) => {
  await page.goto('/test-stripe-payment');
});
