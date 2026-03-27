import { test, expect } from '@playwright/test';

test('Verify Stripe API key is working', async ({ page }) => {
  await page.goto('/test-stripe-payment');
  
  const startButton = page.locator('#start-payment');
  await startButton.click();
  
  await page.waitForURL(/.*/, { timeout: 10000 });
  
  const finalUrl = page.url();
  console.log('='.repeat(60));
  console.log('Final URL:', finalUrl);
  console.log('='.repeat(60));
  
  if (finalUrl.includes('checkout.stripe.com')) {
    console.log('✅ SUCCESS: Redirected to Stripe checkout');
    console.log('✅ Your Stripe API key is working!');
    expect(true).toBeTruthy();
  } else if (finalUrl.includes('failure=true')) {
    console.log('❌ FAILURE: Redirected to failure page');
    console.log('❌ Check logs - Stripe key might be invalid');
    expect(true).toBeFalsy();
  } else {
    console.log('⚠️  UNKNOWN: Stayed on test page');
    console.log('⚠️  Stripe key might not be set or invalid');
    expect(true).toBeFalsy();
  }
});
