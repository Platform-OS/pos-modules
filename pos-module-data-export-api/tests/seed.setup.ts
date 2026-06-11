import { test as setup, expect } from '@playwright/test';

/**
 * Seed file for data-export-api tests
 * Validates test environment is ready
 *
 * Prerequisites:
 * 1. Run: bash tests/data/seed/seed.sh <env>
 * 2. Set: export MPKIT_URL="https://your-instance..."
 *
 * If DATA_EXPORT_API_KEY is not set, setup will try to set _data_export_api_key
 * via GraphQL using MPKIT_TOKEN and reuse that value for the suite.
 */
setup('env is configured', async ({ request }) => {
  // Verify required environment variables
  const baseURL = process.env.MPKIT_URL;
  expect(baseURL, 'MPKIT_URL environment variable must be set').toBeTruthy();

  if (!process.env.DATA_EXPORT_API_KEY) {
    const mpkitToken = process.env.MPKIT_TOKEN;
    expect(
      mpkitToken,
      'DATA_EXPORT_API_KEY is not set, so MPKIT_TOKEN must be set to initialize _data_export_api_key via GraphQL'
    ).toBeTruthy();

    expect(
      baseURL,
      'MPKIT_URL environment variable must be set'
    ).toBeTruthy();

    const apiKey = 'test-data-export-api-key';

    const response = await request.post(`${baseURL}/api/graph`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${mpkitToken}`,
      },
      data: {
        query: `
          mutation SetDataExportApiKey($name: String!, $value: String!) {
            variable: constant_set(name: $name, value: $value) {
              name
              value
            }
          }
        `,
        variables: {
          name: '_data_export_api_key',
          value: apiKey,
        },
      },
    });

    expect(
      response.ok(),
      'DATA_EXPORT_API_KEY is not set and GraphQL initialization of _data_export_api_key failed'
    ).toBeTruthy();

    const body = await response.json();

    expect(body.errors, `GraphQL initialization failed: ${JSON.stringify(body.errors)}`).toBeFalsy();
    expect(
      body?.data?.variable?.value,
      'DATA_EXPORT_API_KEY is not set and GraphQL did not return the initialized _data_export_api_key value'
    ).toBeTruthy();

    process.env.DATA_EXPORT_API_KEY = body.data.variable.value;
  }
});
