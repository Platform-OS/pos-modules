import { test, expect } from '@playwright/test';
import {
  createWebhookEndpoint,
  createSetupIntent,
  createSetupIntentSucceededEvent,
  sendWebhook,
  deleteRecord,
  getProperty,
  getRequiredBaseURL,
  getHostFromBaseURL,
  querySetupIntentByGatewayId,
  queryCustomerByCustomerId,
  queryPaymentMethodByPaymentMethodId,
} from '../helpers/stripe-api';

test.describe('Setup Intent Webhooks', () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  let baseURL: string;
  let host: string;
  let webhookEndpoint: any;
  let setupIntent: any;
  let setupIntentId: string;

  test.beforeEach(async ({ request }) => {
    baseURL = getRequiredBaseURL();
    host = getHostFromBaseURL(baseURL);

    webhookEndpoint = await createWebhookEndpoint(request, baseURL, {
      url: `https://${host}/payments/stripe/webhooks`,
      secret: webhookSecret,
      livemode: false,
    });

    setupIntentId = `seti_test_${Date.now()}`;
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

    await new Promise(resolve => setTimeout(resolve, 1000));

    const updatedSetupIntent = await querySetupIntentByGatewayId(request, baseURL, setupIntentId);
    expect(updatedSetupIntent).not.toBeNull();
    expect(updatedSetupIntent.status).toContain('succeeded');

    const customer = await queryCustomerByCustomerId(request, baseURL, customerId);
    expect(customer).not.toBeNull();
    expect(customer.customer_id).toBe(customerId);
    expect(customer.reference_id).toBe(getProperty(setupIntent, 'reference_id'));

    const paymentMethod = await queryPaymentMethodByPaymentMethodId(request, baseURL, paymentMethodId);
    expect(paymentMethod).not.toBeNull();
    expect(paymentMethod.payment_method_id).toBe(paymentMethodId);
    expect(paymentMethod.customer_id).toBe(customerId);
  });
});
