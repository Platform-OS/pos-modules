import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createTransaction,
  sendWebhook,
  queryTransaction,
  getProperty,
  deleteRecord,
} from '../helpers/stripe-api';

/**
 * Create a Stripe checkout.session.expired event payload
 */
function createSessionExpiredEvent(data: {
  sessionId: string;
  transactionId: string;
  host: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'checkout.session.expired',
    data: {
      object: {
        id: data.sessionId,
        object: 'checkout.session',
        status: 'expired',
        client_reference_id: data.transactionId,
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        metadata: {
          transaction_id: data.transactionId,
        },
      },
    },
  };
}

test.describe('Checkout Session Expired Webhook', () => {
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

  test('checkout.session.expired webhook updates transaction to expired status', async ({ request }) => {
    const event = createSessionExpiredEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
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

    expect(status).toContain('expired');
  });

  test('Expired session after 24 hours is handled correctly', async ({ request }) => {
    const event = createSessionExpiredEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
    });

    // Modify expires_at to 24 hours ago
    event.data.object.expires_at = Math.floor(Date.now() / 1000) - (24 * 3600);

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

    expect(status).toContain('expired');
  });

  test('Multiple session.expired webhooks are idempotent', async ({ request }) => {
    const sessionId = `cs_test_${Date.now()}`;
    const event = createSessionExpiredEvent({
      sessionId,
      transactionId: transaction.id,
      host,
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

    expect(response.status()).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Status should still be expired (idempotent)
    const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
    const finalStatus = getProperty(finalTransaction, 'c__status');

    expect(finalStatus).toContain('expired');
  });

  test('Expired webhook for non-existent transaction is handled gracefully', async ({ request }) => {
    const nonExistentTransactionId = '88888888';

    const event = createSessionExpiredEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: nonExistentTransactionId,
      host,
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    // Should not crash - return 200/202
    expect([200, 202]).toContain(response.status());

    const responseText = await response.text();
    expect(responseText.length).toBeGreaterThan(0);
  });

  test('Session expired after payment succeeded does not change status', async ({ request }) => {
    await test.step('First complete the payment', async () => {
      const completedEvent = {
        id: `evt_${Date.now()}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            object: 'checkout.session',
            payment_status: 'paid',
            client_reference_id: transaction.id,
            success_url: `https://${host}/payment/success?transaction_id=${transaction.id}`,
            customer: `cus_${Date.now()}`,
            payment_method: `pm_${Date.now()}`,
            metadata: {
              transaction_id: transaction.id,
            },
          },
        },
      };

      await sendWebhook(request, baseURL, completedEvent, webhookSecret, '/payments/stripe/checkout_session_completed_webhook');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const updatedTransaction = await queryTransaction(request, baseURL, transaction.id);
      const status = getProperty(updatedTransaction, 'c__status');
      expect(status).toContain('succeeded');
    });

    await test.step('Later expired webhook should not override succeeded', async () => {
      const expiredEvent = createSessionExpiredEvent({
        sessionId: `cs_test_${Date.now()}`,
        transactionId: transaction.id,
        host,
      });

      await sendWebhook(request, baseURL, expiredEvent, webhookSecret, '/payments/stripe/webhooks');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
      const finalStatus = getProperty(finalTransaction, 'c__status');

      // Should remain succeeded (terminal state)
      expect(finalStatus).toContain('succeeded');
    });
  });

  test('User abandonment scenario - pending to expired', async ({ request }) => {
    // Simulate user flow: create session, user abandons, session expires
    const initialStatus = getProperty(transaction, 'c__status');
    expect(initialStatus).toBe('pending');

    const event = createSessionExpiredEvent({
      sessionId: `cs_test_${Date.now()}`,
      transactionId: transaction.id,
      host,
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

    const finalTransaction = await queryTransaction(request, baseURL, transaction.id);
    const finalStatus = getProperty(finalTransaction, 'c__status');

    // Transaction should move from pending -> expired
    expect(finalStatus).not.toBe('pending');
    expect(finalStatus).toContain('expired');
  });
});
