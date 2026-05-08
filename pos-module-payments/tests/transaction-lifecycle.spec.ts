import { test, expect } from '@playwright/test';

test.describe('Payments transaction lifecycle', () => {
  test('creates a transaction and records status transitions without duplicating repeated status', async ({
    request,
    baseURL,
  }) => {
    expect(baseURL, 'MPKIT_URL must be set to run payments tests.').toBeTruthy();

    const unique = Date.now().toString();
    const response = await request.post('/test/payments/transactions/lifecycle', {
      form: {
        payable_ids: `payable-${unique}`,
        gateway: 'test_gateway',
        amount_cents: '1200',
        currency: 'USD',
        payer_id: `payer-${unique}`,
        gateway_transaction_id: `gateway-${unique}`,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.created.valid).toBe(true);
    expect(body.created.id).toBeTruthy();
    expect(body.created.payable_ids).toEqual([`payable-${unique}`]);
    expect(body.created.amount_cents).toBe(1200);
    expect(body.created.currency).toBe('USD');
    expect(body.created.gateway).toBe('test_gateway');
    expect(body.after_create.c__status).toBe('app.statuses.transactions.new');

    expect(body.pending.valid).toBe(true);
    expect(body.after_pending.c__status).toBe('app.statuses.transactions.pending');
    expect(body.after_pending.gateway_transaction_id).toBe(`gateway-${unique}`);

    const pendingStatuses = body.after_pending.statuses ?? [];
    expect(pendingStatuses.map((status: any) => status.name)).toContain(
      'app.statuses.transactions.pending'
    );

    const duplicateStatuses = body.after_duplicate_pending.statuses ?? [];
    expect(duplicateStatuses.length).toBe(pendingStatuses.length);
    expect(body.after_duplicate_pending.c__status).toBe('app.statuses.transactions.pending');
  });
});
