import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createChargeSucceededEvent,
  createCheckoutCompletedEvent,
  sendWebhook,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('Webhook for Non-Existent Transaction', () => {
  const baseURL = process.env.MPKIT_URL!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  const host = new URL(baseURL).host;

  let webhookEndpoint: any;

  test.beforeEach(async ({ request }) => {
    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks`,
      secret: webhookSecret,
      livemode: false,
    });
  });

  test.afterEach(async ({ request }) => {
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, "modules/payments_stripe/webhook_endpoint");
    }
  });

  test('charge.succeeded webhook for non-existent transaction is handled gracefully', async ({ request }) => {
    const nonExistentTransactionId = '99999999';

    const event = createChargeSucceededEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: nonExistentTransactionId,
      host,
      amount: 10000,
      currency: 'usd',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    // Should not crash - return 202 Accepted (not relevant for this instance)
    // OR 200 OK with error in response
    expect([200, 202]).toContain(response.status());

    const responseText = await response.text();

    // Should indicate transaction doesn't exist
    expect(responseText).toMatch(/not exist|not found/i);
  });

  test('checkout.session.completed webhook for non-existent transaction is handled gracefully', async ({ request }) => {
    const nonExistentTransactionId = '88888888';

    const event = createCheckoutCompletedEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: nonExistentTransactionId,
      host,
      paymentStatus: 'paid',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/checkout_session_completed_webhook'
    );

    // Should not crash - return 202 Accepted or 500 with graceful error
    expect([200, 202, 500]).toContain(response.status());

    const responseText = await response.text();

    // Should not be a blank/crash response
    expect(responseText.length).toBeGreaterThan(0);
  });

  test('Webhook with transaction_id from different instance is ignored', async ({ request }) => {
    // This simulates a scenario where Stripe sends webhooks to all configured endpoints,
    // but the transaction belongs to a different platformOS instance

    const event = createCheckoutCompletedEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: '12345',
      host: 'different-instance.example.com', // Different host
      paymentStatus: 'paid',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    // Should return 202 Accepted (webhook from different host)
    expect(response.status()).toBe(202);

    const responseText = await response.text();
    expect(responseText).toContain('Transaction from different host');
  });
});
