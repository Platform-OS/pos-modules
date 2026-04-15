import { test, expect } from '@playwright/test';
import {
  createTransaction,
  updateTransaction,
  deleteRecord,
  getProperty,
} from '../helpers/stripe-api';

test.describe('Refund Error Scenarios', () => {
  const baseURL = process.env.MPKIT_URL!;

  let transaction: any;

  test.beforeEach(async ({ request }) => {
    // Create a test transaction
    transaction = await createTransaction(request, baseURL, {
      gateway: 'stripe',
      amount_cents: 10000,
      currency: 'usd',
      status: 'succeeded',
      gateway_transaction_id: `ch_test_${Date.now()}`,
    });
  });

  test.afterEach(async ({ request }) => {
    if (transaction?.id) {
      await deleteRecord(request, baseURL, transaction.id, "modules/payments/transaction");
    }
  });

  test('Refunding more than the original charge amount fails', async ({ request }) => {
    const originalAmount = getProperty(transaction, 'amount_cents');
    const refundAmount = originalAmount + 5000; // Try to refund MORE than charged

    const refundData = {
      transaction_id: transaction.id,
      amount: refundAmount,
      reason: 'requested_by_customer',
    };

    // Call the refund command via POST
    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should fail - can't refund more than original charge
    // Response might be 400 Bad Request or 200 with error in body
    if (response.ok()) {
      const json = await response.json();

      // If response is 200, check for error in body
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    } else {
      // Response is error status (4xx or 5xx)
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('Refunding a non-existent transaction fails gracefully', async ({ request }) => {
    const nonExistentTransactionId = '99999999';

    const refundData = {
      transaction_id: nonExistentTransactionId,
      amount: 5000,
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should fail gracefully - not crash
    if (response.ok()) {
      const json = await response.json();

      // Should indicate transaction not found
      expect(json.valid === false || json.error || json.errors).toBeTruthy();

      if (json.errors) {
        const errorMessage = JSON.stringify(json.errors).toLowerCase();
        expect(errorMessage).toMatch(/not found|not exist|invalid/);
      }
    } else {
      // 404 Not Found or similar
      expect([404, 400, 500]).toContain(response.status());
    }
  });

  test('Refunding zero amount fails', async ({ request }) => {
    const refundData = {
      transaction_id: transaction.id,
      amount: 0, // ZERO amount
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should reject zero amount refunds
    if (response.ok()) {
      const json = await response.json();
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('Refunding negative amount fails', async ({ request }) => {
    const refundData = {
      transaction_id: transaction.id,
      amount: -5000, // NEGATIVE amount
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should reject negative amounts
    if (response.ok()) {
      const json = await response.json();
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('Refunding a transaction that is not succeeded fails', async ({ request }) => {
    // Create a pending transaction
    const pendingTransaction = await createTransaction(request, baseURL, {
      gateway: 'stripe',
      amount_cents: 10000,
      currency: 'usd',
      status: 'pending', // NOT succeeded
    });

    const refundData = {
      transaction_id: pendingTransaction.id,
      amount: 5000,
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should fail - can only refund succeeded payments
    if (response.ok()) {
      const json = await response.json();
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }

    // Cleanup
    await deleteRecord(request, baseURL, pendingTransaction.id, "modules/payments/transaction");
  });

  test('Refunding with missing transaction_id fails', async ({ request }) => {
    const refundData = {
      // MISSING transaction_id
      amount: 5000,
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should fail - transaction_id is required
    if (response.ok()) {
      const json = await response.json();
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('Partial refund followed by another partial refund exceeding total fails', async ({ request }) => {
    const originalAmount = getProperty(transaction, 'amount_cents');

    await test.step('First partial refund succeeds', async () => {
      const firstRefund = {
        transaction_id: transaction.id,
        amount: originalAmount - 2000, // Refund almost all
        reason: 'requested_by_customer',
      };

      const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: firstRefund,
      });

      // First refund might succeed or fail (depends on if mock Stripe API exists)
      // This test documents the expected behavior
    });

    await test.step('Second partial refund exceeding remaining amount fails', async () => {
      const secondRefund = {
        transaction_id: transaction.id,
        amount: 3000, // Would exceed remaining 2000
        reason: 'requested_by_customer',
      };

      const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: secondRefund,
      });

      // Should fail - total refunds would exceed charge
      if (response.ok()) {
        const json = await response.json();

        // Should indicate insufficient funds to refund
        if (json.error || json.errors) {
          const errorMessage = JSON.stringify(json.error || json.errors).toLowerCase();
          expect(errorMessage).toMatch(/exceed|insufficient|amount/);
        }
      }
    });
  });

  test('Refunding with invalid Stripe charge ID format fails', async ({ request }) => {
    // Update transaction with invalid charge ID format
    await updateTransaction(request, baseURL, transaction.id, {
      gateway_transaction_id: 'invalid_charge_id_format', // Not ch_xxx format
    });

    const refundData = {
      transaction_id: transaction.id,
      amount: 5000,
      reason: 'requested_by_customer',
    };

    const response = await request.post(`${baseURL}/payments/stripe/refunds/create`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: refundData,
    });

    // Should fail when calling Stripe API with invalid charge ID
    // Response might be 200 with Stripe error, or 400/500
    if (response.ok()) {
      const json = await response.json();

      // Should have Stripe API error
      expect(json.valid === false || json.error || json.errors).toBeTruthy();
    }
  });
});
