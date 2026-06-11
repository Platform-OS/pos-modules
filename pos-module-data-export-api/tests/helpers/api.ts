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
  error?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text);
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
    body: await parseResponseBody(response as unknown as Response),
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
    body: await parseResponseBody(response as unknown as Response),
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
    body: await parseResponseBody(response as unknown as Response),
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

    if (body && 'errors' in body) {
      throw new Error(`Export failed: ${JSON.stringify(body.errors)}`);
    }

    if (body && 'error' in body) {
      throw new Error(`Export failed: ${body.error}`);
    }

    if (body.status === 'completed' || body.status === 'failed') {
      return body;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Export did not complete within ${timeoutMs}ms`);
}
