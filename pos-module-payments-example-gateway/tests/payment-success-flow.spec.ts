// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Successful payment flow end-to-end', async ({ page }) => {
    // 1. Navigate to /test-payment page
    await page.goto('/test-payment');

    // expect: Page loads successfully with the test payment form
    await expect(page.getByRole('heading', { name: /Test Payment/i })).toBeVisible();

    // 2. Click the 'Start Test Payment' button (id='start-payment')
    await page.locator('#start-payment').click();

    // expect: Form submits and creates a new transaction
    // expect: User is redirected to /payments/example_gateway/index page
    await page.waitForURL(/\/payments\/example_gateway/);

    // expect: URL includes transaction_id parameter
    expect(page.url()).toMatch(/transaction_id=/);

    // expect: URL includes success_url parameter set to /test-payment?payment_success=1 (URL encoded)
    expect(page.url()).toMatch(/success_url=%2Ftest-payment%3Fpayment_success%3D1/);

    // expect: URL includes failed_url parameter set to /test-payment?payment_failed=1 (URL encoded)
    expect(page.url()).toMatch(/failed_url=%2Ftest-payment%3Fpayment_failed%3D1/);

    // 3. Verify payment gateway page loads

    // expect: Page displays heading 'Example Payment Gateway'
    await expect(page.getByRole('heading', { name: /Example Payment Gateway/i })).toBeVisible();

    // expect: Page shows 'Select payment status:' text
    await expect(page.getByText(/Select payment status/i)).toBeVisible();

    // expect: Three buttons are visible: 'Payment Success', 'Payment Failed', and 'Payment Success delay status change for 15s'
    const successButton = page.getByRole('button', { name: /Payment Success/i }).first();
    const failedButton = page.getByRole('button', { name: /Payment Failed/i });
    const delayedButton = page.getByRole('button', { name: /Payment Success delay/i });

    await expect(successButton).toBeVisible();
    await expect(failedButton).toBeVisible();
    await expect(delayedButton).toBeVisible();

    // expect: Payment Success button shows the transaction amount: $10.99
    await expect(successButton).toContainText('$10.99');

    // expect: Form action points to /payments/example_gateway/webhook
    const form = page.locator('form[action*="/payments/example_gateway/webhook"]');
    await expect(form).toBeVisible();

    // expect: Hidden input fields contain transaction_id, success_url, and failed_url
    await expect(page.locator('input[name="transaction_id"]')).toBeAttached();
    await expect(page.locator('input[name="success_url"]')).toBeAttached();
    await expect(page.locator('input[name="failed_url"]')).toBeAttached();

    // 4. Click 'Payment Success' button
    await successButton.click();

    // expect: Form submits to webhook endpoint
    // expect: Webhook processes the payment_status=success
    // expect: Transaction status is updated to 'succeeded'
    // expect: User is redirected to the success_url: /test-payment?payment_success=1
    await page.waitForURL(/\/test-payment\?payment_success=1/);

    // 5. Verify success page displays correctly

    // expect: User lands on /test-payment page with payment_success=1 parameter
    expect(page.url()).toMatch(/payment_success=1/);

    // expect: Green success message is displayed: '✓ Payment Successful!'
    await expect(page.getByText(/✓.*Payment Successful/i)).toBeVisible();

    // expect: Success message includes text: 'Your test payment was processed successfully.'
    await expect(page.getByText(/Your test payment was processed successfully/i)).toBeVisible();

    // expect: Start Test Payment button is still available for additional tests
    await expect(page.locator('#start-payment')).toBeVisible();
  });
});
