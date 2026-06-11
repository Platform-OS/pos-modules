import { test, expect } from '@playwright/test';

test.describe('Payments transaction validation', () => {
  test('rejects transaction creation when required fields are missing', async ({
    request,
    baseURL,
  }) => {
    expect(baseURL, 'MPKIT_URL must be set to run payments tests.').toBeTruthy();

    const response = await request.post('/test/payments/transactions/invalid-create', {
      form: {
        currency: 'USD',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.valid).toBe(false);
    expect(body.id).toBeFalsy();
    expect(body.errors).toHaveProperty('payable_ids');
    expect(body.errors).toHaveProperty('amount_cents');
    expect(body.errors).toHaveProperty('gateway');
  });
});
