import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createConnectedAccount,
  createPayoutPaidEvent,
  sendWebhook,
  queryPayoutByPayoutId,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Connected Account Webhooks', () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let baseURL: string;
  let host: string;
  let webhookEndpoint: any;
  let connectedAccount: any;
  let accountId: string;

  test.beforeEach(async ({ request }) => {
    baseURL = getRequiredBaseURL();
    host = getHostFromBaseURL(baseURL);

    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks_connect`,
      secret: webhookSecret,
      livemode: false,
    });

    accountId = `acct_test_${Date.now()}`;
    const referenceId = `ref_${Date.now()}`;
    connectedAccount = await createConnectedAccount(request, baseURL, {
      account_id: accountId,
      reference_id: referenceId,
    });
  });

  test.afterEach(async ({ request }) => {
    if (connectedAccount?.id) {
      await deleteRecord(request, baseURL, connectedAccount.id, 'modules/payments_stripe/connected_account');
    }
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, 'modules/payments_stripe/webhook_endpoint');
    }
  });

  test('payout.paid webhook creates a payout record', async ({ request }) => {
    const payoutId = `po_test_${Date.now()}`;
    const amount = 50000;
    const currency = 'usd';

    const event = createPayoutPaidEvent({
      payoutId,
      accountId,
      amount,
      currency,
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks_connect'
    );

    expect(response.status()).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const payout = await queryPayoutByPayoutId(request, baseURL, payoutId);

    expect(payout).not.toBeNull();
    expect(payout.payout_id).toBe(payoutId);
    expect(payout.amount_cents).toBe(amount);
    expect(payout.currency).toBe(currency);
    expect(payout.state).toBe('paid');
    expect(payout.gateway_connected_account_id).toBe(accountId);

    // Cleanup payout record
    if (payout?.id) {
      await deleteRecord(request, baseURL, payout.id, 'modules/payments_stripe/payout');
    }
  });

  test('payout.paid for unknown connected account returns 202', async ({ request }) => {
    const unknownAccountId = `acct_unknown_${Date.now()}`;

    const event = createPayoutPaidEvent({
      payoutId: `po_test_${Date.now()}`,
      accountId: unknownAccountId,
      amount: 10000,
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks_connect'
    );

    expect(response.status()).toBe(202);
  });
});
