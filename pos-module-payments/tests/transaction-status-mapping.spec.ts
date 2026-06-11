import { test, expect } from '@playwright/test';

test.describe('Payments transaction status mapping', () => {
  test('maps expired and unknown payment statuses to transaction statuses', async ({
    request,
    baseURL,
  }) => {
    expect(baseURL, 'MPKIT_URL must be set to run payments tests.').toBeTruthy();

    const unique = Date.now().toString();
    const response = await request.post('/test/payments/transactions/status-mapping', {
      form: {
        payable_ids: `status-payable-${unique}`,
        gateway: 'test_gateway',
        amount_cents: '1200',
        currency: 'USD',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.expired_created.valid).toBe(true);
    expect(body.expired.valid).toBe(true);
    expect(body.expired.c__status).toBe('app.statuses.transactions.expired');
    expect(body.after_expired.c__status).toBe('app.statuses.transactions.expired');

    expect(body.succeeded_created.valid).toBe(true);
    expect(body.succeeded.valid).toBe(true);
    expect(body.succeeded.c__status).toBe('app.statuses.transactions.succeeded');
    expect(body.after_succeeded.c__status).toBe('app.statuses.transactions.succeeded');

    expect(body.failed_created.valid).toBe(true);
    expect(body.unexpected.valid).toBe(true);
    expect(body.unexpected.c__status).toBe('app.statuses.transactions.failed');

    const expiredStatuses = body.after_expired.statuses ?? [];
    expect(expiredStatuses.map((status: any) => status.name)).toContain(
      'app.statuses.transactions.expired'
    );

    const succeededStatuses = body.after_succeeded.statuses ?? [];
    expect(succeededStatuses.map((status: any) => status.name)).toContain(
      'app.statuses.transactions.succeeded'
    );

    const unexpectedStatuses = body.after_unexpected.statuses ?? [];
    expect(unexpectedStatuses.map((status: any) => status.name)).toContain(
      'app.statuses.transactions.failed'
    );
  });
});
