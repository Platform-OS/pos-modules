import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  createChargeSucceededEvent,
  sendWebhook,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Webhook Signature Validation', () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let baseURL: string;
  let host: string;
  let webhookEndpoint: any;
  let transaction: any;

  test.beforeEach(async ({ request }) => {
    baseURL = getRequiredBaseURL();
    host = getHostFromBaseURL(baseURL);

    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks`,
      secret: webhookSecret,
      livemode: false,
    });

    transaction = await createTransaction(request, baseURL, {
      gateway: 'stripe',
      amount_cents: 10000,
      currency: 'usd',
      status: 'pending',
    });
  });

  test.afterEach(async ({ request }) => {
    if (transaction?.id) {
      await deleteRecord(request, baseURL, transaction.id, "modules/payments/transaction");
    }
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, "modules/payments_stripe/webhook_endpoint");
    }
  });

  test('Valid webhook signature is accepted', async ({ request }) => {
    const event = createChargeSucceededEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
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

    expect(response.status()).toBe(200);

    const responseText = await response.text();
    expect(responseText).not.toContain('invalid webhook');
  });
});
