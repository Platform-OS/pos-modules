import { test, expect } from '@playwright/test';

test.describe('Payments gateway request receive logging', () => {
  test('persists received gateway request details', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run payments tests.').toBeTruthy();

    const unique = Date.now().toString();
    const response = await request.post('/test/payments/gateway-requests/receive', {
      form: {
        external_id: `external-${unique}`,
        name: 'webhook_payment_finished',
        request_url: `https://example.com/webhooks/${unique}`,
        stripe_account_name: 'acct_test_connected',
        gateway_object_id: `evt_${unique}`,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.gateway_request.valid).toBe(true);
    expect(body.persisted.id).toBeTruthy();
    expect(body.persisted.external_id).toBe(`external-${unique}`);
    expect(body.persisted.name).toBe('webhook_payment_finished');
    expect(body.persisted.request_url).toBe(`https://example.com/webhooks/${unique}`);
    expect(body.persisted.gateway_object_id).toBe(`evt_${unique}`);
    expect(body.persisted.stripe_account_name).toBe('acct_test_connected');

    const requestData = JSON.parse(body.persisted.request_data);
    expect(requestData).toEqual({
      id: `evt_${unique}`,
      object: 'event',
      source: 'payments-gateway-request-test',
    });
  });
});
