import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  createChargeSucceededEvent,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('GraphQL Query Verification', () => {
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

  test('Query transaction by ID returns correct data', async ({ request }) => {
    const chargeId = `ch_test_${Date.now()}`;
    const event = createChargeSucceededEvent({
      chargeId,
      transactionId: transaction.id,
      host,
      amount: 10000,
      currency: 'usd',
    });

    const webhookResponse = await sendWebhook(request, baseURL, event, webhookSecret, '/payments/stripe/webhooks');
    expect(webhookResponse.status()).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 500));

    const queriedTransaction = await queryTransaction(request, baseURL, transaction.id);

    expect(queriedTransaction.id).toBe(transaction.id);
    expect(getProperty(queriedTransaction, 'c__status')).toContain('succeeded');

    const gatewayTransactionId = getProperty(queriedTransaction, 'gateway_transaction_id');
    expect(gatewayTransactionId).toBeTruthy();
    expect(gatewayTransactionId).toContain(chargeId);

    expect(getProperty(queriedTransaction, 'gateway')).toBe('stripe');
    expect(getProperty(queriedTransaction, 'amount_cents')).toBe(10000);
    expect(getProperty(queriedTransaction, 'currency')).toBe('usd');
  });
});
