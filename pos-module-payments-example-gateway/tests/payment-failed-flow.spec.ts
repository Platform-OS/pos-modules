// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Failed payment flow end-to-end', async ({ page }) => {
    // 1. Navigate to /test-payment page
    await page.goto('/test-payment');

    // expect: Page loads successfully with the test payment form
    await expect(page.getByRole('heading', { name: /Test Payment/i })).toBeVisible();

    // 2. Click the 'Start Test Payment' button (id='start-payment')
    await page.locator('#start-payment').click();

    // expect: Form submits and creates a new transaction
    // expect: User is redirected to payment gateway page at /payments/example_gateway/index
    await page.waitForURL(/\/payments\/example_gateway/);

    // expect: Gateway page loads with transaction details and payment options
    await expect(page.getByRole('heading', { name: /Example Payment Gateway/i })).toBeVisible();

    // 3. Click 'Payment Failed' button
    const failedButton = page.getByRole('button', { name: /Payment Failed/i });
    await failedButton.click();

    // expect: Form submits to webhook endpoint with payment_status=failed
    // expect: Webhook processes the failed payment status
    // expect: Transaction status is updated to 'failed'
    // expect: User is redirected to the failed_url: /test-payment?payment_failed=1
    await page.waitForURL(/\/test-payment\?payment_failed=1/);

    // 4. Verify failure page displays correctly

    // expect: User lands on /test-payment page with payment_failed=1 parameter
    expect(page.url()).toMatch(/payment_failed=1/);

    // expect: Red error message is displayed: 'Payment Failed'
    await expect(page.getByText(/Payment Failed/i)).toBeVisible();

    // expect: Error message includes text: 'Your test payment was not processed.'
    await expect(page.getByText(/Your test payment was not processed/i)).toBeVisible();

    // expect: Start Test Payment button is available to retry
    await expect(page.locator('#start-payment')).toBeVisible();
  });
});
