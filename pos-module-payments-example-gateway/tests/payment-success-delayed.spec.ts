// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Delayed payment success flow', async ({ page }) => {
    // 1. Navigate to /test-payment page
    await page.goto('/test-payment');

    // expect: Page loads successfully
    await expect(page.getByRole('heading', { name: /Test Payment/i })).toBeVisible();

    // 2. Click the 'Start Test Payment' button
    await page.locator('#start-payment').click();

    // expect: User is redirected to payment gateway page
    await page.waitForURL(/\/payments\/example_gateway/);

    // 3. Verify delayed payment button is present

    // expect: Third button with text 'Payment Success delay status change for 15s' is visible
    const delayedButton = page.getByRole('button', { name: /Payment Success delay status change for 15s/i });
    await expect(delayedButton).toBeVisible();

    // expect: Button shows transaction amount: $10.99
    await expect(delayedButton).toContainText('$10.99');

    // expect: Button has name='payment_status' and value='success_delayed'
    await expect(delayedButton).toHaveAttribute('name', 'payment_status');
    await expect(delayedButton).toHaveAttribute('value', 'success_delayed');

    // 4. Click 'Payment Success delay status change for 15s' button
    await delayedButton.click();

    // expect: Form submits to webhook endpoint with payment_status=success_delayed
    // expect: Webhook queues background job to update transaction status after 15 second delay
    // expect: User is immediately redirected to success_url: /test-payment?payment_success=1
    await page.waitForURL(/\/test-payment\?payment_success=1/);

    // expect: Success page displays while transaction processes in background
    expect(page.url()).toMatch(/payment_success=1/);

    // 5. Verify success page displays

    // expect: Green success message is displayed
    await expect(page.getByText(/Payment Successful/i)).toBeVisible();

    // expect: Transaction will be updated to 'succeeded' status after background job completes (15 seconds)
    // Note: We don't wait for the background job to complete in this test
  });
});
