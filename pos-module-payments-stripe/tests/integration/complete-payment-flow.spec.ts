import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  updateTransaction,
  createChargeSucceededEvent,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('Integration Scenarios', () => {
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
      status: 'new',
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

  test('Complete payment flow from creation to success', async ({ request }) => {
    expect(transaction.id).toBeTruthy();
    expect(getProperty(transaction, 'c__status')).toBe('new');

    // Simulate checkout session creation
    const sessionId = `cs_test_${Date.now()}`;
    await updateTransaction(request, baseURL, transaction.id, {
      gateway_transaction_id: sessionId,
      status: 'pending',
    });

    let updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
    const pendingStatus = getProperty(updatedTransaction, 'c__status');
    expect(pendingStatus).toContain('pending');
    expect(getProperty(updatedTransaction, 'gateway_transaction_id')).toBe(sessionId);

    // Simulate successful payment webhook
    const chargeId = `ch_test_${Date.now()}`;
    const event = createChargeSucceededEvent({
      chargeId,
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
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify final state
    const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
    const finalStatus = getProperty(finalTransaction, 'c__status');
    expect(finalStatus).toContain('succeeded');
    const gatewayTransactionId = getProperty(finalTransaction, 'gateway_transaction_id');
    expect(gatewayTransactionId).toContain(chargeId);
  });
});
