import { APIRequestContext } from '@playwright/test';

export interface ExportRequest {
  records_filter?: unknown;
  users_filter?: unknown;
  encryption?: unknown;
}

export interface ExportResponse {
  id: string;
  status: string;
  url?: string;
  created_at: string;
  updated_at?: string;
}

export interface ErrorResponse {
  errors: Record<string, string[]>;
}

/**
 * Create a new data export
 */
export async function createExport(
  request: APIRequestContext,
  baseURL: string,
  apiKey: string,
  exportData: ExportRequest = {}
): Promise<{ status: number; body: ExportResponse | ErrorResponse }> {
  const response = await request.post(`${baseURL}/_api/data-exports`, {
    headers: {
      'Content-Type': 'application/json',
      'API_KEY': apiKey,
    },
    data: exportData,
  });

  return {
    status: response.status(),
    body: await response.json(),
  };
}

/**
 * Retrieve an export by ID
 */
export async function getExport(
  request: APIRequestContext,
  baseURL: string,
  apiKey: string,
  exportId: string
): Promise<{ status: number; body: ExportResponse | ErrorResponse }> {
  const response = await request.get(`${baseURL}/_api/data-exports/${exportId}`, {
    headers: {
      'API_KEY': apiKey,
    },
  });

  return {
    status: response.status(),
    body: await response.json(),
  };
}

/**
 * Delete an export by ID
 */
export async function deleteExport(
  request: APIRequestContext,
  baseURL: string,
  apiKey: string,
  exportId: string
): Promise<{ status: number; body: any }> {
  const response = await request.delete(`${baseURL}/_api/data-exports/${exportId}`, {
    headers: {
      'API_KEY': apiKey,
    },
  });

  return {
    status: response.status(),
    body: response.status() === 204 ? null : await response.json(),
  };
}

/**
 * Poll export status until completion or timeout
 */
export async function waitForExportCompletion(
  request: APIRequestContext,
  baseURL: string,
  apiKey: string,
  exportId: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 1000
): Promise<ExportResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const { body } = await getExport(request, baseURL, apiKey, exportId);

    if ('errors' in body) {
      throw new Error(`Export failed: ${JSON.stringify(body.errors)}`);
    }

    if (body.status === 'completed' || body.status === 'failed') {
      return body;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Export did not complete within ${timeoutMs}ms`);
}
