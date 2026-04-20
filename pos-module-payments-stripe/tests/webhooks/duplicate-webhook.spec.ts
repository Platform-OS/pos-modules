import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  createChargeSucceededEvent,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Duplicate Webhook Idempotency', () => {
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

  test('Duplicate charge.succeeded webhooks are idempotent', async ({ request }) => {
    const chargeId = `ch_test_${Date.now()}`;

    const event = createChargeSucceededEvent({
      chargeId,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    await test.step('Send first webhook', async () => {
      const response = await sendWebhook(
        request,
        baseURL,
        event,
        webhookSecret,
        '/payments/stripe/webhooks'
      );

      expect(response.status()).toBe(200);

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    let firstStatus: string;
    await test.step('Verify transaction updated to succeeded', async () => {
      const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
      firstStatus = getProperty(updatedTransaction, 'c__status');

      expect(firstStatus).toContain('succeeded');
    });

    await test.step('Send duplicate webhook (same event ID)', async () => {
      const response = await sendWebhook(
        request,
        baseURL,
        event, // Same event
        webhookSecret,
        '/payments/stripe/webhooks'
      );

      // Should still accept (idempotent) - 202 means already processed, 200 means freshly processed
      expect([200, 202]).toContain(response.status());

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    await test.step('Verify transaction status unchanged', async () => {
      const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
      const finalStatus = getProperty(finalTransaction, 'c__status');

      // Status should be the same (idempotent)
      expect(finalStatus).toBe(firstStatus);
      expect(finalStatus).toContain('succeeded');
    });
  });

  test('Multiple webhooks for same charge with different event IDs are handled correctly', async ({ request }) => {
    const chargeId = `ch_test_${Date.now()}`;

    await test.step('Send first charge.succeeded webhook', async () => {
      const event1 = createChargeSucceededEvent({
        chargeId,
        transactionId: transaction.id,
        host,
        amount: 10000,
        currency: 'usd',
      });

      const response = await sendWebhook(
        request,
        baseURL,
        event1,
        webhookSecret,
        '/payments/stripe/webhooks'
      );

      expect(response.status()).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    await test.step('Verify transaction succeeded', async () => {
      const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
      const status = getProperty(updatedTransaction, 'c__status');
      expect(status).toContain('succeeded');
    });

    await test.step('Send second webhook (different event ID, same charge)', async () => {
      const event2 = createChargeSucceededEvent({
        chargeId, // Same charge ID
        transactionId: transaction.id,
        host,
        amount: 10000,
        currency: 'usd',
      });
      // event2 will have different event ID (evt_XXX) due to timestamp

      const response = await sendWebhook(
        request,
        baseURL,
        event2,
        webhookSecret,
        '/payments/stripe/webhooks'
      );

      // Should accept without error (same charge, idempotent) - 202 means already processed, 200 means freshly processed
      expect([200, 202]).toContain(response.status());
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    await test.step('Verify transaction still succeeded (not duplicated)', async () => {
      const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
      const finalStatus = getProperty(finalTransaction, 'c__status');

      expect(finalStatus).toContain('succeeded');
      // Transaction should not be duplicated or corrupted
    });
  });

  test('Rapid duplicate webhooks (race condition) are handled safely', async ({ request }) => {
    const chargeId = `ch_test_${Date.now()}`;

    const event = createChargeSucceededEvent({
      chargeId,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    // Send same webhook 3 times in parallel (simulating race condition)
    const responses = await Promise.all([
      sendWebhook(request, baseURL, event, webhookSecret, '/payments/stripe/webhooks'),
      sendWebhook(request, baseURL, event, webhookSecret, '/payments/stripe/webhooks'),
      sendWebhook(request, baseURL, event, webhookSecret, '/payments/stripe/webhooks'),
    ]);

    // A race may process one request fully and mark the rest as already handled.
    responses.forEach(response => {
      expect([200, 202]).toContain(response.status());
    });

    // Wait for all to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify transaction is still in valid state
    const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
    const finalStatus = getProperty(finalTransaction, 'c__status');

    expect(finalStatus).toContain('succeeded');
    // No corruption or duplicate processing
  });
});
