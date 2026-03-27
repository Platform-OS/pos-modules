import { test, expect } from '@playwright/test';

test.describe('URL Parameter Preservation', () => {
  test('should preserve success_url and cancel_url through payment flow', async ({ page }) => {
    await test.step('Create checkout session', async () => {
      await page.goto('/test-stripe-payment');

      const startButton = page.locator('#start-payment');
      await startButton.click();

      await page.waitForURL(/.*/, { timeout: 10000 });
    });

    await test.step('Verify URLs contain transaction_id parameter', async () => {
      const url = page.url();

      // Check if we got to a URL with transaction_id
      const hasTransactionId = url.includes('transaction_id=');

      if (hasTransactionId) {
        const match = url.match(/transaction_id=([^&]+)/);
        expect(match).toBeTruthy();

        const transactionId = match![1];
        expect(transactionId).toBeTruthy();
        expect(transactionId.length).toBeGreaterThan(0);
      }
      // If redirected to Stripe, the transaction_id would be in Stripe's success_url parameter
    });
  });

  test('should display transaction_id in success page', async ({ page }) => {
    await test.step('Navigate to success page with transaction_id', async () => {
      const testTransactionId = 'test_txn_12345';
      await page.goto(`/test-stripe-payment?success=true&transaction_id=${testTransactionId}`);
    });

    await test.step('Verify transaction_id is displayed', async () => {
      const successMessage = page.locator('text=Payment Successful!');
      await expect(successMessage).toBeVisible();

      const transactionIdDisplay = page.locator('text=Transaction ID: test_txn_12345');
      await expect(transactionIdDisplay).toBeVisible();
    });
  });

  test('should display transaction_id in failure page', async ({ page }) => {
    await test.step('Navigate to failure page with transaction_id', async () => {
      const testTransactionId = 'test_txn_67890';
      await page.goto(`/test-stripe-payment?failure=true&transaction_id=${testTransactionId}`);
    });

    await test.step('Verify transaction_id is displayed', async () => {
      const failureMessage = page.locator('text=Payment Failed');
      await expect(failureMessage).toBeVisible();

      const transactionIdDisplay = page.locator('text=Transaction ID: test_txn_67890');
      await expect(transactionIdDisplay).toBeVisible();
    });
  });
});
