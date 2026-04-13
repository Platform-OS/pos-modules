import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createSetupIntent,
  createSetupIntentSucceededEvent,
  sendWebhook,
  deleteRecord,
} from '../helpers/stripe-api';

test.describe('Setup Intent Webhooks', () => {
  const baseURL = process.env.MPKIT_URL!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  const host = new URL(baseURL).host;

  let webhookEndpoint: any;
  let setupIntent: any;

  test.beforeEach(async ({ request }) => {
    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks`,
      secret: webhookSecret,
      livemode: false,
    });

    const setupIntentId = `seti_test_${Date.now()}`;
    const referenceId = `ref_${Date.now()}`;
    setupIntent = await createSetupIntent(request, baseURL, {
      gateway_id: setupIntentId,
      reference_id: referenceId,
      status: 'pending',
    });
  });

  test.afterEach(async ({ request }) => {
    if (setupIntent?.id) {
      await deleteRecord(request, baseURL, setupIntent.id, "modules/payments_stripe/setup_intent");
    }
    if (webhookEndpoint?.id) {
      await deleteRecord(request, baseURL, webhookEndpoint.id, "modules/payments_stripe/webhook_endpoint");
    }
  });

  test('setup_intent.succeeded webhook processes payment method', async ({ request }) => {
    expect(setupIntent.id).toBeTruthy();

    const paymentMethodId = `pm_test_${Date.now()}`;
    const customerId = `cus_test_${Date.now()}`;
    const setupIntentId = setupIntent.properties?.gateway_id || `seti_test_${Date.now()}`;

    const event = createSetupIntentSucceededEvent({
      setupIntentId,
      paymentMethodId,
      customerId,
    });

    const response = await sendWebhook(
      request,
      baseURL,
      event,
      webhookSecret,
      '/payments/stripe/webhooks'
    );

    expect(response.status()).toBe(200);
  });
});
