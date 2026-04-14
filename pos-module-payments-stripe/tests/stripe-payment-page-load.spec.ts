import { test, expect } from '@playwright/test';

test.describe('Stripe Payment Page', () => {
  test.skip('should load payment page successfully', async ({ page }) => {
    await test.step('Navigate to payment page', async () => {
      await page.goto('/test-stripe-payment');
      await expect(page).toHaveURL(/test-stripe-payment/);
    });

    await test.step('Verify page heading is visible', async () => {
      const heading = page.locator('h1:has-text("Stripe Payment Test")');
      await expect(heading).toBeVisible();
    });

    await test.step('Verify transaction details are displayed', async () => {
      const transactionDetails = page.locator('text=Transaction Details');
      await expect(transactionDetails).toBeVisible();

      const amount = page.locator('text=$50.00 USD');
      await expect(amount).toBeVisible();

      const gateway = page.locator('text=Gateway');
      await expect(gateway).toBeVisible();
    });

    await test.step('Verify start payment button exists', async () => {
      const startButton = page.locator('#start-payment');
      await expect(startButton).toBeVisible();
      await expect(startButton).toHaveText(/Start Payment with Stripe/);
    });
  });
});
