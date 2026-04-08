// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Payment gateway page without transaction_id', async ({ page }) => {
    // 1. Navigate to payment gateway page without transaction_id parameter

    // expect: Navigate to /payments/example_gateway/index (no parameters)
    const response = await page.goto('/payments/example_gateway');

    // 2. Verify error handling

    // expect: Page returns 404 status code or appropriate error
    expect(response?.status()).toBe(404);

    // expect: Transaction cannot be found without transaction_id
    // expect: Payment form does not render without valid transaction
    await expect(page.locator('form[action*="/payments/example_gateway/webhook"]')).not.toBeVisible();
  });
});
