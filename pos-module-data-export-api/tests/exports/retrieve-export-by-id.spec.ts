import { test, expect } from '@playwright/test';
import { createExport, getExport } from '../helpers/api';

test.describe('Exports - Retrieve by ID', () => {
  test('should retrieve existing export by ID', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    // First create an export
    const { body: createBody } = await createExport(request, baseURL, apiKey);
    const exportId = (createBody as any).id;

    // Then retrieve it
    const { status, body } = await getExport(request, baseURL, apiKey, exportId);

    expect(status).toBe(200);
    expect(body).toHaveProperty('id', exportId);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('created_at');
  });

  test('should return 404 for non-existent export ID', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;
    const nonExistentId = 'non-existent-export-id-12345';

    const { status, body } = await getExport(request, baseURL, apiKey, nonExistentId);

    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
    expect((body as any).error).toContain('Export not found');
  });
});
