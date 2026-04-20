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

test.describe('Charge Event Webhooks', () => {
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

  test('charge.succeeded webhook updates transaction to succeeded', async ({ request }) => {
    // Verify initial state
    expect(transaction.id).toBeTruthy();
    expect(getProperty(transaction, 'c__status')).toBe('pending');
    expect(getProperty(transaction, 'gateway')).toBe('stripe');

    // Generate charge.succeeded webhook payload with transaction metadata
    const chargeId = `ch_test_${Date.now()}`;
    const event = createChargeSucceededEvent({
      chargeId,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    // Verify webhook payload structure
    expect(event.data.object.status).toBe('succeeded');
    expect(event.data.object.metadata.transaction_id).toBe(transaction.id);
    expect(event.data.object.metadata.host).toBe(host);

    // Send webhook
    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    // Verify webhook processing
    expect(response.status()).toBe(200);
    const responseText = await response.text();
    expect(responseText).not.toContain('error');

    // Query transaction to verify status change
    const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);

    // Verify transaction updated correctly
    const status = getProperty(updatedTransaction, 'c__status');
    expect(status).toContain('succeeded');
    const gatewayTransactionId = getProperty(updatedTransaction, 'gateway_transaction_id');
    expect(gatewayTransactionId).toContain(chargeId);
  });
});
