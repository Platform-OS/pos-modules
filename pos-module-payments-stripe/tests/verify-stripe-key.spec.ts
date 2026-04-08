import { test, expect } from '@playwright/test';

test.skip('Verify Stripe API key is working', async ({ page }) => {
  await page.goto('/test-stripe-payment');
  
  const startButton = page.locator('#start-payment');
  await startButton.click();
  
  await page.waitForURL(/.*/, { timeout: 10000 });

  const finalUrl = page.url();

  if (finalUrl.includes('checkout.stripe.com')) {
    expect(true).toBeTruthy();
  } else if (finalUrl.includes('failure=true')) {
    expect(true).toBeFalsy();
  } else {
    expect(true).toBeFalsy();
  }
});
