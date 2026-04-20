import { test, expect } from '@playwright/test';
import { createExport, getExport, deleteExport } from '../helpers/api';

test.describe('Error Handling - Full Lifecycle', () => {
  test('should handle complete export lifecycle with error scenarios', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    // 1. Create export successfully
    const { status: createStatus, body: createBody } = await createExport(
      request,
      baseURL,
      apiKey
    );
    expect(createStatus).toBe(201);
    const exportId = (createBody as any).id;

    // 2. Retrieve it successfully
    const { status: getStatus } = await getExport(request, baseURL, apiKey, exportId);
    expect(getStatus).toBe(200);

    // 3. Try to delete with wrong API key (should fail)
    const { status: deleteFailStatus } = await deleteExport(
      request,
      baseURL,
      'wrong-api-key',
      exportId
    );
    expect(deleteFailStatus).toBe(401);

    // 4. Delete with correct API key (should succeed)
    const { status: deleteStatus } = await deleteExport(request, baseURL, apiKey, exportId);
    expect(deleteStatus).toBe(204);

    // 5. Try to retrieve deleted export (should fail)
    const { status: getFinalStatus } = await getExport(request, baseURL, apiKey, exportId);
    expect(getFinalStatus).toBe(404);
  });

  test('should handle duplicate delete attempts gracefully', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    // Create and delete export
    const { body: createBody } = await createExport(request, baseURL, apiKey);
    const exportId = (createBody as any).id;

    const { status: firstDelete } = await deleteExport(request, baseURL, apiKey, exportId);
    expect(firstDelete).toBe(204);

    // Try to delete again
    const { status: secondDelete } = await deleteExport(request, baseURL, apiKey, exportId);
    expect(secondDelete).toBe(404);
  });

  test('should handle concurrent requests to same export', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    // Create export
    const { body: createBody } = await createExport(request, baseURL, apiKey);
    const exportId = (createBody as any).id;

    // Make multiple concurrent GET requests
    const requests = Array(5)
      .fill(null)
      .map(() => getExport(request, baseURL, apiKey, exportId));

    const results = await Promise.all(requests);

    // All should succeed
    results.forEach(result => {
      expect(result.status).toBe(200);
      expect((result.body as any).id).toBe(exportId);
    });

    // Cleanup
    await deleteExport(request, baseURL, apiKey, exportId);
  });
});
