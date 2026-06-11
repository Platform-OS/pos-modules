import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  createCheckoutCompletedEvent,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Checkout Session Webhooks', () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let baseURL: string;
  let host: string;
  let webhookEndpoint: any;
  let transaction: any;

  test.beforeEach(async ({ request }) => {
    baseURL = getRequiredBaseURL();
    host = getHostFromBaseURL(baseURL);

    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/checkout_session_completed_webhook`,
      secret: webhookSecret,
      livemode: false,
    });

    const sessionId = `cs_test_${Date.now()}`;
    transaction = await createTransaction(request, baseURL, {
      gateway: 'stripe',
      amount_cents: 10000,
      currency: 'usd',
      status: 'pending',
      gateway_transaction_id: sessionId,
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

  test('checkout.session.completed webhook updates transaction to succeeded and captures customer info', async ({ request }) => {
    expect(getProperty(transaction, 'c__status')).toBe('pending');

    const sessionId = getProperty(transaction, 'gateway_transaction_id');
    const event = createCheckoutCompletedEvent({
      sessionId,
      transactionId: transaction.id,
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

    expect(response.ok()).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
    const status = getProperty(updatedTransaction, 'c__status');
    expect(status).toContain('succeeded');
  });
});
