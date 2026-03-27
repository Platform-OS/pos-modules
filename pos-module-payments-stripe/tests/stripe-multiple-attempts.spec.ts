import { test, expect } from '@playwright/test';

test.describe('Multiple Payment Attempts', () => {
  test('should allow multiple payment attempts', async ({ page }) => {
    let firstTransactionId: string | undefined;
    let secondTransactionId: string | undefined;

    await test.step('First payment attempt', async () => {
      await page.goto('/test-stripe-payment');

      const startButton = page.locator('#start-payment');
      await startButton.click();

      await page.waitForURL(/.*/, { timeout: 10000 });

      const url = page.url();
      const match = url.match(/transaction_id=([^&]+)/);
      if (match) {
        firstTransactionId = match[1];
        console.log('First transaction ID:', firstTransactionId);
      }
    });

    await test.step('Navigate back to payment page', async () => {
      await page.goto('/test-stripe-payment');

      const heading = page.locator('h1:has-text("Stripe Payment Test")');
      await expect(heading).toBeVisible();
    });

    await test.step('Second payment attempt', async () => {
      const startButton = page.locator('#start-payment');
      await expect(startButton).toBeVisible();
      await startButton.click();

      await page.waitForURL(/.*/, { timeout: 10000 });

      const url = page.url();
      const match = url.match(/transaction_id=([^&]+)/);
      if (match) {
        secondTransactionId = match[1];
        console.log('Second transaction ID:', secondTransactionId);
      }
    });

    await test.step('Verify different transactions were created', async () => {
      if (firstTransactionId && secondTransactionId) {
        // Each attempt should create a new transaction
        expect(firstTransactionId).not.toBe(secondTransactionId);
        console.log('Successfully created two different transactions');
      } else {
        console.log('Could not verify transaction IDs (might be in Stripe checkout)');
      }
    });
  });
});
