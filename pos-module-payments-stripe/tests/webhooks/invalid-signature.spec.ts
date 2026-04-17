import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  createChargeSucceededEvent,
  generateWebhookSignature,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('Invalid Webhook Signature', () => {
  const baseURL = process.env.MPKIT_URL!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  const host = new URL(baseURL).host;

  let webhookEndpoint: any;
  let transaction: any;

  test.beforeEach(async ({ request }) => {
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

  test('Webhook with invalid signature is rejected', async ({ request }) => {
    const event = createChargeSucceededEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(event);

    // Generate signature with WRONG secret
    const wrongSecret = 'whsec_wrong_secret_123';
    const invalidSignature = generateWebhookSignature(payload, wrongSecret, timestamp);

    const response = await request.post(`${baseURL}/payments/stripe/webhooks`, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': `t=${timestamp},v1=${invalidSignature}`,
      },
      data: payload,
    });

    // Should reject with 403 Forbidden (body is always empty - no echo after response_status 403)
    expect(response.status()).toBe(403);
  });

  test('Webhook with missing signature header is rejected', async ({ request }) => {
    const event = createChargeSucceededEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    const response = await request.post(`${baseURL}/payments/stripe/webhooks`, {
      headers: {
        'Content-Type': 'application/json',
        // No Stripe-Signature header
      },
      data: JSON.stringify(event),
    });

    // Should reject with 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test('Webhook with malformed signature is rejected', async ({ request }) => {
    const event = createChargeSucceededEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    const response = await request.post(`${baseURL}/payments/stripe/webhooks`, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'invalid_format_signature',
      },
      data: JSON.stringify(event),
    });

    // Should reject with 403 Forbidden
    expect(response.status()).toBe(403);
  });
});
