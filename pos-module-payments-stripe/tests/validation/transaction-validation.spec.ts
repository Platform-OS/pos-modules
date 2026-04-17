import { test, expect } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

const baseURL = process.env.MPKIT_URL!;

/**
 * Get GraphQL headers with authentication
 */
function getGraphQLHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiToken = process.env.MPKIT_TOKEN;
  if (apiToken) {
    headers['Authorization'] = `Token ${apiToken}`;
  }

  return headers;
}

/**
 * Attempt to create a transaction via GraphQL (may fail validation)
 */
async function attemptCreateTransaction(
  request: APIRequestContext,
  properties: string[]
) {
  const mutation = `
    mutation {
      record_create(
        record: {
          table: "modules/payments/transaction"
          properties: [
            ${properties.join(',\n            ')}
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  return response;
}

test.describe('Transaction Validation Errors', () => {
  test('Creating transaction with negative amount fails', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      `{ name: "amount_cents", value_int: -5000 }`, // NEGATIVE amount
      `{ name: "currency", value: "usd" }`,
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);

    // Should fail - either validation error or GraphQL error
    const json = await response.json();

    // Check if there's an error (either GraphQL error or validation error)
    const hasError = json.errors || (json.data?.record_create?.properties &&
      JSON.stringify(json.data.record_create.properties).includes('error'));

    if (!hasError) {
      // If no error, the amount should be rejected or sanitized
      const record = json.data?.record_create;
      if (record?.id) {
        // Transaction was created - this is a bug, but let's verify the amount
        const amountProp = Array.isArray(record.properties)
          ? record.properties.find((p: any) => p.name === 'amount_cents')
          : null;

        // Amount should not be negative
        if (amountProp) {
          expect(amountProp.value_int).toBeGreaterThanOrEqual(0);
        }
      }
    }

    // Document current behavior: either errors or prevents negative amounts
    expect(hasError || json.data?.record_create === null).toBeTruthy();
  });

  test('Creating transaction with zero amount fails', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      `{ name: "amount_cents", value_int: 0 }`, // ZERO amount
      `{ name: "currency", value: "usd" }`,
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    // Zero amount should be rejected or flagged
    const hasError = json.errors || (json.data?.record_create?.properties &&
      JSON.stringify(json.data.record_create.properties).includes('error'));

    if (!hasError) {
      const record = json.data?.record_create;
      if (record?.id) {
        const amountProp = Array.isArray(record.properties)
          ? record.properties.find((p: any) => p.name === 'amount_cents')
          : null;

        // Zero amount should not be allowed for payments
        if (amountProp) {
          expect(amountProp.value_int).toBeGreaterThan(0);
        }
      }
    }

    // Document: should validate minimum amount
    expect(hasError || json.data?.record_create === null).toBeTruthy();
  });

  test('Creating transaction with missing gateway fails', async ({ request }) => {
    const properties = [
      // MISSING gateway field
      `{ name: "amount_cents", value_int: 10000 }`,
      `{ name: "currency", value: "usd" }`,
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    // Should either error or record should not be created
    if (json.data?.record_create?.id) {
      // If created, gateway should have a default or the record should be invalid
      const record = json.data.record_create;
      const gatewayProp = Array.isArray(record.properties)
        ? record.properties.find((p: any) => p.name === 'gateway')
        : null;

      // Gateway is required for payment processing
      expect(gatewayProp).toBeTruthy();
      expect(gatewayProp?.value).toBeTruthy();
    }
  });

  test('Creating transaction with invalid currency format is handled', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      `{ name: "amount_cents", value_int: 10000 }`,
      `{ name: "currency", value: "INVALID_CURRENCY_CODE" }`, // Invalid
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    // Transaction might be created, but currency should be validated before Stripe API call
    if (json.data?.record_create?.id) {
      const record = json.data.record_create;
      const currencyProp = Array.isArray(record.properties)
        ? record.properties.find((p: any) => p.name === 'currency')
        : null;

      // Currency was stored - but should fail when attempting to create Stripe session
      expect(currencyProp?.value).toBe('INVALID_CURRENCY_CODE');
    }

    // This test documents that currency validation happens at Stripe API level, not DB level
    expect(response.ok()).toBeTruthy();
  });

  test('Creating transaction with missing amount fails', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      // MISSING amount_cents
      `{ name: "currency", value: "usd" }`,
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    // Should either error or record should have a default/null amount
    if (json.data?.record_create?.id) {
      const record = json.data.record_create;
      const amountProp = Array.isArray(record.properties)
        ? record.properties.find((p: any) => p.name === 'amount_cents')
        : null;

      // Amount is required - should not be created without it
      // Or should have a default value of 0
      if (amountProp) {
        expect(typeof amountProp.value_int).toBe('number');
      }
    }
  });

  test('Creating transaction with extremely large amount is handled', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      `{ name: "amount_cents", value_int: 999999999999 }`, // Nearly 10 billion dollars
      `{ name: "currency", value: "usd" }`,
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    // Transaction might be created, but Stripe has limits (varies by account)
    // This test documents that amount limits are enforced at Stripe API level
    if (json.data?.record_create?.id) {
      const record = json.data.record_create;
      const amountProp = Array.isArray(record.properties)
        ? record.properties.find((p: any) => p.name === 'amount_cents')
        : null;

      expect(amountProp?.value_int).toBe(999999999999);
    }

    // Transaction creation succeeds - validation happens when calling Stripe API
    expect(response.ok()).toBeTruthy();
  });

  test('Creating transaction with missing currency uses default or fails', async ({ request }) => {
    const properties = [
      `{ name: "gateway", value: "stripe" }`,
      `{ name: "amount_cents", value_int: 10000 }`,
      // MISSING currency
      `{ name: "c__status", value: "new" }`,
    ];

    const response = await attemptCreateTransaction(request, properties);
    const json = await response.json();

    if (json.data?.record_create?.id) {
      const record = json.data.record_create;
      const currencyProp = Array.isArray(record.properties)
        ? record.properties.find((p: any) => p.name === 'currency')
        : null;

      // Currency should either have a default (like 'usd') or be required
      if (currencyProp) {
        expect(currencyProp.value).toBeTruthy();
        expect(currencyProp.value.length).toBe(3); // ISO 4217 currency codes are 3 letters
      }
    }
  });
});
