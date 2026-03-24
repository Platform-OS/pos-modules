// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('Test payment page loads successfully', async ({ page }) => {
    // 1. Navigate to /test-payment page
    await page.goto('/test-payment');

    // expect: Page loads with status 200
    expect(page).toHaveURL(/\/test-payment/);

    // expect: Page displays the heading '🧪 Test Payment - Example Gateway'
    await expect(page.getByRole('heading', { name: /🧪 Test Payment - Example Gateway/i })).toBeVisible();

    // expect: Page shows test transaction details: Amount: $10.99, Currency: USD, Items: test-item-1, test-item-2
    await expect(page.getByText('$10.99')).toBeVisible();
    await expect(page.getByText('USD')).toBeVisible();
    await expect(page.getByText(/test-item-1/)).toBeVisible();
    await expect(page.getByText(/test-item-2/)).toBeVisible();

    // expect: Page displays the 'Start Test Payment' button with id='start-payment'
    await expect(page.locator('#start-payment')).toBeVisible();

    // expect: Info message is visible explaining this is a test payment gateway
    await expect(page.getByText(/test payment gateway/i)).toBeVisible();

    // 2. Verify page structure and content

    // expect: Transaction details are visible showing: Amount: $10.99, Currency: USD, Gateway: example_gateway
    await expect(page.getByText(/Amount/i)).toBeVisible();
    await expect(page.getByText(/Currency/i)).toBeVisible();
    await expect(page.getByText(/example_gateway/i)).toBeVisible();

    // expect: Form element with POST method to /test-payment?create=1 is present
    const form = page.locator('form[action*="/test-payment"]');
    await expect(form).toBeVisible();

    // expect: Submit button with id 'start-payment' is present and clickable
    const submitButton = page.locator('#start-payment');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    // expect: E2E testing instructions are visible at the bottom of the page
    await expect(page.getByText(/E2E/i)).toBeVisible();
  });
});
