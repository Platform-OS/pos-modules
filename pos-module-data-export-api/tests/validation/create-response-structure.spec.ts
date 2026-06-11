import { test, expect } from '@playwright/test';
import { createExport } from '../helpers/api';

test.describe('Validation - Create Response Structure', () => {
  test('should return correct response structure on success', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    const { status, body } = await createExport(request, baseURL, apiKey);

    expect(status).toBe(200);

    // Verify required fields
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('created_at');

    // Verify field types
    expect(typeof (body as any).id).toBe('string');
    expect(typeof (body as any).status).toBe('string');
    expect(typeof (body as any).created_at).toBe('string');

    // Verify status is valid
    expect(['pending', 'processing', 'completed', 'failed']).toContain((body as any).status);
  });

  test('should have consistent timestamp format', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    const { body } = await createExport(request, baseURL, apiKey);

    // Verify ISO 8601 format
    const timestamp = (body as any).created_at;
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Verify it's a valid date
    const date = new Date(timestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  test('should have valid export ID format', async ({ request }) => {
    const baseURL = process.env.MPKIT_URL!;
    const apiKey = process.env.DATA_EXPORT_API_KEY!;

    const { body } = await createExport(request, baseURL, apiKey);

    const exportId = (body as any).id;
    expect(exportId).toBeTruthy();
    expect(typeof exportId).toBe('string');
    expect(exportId.length).toBeGreaterThan(0);
  });
});
