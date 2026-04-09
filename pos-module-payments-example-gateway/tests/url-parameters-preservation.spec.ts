// spec: tests/payment-gateway-smoke.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Payment Gateway Smoke Tests', () => {
  test('URL parameters preservation in redirect flow', async ({ page }) => {
    // 1. Create transaction and navigate to payment gateway page
    await page.goto('/test-payment');
    await page.locator('#start-payment').click();

    // expect: Gateway page loads with transaction_id, success_url, and failed_url parameters
    await page.waitForURL(/\/payments\/example_gateway/);

    // 2. Verify all required URL parameters are present

    const currentUrl = page.url();

    // expect: transaction_id is present in URL
    expect(currentUrl).toMatch(/transaction_id=[^&]+/);

    // expect: success_url parameter equals /test-payment?payment_success=1 (URL encoded)
    expect(currentUrl).toMatch(/success_url=%2Ftest-payment%3Fpayment_success%3D1/);

    // expect: failed_url parameter equals /test-payment?payment_failed=1 (URL encoded)
    expect(currentUrl).toMatch(/failed_url=%2Ftest-payment%3Fpayment_failed%3D1/);

    // expect: Form hidden inputs contain all three parameters for webhook submission
    const transactionIdInput = page.locator('input[name="transaction_id"]');
    const successUrlInput = page.locator('input[name="success_url"]');
    const failedUrlInput = page.locator('input[name="failed_url"]');

    await expect(transactionIdInput).toBeAttached();
    await expect(successUrlInput).toBeAttached();
    await expect(failedUrlInput).toBeAttached();

    // Verify the hidden inputs have values
    expect(await transactionIdInput.inputValue()).not.toBe('');
    expect(await successUrlInput.inputValue()).toContain('/test-payment');
    expect(await failedUrlInput.inputValue()).toContain('/test-payment');

    // 3. Submit payment and verify redirect URL

    // Test success flow
    const successButton = page.getByRole('button', { name: /Payment Success/i }).first();
    await successButton.click();

    // expect: After clicking Payment Success, user is redirected to exact success_url
    await page.waitForURL(/\/test-payment\?payment_success=1/);
    expect(page.url()).toMatch(/\/test-payment\?payment_success=1/);

    // expect: No parameters are lost during redirect chain

    // Now test failed flow with a new transaction
    await page.goto('/test-payment');
    await page.locator('#start-payment').click();
    await page.waitForURL(/\/payments\/example_gateway/);

    const failedButton = page.getByRole('button', { name: /Payment Failed/i });
    await failedButton.click();

    // expect: After clicking Payment Failed, user is redirected to exact failed_url
    await page.waitForURL(/\/test-payment\?payment_failed=1/);
    expect(page.url()).toMatch(/\/test-payment\?payment_failed=1/);
  });
});
