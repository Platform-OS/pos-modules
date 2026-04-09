// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Invalid transaction handling', async ({ page }) => {
    // 1. Navigate directly to payment gateway page with invalid transaction_id

    // expect: Navigate to /payments/example_gateway/index?transaction_id=invalid-id-12345
    const response = await page.goto('/payments/example_gateway?transaction_id=invalid-id-12345');

    // 2. Verify error handling

    // expect: Page returns 404 status code
    expect(response?.status()).toBe(404);

    // expect: Transaction query returns blank/null
    // expect: Payment gateway page does not render
    // expect: Proper error handling prevents payment processing with invalid transaction

    // Verify that the payment form is not rendered
    await expect(page.locator('form[action*="/payments/example_gateway/webhook"]')).not.toBeVisible();
  });
});
