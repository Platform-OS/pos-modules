import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createConnectedAccount,
  createAccountUpdatedEvent,
  sendWebhook,
  queryConnectedAccountByAccountId,
  deleteRecord,
  getRequiredBaseURL,
  getHostFromBaseURL,
} from '../helpers/stripe-api';

test.describe('Account Updated Webhook', () => {
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
    connectedAccount = await createConnectedAccount(request, baseURL, {
      account_id: accountId,
      reference_id: `ref_${Date.now()}`,
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

  test('account.updated with payouts and charges enabled sets state to verified', async ({ request }) => {
    const event = createAccountUpdatedEvent({
      accountId,
      payoutsEnabled: true,
      chargesEnabled: true,
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

    const updated = await queryConnectedAccountByAccountId(request, baseURL, accountId);
    expect(updated).not.toBeNull();
    expect(updated.state).toBe('verified');
  });

  test('account.updated without payouts enabled sets state to pending', async ({ request }) => {
    const event = createAccountUpdatedEvent({
      accountId,
      payoutsEnabled: false,
      chargesEnabled: true,
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

    const updated = await queryConnectedAccountByAccountId(request, baseURL, accountId);
    expect(updated).not.toBeNull();
    expect(updated.state).toBe('pending');
  });

  test('account.updated for unknown account returns 202', async ({ request }) => {
    const unknownAccountId = `acct_unknown_${Date.now()}`;

    const event = createAccountUpdatedEvent({
      accountId: unknownAccountId,
      payoutsEnabled: true,
      chargesEnabled: true,
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
