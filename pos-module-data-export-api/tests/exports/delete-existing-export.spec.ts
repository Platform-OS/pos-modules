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

    expect(status).toBe(204);

    // Verify it's deleted
    const { status: getStatus, body: getBody } = await getExport(
      request,
      baseURL,
      apiKey,
      exportId
    );

    expect(getStatus).toBe(404);
    expect(getBody).toHaveProperty('error');
    expect((getBody as any).error).toContain('Export not found');
  });

  test('should return 404 when deleting non-existent export', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;
    const nonExistentId = 'non-existent-id-12345';

    const { status, body } = await deleteExport(request, baseURL, apiKey, nonExistentId);

    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
    expect((body as any).error).toContain('Export not found');
  });
});
