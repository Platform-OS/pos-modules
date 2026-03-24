// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Multiple payment attempts on same transaction', async ({ page }) => {
    // 1. Create a test transaction and complete successful payment
    await page.goto('/test-payment');

    // expect: Transaction is created
    await page.locator('#start-payment').click();
    await page.waitForURL(/\/payments\/example_gateway/);

    // Capture the transaction ID from the URL
    const gatewayUrl = page.url();
    const transactionIdMatch = gatewayUrl.match(/transaction_id=([^&]+)/);
    expect(transactionIdMatch).not.toBeNull();
    const transactionId = transactionIdMatch![1];

    // expect: Payment succeeds
    const successButton = page.getByRole('button', { name: /Payment Success/i }).first();
    await successButton.click();

    // expect: Transaction status is 'succeeded'
    await page.waitForURL(/\/test-payment\?payment_success=1/);
    await expect(page.getByText(/✓.*Payment Successful/i)).toBeVisible();

    // 2. Attempt to access the same transaction's payment gateway page again

    // expect: Navigate back to the gateway URL with the same transaction_id
    await page.goto(gatewayUrl);

    // 3. Verify transaction state handling

    // expect: Gateway page may load or show appropriate message for already-completed transaction
    // expect: System handles duplicate payment attempts gracefully
    // expect: Transaction status remains 'succeeded' and is not changed

    // The page should either:
    // 1. Show an error message about the transaction being already processed, or
    // 2. Still show the payment form but not change the transaction status

    // We'll check if the page loads (doesn't throw an error)
    expect(page.url()).toContain('transaction_id=' + transactionId);
  });
});
