import { test, expect } from '@playwright/test';
import { createExport } from '../helpers/api';

test.describe('Authentication - Invalid API Key', () => {
  test('should reject request with invalid API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const invalidApiKey = 'invalid-key-12345';

    const { status, body } = await createExport(request, baseURL, invalidApiKey);

    expect(status).toBe(401);
    expect(body).toHaveProperty('errors');
    expect((body as any).errors['401']).toContain('API_KEY header invalid');
  });

  test('should reject request with empty API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;

    const { status, body } = await createExport(request, baseURL, '');

    expect(status).toBe(401);
    expect(body).toHaveProperty('errors');
    expect((body as any).errors['401']).toContain('API_KEY header invalid');
  });

  test('should reject request with malformed API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const malformedKey = 'not-a-valid-key-format';

    const { status, body } = await createExport(request, baseURL, malformedKey);

    expect(status).toBe(401);
    expect(body).toHaveProperty('errors');
    expect((body as any).errors['401']).toContain('API_KEY header invalid');
  });
});
