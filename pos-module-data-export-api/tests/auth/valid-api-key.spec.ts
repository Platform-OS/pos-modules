import { test, expect } from '@playwright/test';
import { createExport } from '../helpers/api';

test.describe('Authentication - Valid API Key', () => {
  test('should accept request with valid API key', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    const { status, body } = await createExport(request, baseURL, apiKey);

    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('status');
  });
});
