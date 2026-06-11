import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createChargeSucceededEvent,
  createCheckoutCompletedEvent,
  sendWebhook,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Webhook for Non-Existent Transaction', () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let baseURL: string;
  let host: string;
  let webhookEndpoint: any;
  let checkoutCompletedEndpoint: any;

  test.beforeEach(async ({ request }) => {
    baseURL = getRequiredBaseURL();
    host = getHostFromBaseURL(baseURL);

    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks`,
      secret: webhookSecret,
      livemode: false,
    });

    checkoutCompletedEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/checkout_session_completed_webhook`,
      secret: webhookSecret,
      livemode: false,
    });
  });

  test.afterEach(async ({ request }) => {
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, "modules/payments_stripe/webhook_endpoint");
    }
    if (checkoutCompletedEndpoint?.id) {
      await deleteRecord(request, baseURL, checkoutCompletedEndpoint.id, "modules/payments_stripe/webhook_endpoint");
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

    expect(response.status()).toBe(500);

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

    expect(response.status()).toBe(202);

    const responseText = await response.text();

    expect(responseText).toMatch(/transaction_id|not exist/i);
  });

});
