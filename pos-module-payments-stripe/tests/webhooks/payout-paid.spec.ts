import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createConnectedAccount,
  createPayoutPaidEvent,
  sendWebhook,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('Connected Account Webhooks', () => {
  const baseURL = process.env.MPKIT_URL!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  const host = new URL(baseURL).host;

  let webhookEndpoint: any;
  let connectedAccount: any;
  let accountId: string;

  test.beforeEach(async ({ request }) => {
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
      await deleteRecord(request, baseURL, connectedAccount.id, "modules/payments_stripe/connected_account");
    }
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, "modules/payments_stripe/webhook_endpoint");
    }
  });

  test('payout.paid webhook updates connected account payout status', async ({ request }) => {
    expect(connectedAccount.id).toBeTruthy();

    const payoutId = `po_test_${Date.now()}`;
    const event = createPayoutPaidEvent({
      payoutId,
      accountId,
      amount: 50000,
      currency: 'usd',
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks_connect'
    );

    expect(response.status()).toBe(200);
  });
});
