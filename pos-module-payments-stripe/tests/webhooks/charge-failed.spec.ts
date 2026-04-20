import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

/**
 * Create a Stripe charge.failed event payload
 */
function createChargeFailedEvent(data: {
  chargeId: string;
  transactionId: string;
  host: string;
  failureCode?: string;
  failureMessage?: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'charge.failed',
    data: {
      object: {
        id: data.chargeId,
        object: 'charge',
        status: 'failed',
        amount: 10000,
        currency: 'usd',
        failure_code: data.failureCode || 'card_declined',
        failure_message: data.failureMessage || 'Your card was declined.',
        metadata: {
          transaction_id: data.transactionId,
          host: data.host,
        },
      },
    },
  };
}

test.describe('Charge Failed Webhook', () => {
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

  test('charge.failed webhook updates transaction to failed status', async ({ request }) => {
    const event = createChargeFailedEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      failureCode: 'card_declined',
      failureMessage: 'Your card was declined.',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    expect(response.status()).toBe(200);

    // Wait for webhook processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify transaction status updated
    const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
    const status = getProperty(updatedTransaction, 'c__status');

    expect(status).toContain('failed');
  });

  test('charge.failed with insufficient_funds updates transaction correctly', async ({ request }) => {
    const event = createChargeFailedEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      failureCode: 'insufficient_funds',
      failureMessage: 'Your card has insufficient funds.',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    expect(response.status()).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 1500));

    const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
    const status = getProperty(updatedTransaction, 'c__status');

    expect(status).toContain('failed');
  });

  test('charge.failed with expired_card is handled', async ({ request }) => {
    const event = createChargeFailedEvent({
      chargeId: `ch_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
      failureCode: 'expired_card',
      failureMessage: 'Your card has expired.',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    expect(response.status()).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 1500));

    const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
    const status = getProperty(updatedTransaction, 'c__status');

    expect(status).toContain('failed');
  });

  test('Multiple charge.failed webhooks for same charge are idempotent', async ({ request }) => {
    const chargeId = `ch_test_${Date.now()}`;
    const event = createChargeFailedEvent({
      chargeId,
      transactionId: transaction.id,
      host,
      failureCode: 'card_declined',
    });

    // Send first webhook
    await sendWebhook(request, baseURL, event, webhookSecret, '/payments/stripe/webhooks');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send duplicate
    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    // 202 means already processed (idempotent), 200 means freshly processed
    expect([200, 202]).toContain(response.status());

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Status should still be failed (not duplicated or corrupted)
    const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
    const finalStatus = getProperty(finalTransaction, 'c__status');

    expect(finalStatus).toContain('failed');
  });

  test('charge.failed after charge.succeeded maintains succeeded status', async ({ request }) => {
    // First update transaction to succeeded
    await test.step('Transaction succeeds first', async () => {
      const succeededEvent = {
        id: `evt_${Date.now()}`,
        type: 'charge.succeeded',
        data: {
          object: {
            id: `ch_test_${Date.now()}`,
            object: 'charge',
            status: 'succeeded',
            amount: 10000,
            currency: 'usd',
            metadata: {
              transaction_id: transaction.id,
              host,
            },
          },
        },
      };

      await sendWebhook(request, baseURL, succeededEvent, webhookSecret, '/payments/stripe/webhooks');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
      const status = getProperty(updatedTransaction, 'c__status');
      expect(status).toContain('succeeded');
    });

    await test.step('Later charge.failed webhook should not override succeeded', async () => {
      const failedEvent = createChargeFailedEvent({
        chargeId: `ch_test_${Date.now()}`,
        transactionId: transaction.id,
        host,
        failureCode: 'generic_decline',
      });

      await sendWebhook(request, baseURL, failedEvent, webhookSecret, '/payments/stripe/webhooks');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
      const finalStatus = getProperty(finalTransaction, 'c__status');

      expect(finalStatus).toContain('succeeded');
    });
  });
});
