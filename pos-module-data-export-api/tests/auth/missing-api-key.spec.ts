import { test, expect } from '@playwright/test';

test.describe('Authentication - Missing API Key', () => {
  test('should reject request without API key header', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;

    const response = await request.post(`${baseURL}/_api/data-exports`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('errors');
    expect(body.errors['401']).toContain('API_KEY header invalid');
  });

  test('should reject GET request without API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;

    const response = await request.get(`${baseURL}/_api/data-exports/test-id`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('errors');
    expect(body.errors['401']).toContain('API_KEY header invalid');
  });

  test('should reject DELETE request without API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;

    const response = await request.delete(`${baseURL}/_api/data-exports/test-id`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('errors');
    expect(body.errors['401']).toContain('API_KEY header invalid');
  });
});
