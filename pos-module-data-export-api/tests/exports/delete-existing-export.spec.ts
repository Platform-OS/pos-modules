import { test, expect } from '@playwright/test';
import { createExport, deleteExport, getExport } from '../helpers/api';

test.describe('Exports - Delete', () => {
  test('should delete existing export', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    // Create an export
    const { body: createBody } = await createExport(request, baseURL, apiKey);
    const exportId = (createBody as any).id;

    // Delete it
    const { status } = await deleteExport(request, baseURL, apiKey, exportId);

    expect(status).toBe(200);
  });
});
